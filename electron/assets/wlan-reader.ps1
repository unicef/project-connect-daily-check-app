# Reads the current connection of every connected WLAN interface from the native
# WLAN API (wlanapi.dll) and prints it as a JSON array.
#
# Run by electron/src/wifi-native.ts with `powershell.exe -File` to fill the Wi-Fi
# fields systeminformation loses on non-English Windows. The script ships as a
# plain file (unpacked from app.asar) so it can run with -File instead of an
# encoded command.
#
# The C# is C# 5, what Windows PowerShell 5.1's Add-Type compiles. Structures are
# read at fixed offsets rather than marshalled: they contain no pointers, so the
# offsets are the same on 32- and 64-bit Windows.
#
#   WLAN_INTERFACE_INFO_LIST: count @0, items @8, each 532 bytes
#     (GUID 16 + WCHAR[256] description + state @528)
#   WLAN_CONNECTION_ATTRIBUTES: SSID length @520, SSID @524, BSSID @560,
#     PHY type @568, signal quality @576, rx rate @580, tx rate @584 (kbps)
#   WLAN_BSS_LIST: total size @0, item count @4, items @8, each 360 bytes
#     WLAN_BSS_ENTRY: BSSID @40, center frequency @92 (kHz)

$ErrorActionPreference = 'Stop'
# Keeps the "Preparing modules for first use" progress record out of stderr.
$ProgressPreference = 'SilentlyContinue'

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public class GigaWlanConnection {
  public string Id { get; set; }
  public string Ssid { get; set; }
  public string Bssid { get; set; }
  public int SignalQuality { get; set; }
  public int TxRateKbps { get; set; }
  public int PhyType { get; set; }
  public int Channel { get; set; }
  public int CenterFrequencyMHz { get; set; }
}

public static class GigaWlanReader {
  [DllImport("wlanapi.dll")] static extern int WlanOpenHandle(uint version, IntPtr reserved, out uint negotiated, out IntPtr handle);
  [DllImport("wlanapi.dll")] static extern int WlanCloseHandle(IntPtr handle, IntPtr reserved);
  [DllImport("wlanapi.dll")] static extern int WlanEnumInterfaces(IntPtr handle, IntPtr reserved, out IntPtr list);
  [DllImport("wlanapi.dll")] static extern int WlanQueryInterface(IntPtr handle, ref Guid iface, int opcode, IntPtr reserved, out uint size, out IntPtr data, IntPtr valueType);
  [DllImport("wlanapi.dll")] static extern int WlanGetNetworkBssList(IntPtr handle, ref Guid iface, IntPtr ssid, int bssType, bool securityEnabled, IntPtr reserved, out IntPtr list);
  [DllImport("wlanapi.dll")] static extern void WlanFreeMemory(IntPtr memory);

  const int OpCurrentConnection = 7;
  const int OpChannelNumber = 8;
  const int InterfaceInfoSize = 532;
  const int BssEntrySize = 360;
  const int StateConnected = 1;
  const int BssTypeInfrastructure = 1;

  static IntPtr At(IntPtr p, int offset) { return new IntPtr(p.ToInt64() + offset); }

  static string ReadMac(IntPtr p, int offset) {
    byte[] mac = new byte[6];
    Marshal.Copy(At(p, offset), mac, 0, 6);
    return BitConverter.ToString(mac).Replace('-', ':').ToLowerInvariant();
  }

  // Center frequency of the BSS the interface is connected to, from the cached
  // scan list. The channel number alone cannot tell 6 GHz from 2.4/5 GHz.
  static int CenterFrequencyMHz(IntPtr handle, Guid guid, string bssid) {
    IntPtr list;
    if (bssid == null || WlanGetNetworkBssList(handle, ref guid, IntPtr.Zero, BssTypeInfrastructure, false, IntPtr.Zero, out list) != 0 || list == IntPtr.Zero) return -1;
    try {
      int items = Marshal.ReadInt32(list, 4);
      for (int i = 0; i < items; i++) {
        IntPtr entry = At(list, 8 + i * BssEntrySize);
        if (ReadMac(entry, 40) == bssid) return Marshal.ReadInt32(entry, 92) / 1000;
      }
      return -1;
    } finally { WlanFreeMemory(list); }
  }

  public static List<GigaWlanConnection> Read() {
    List<GigaWlanConnection> result = new List<GigaWlanConnection>();
    uint negotiated;
    IntPtr handle;
    if (WlanOpenHandle(2, IntPtr.Zero, out negotiated, out handle) != 0) return result;
    IntPtr list = IntPtr.Zero;
    try {
      if (WlanEnumInterfaces(handle, IntPtr.Zero, out list) != 0 || list == IntPtr.Zero) return result;
      int count = Marshal.ReadInt32(list, 0);
      for (int i = 0; i < count; i++) {
        IntPtr item = At(list, 8 + i * InterfaceInfoSize);
        if (Marshal.ReadInt32(item, 528) != StateConnected) continue;
        byte[] guidBytes = new byte[16];
        Marshal.Copy(item, guidBytes, 0, 16);
        Guid guid = new Guid(guidBytes);

        GigaWlanConnection c = new GigaWlanConnection();
        c.Id = guid.ToString();
        c.SignalQuality = -1;
        c.TxRateKbps = -1;
        c.Channel = -1;
        c.CenterFrequencyMHz = -1;

        uint size;
        IntPtr data;
        if (WlanQueryInterface(handle, ref guid, OpCurrentConnection, IntPtr.Zero, out size, out data, IntPtr.Zero) == 0 && data != IntPtr.Zero) {
          try {
            int ssidLength = Marshal.ReadInt32(data, 520);
            if (ssidLength > 0 && ssidLength <= 32) {
              byte[] ssid = new byte[ssidLength];
              Marshal.Copy(At(data, 524), ssid, 0, ssidLength);
              c.Ssid = Encoding.UTF8.GetString(ssid);
            }
            c.Bssid = ReadMac(data, 560);
            c.PhyType = Marshal.ReadInt32(data, 568);
            c.SignalQuality = Marshal.ReadInt32(data, 576);
            c.TxRateKbps = Marshal.ReadInt32(data, 584);
          } finally { WlanFreeMemory(data); }
        }
        if (WlanQueryInterface(handle, ref guid, OpChannelNumber, IntPtr.Zero, out size, out data, IntPtr.Zero) == 0 && data != IntPtr.Zero) {
          try { c.Channel = Marshal.ReadInt32(data, 0); } finally { WlanFreeMemory(data); }
        }
        c.CenterFrequencyMHz = CenterFrequencyMHz(handle, guid, c.Bssid);
        result.Add(c);
      }
    } finally {
      if (list != IntPtr.Zero) WlanFreeMemory(list);
      WlanCloseHandle(handle, IntPtr.Zero);
    }
    return result;
  }
}
'@

# @() keeps a single interface an array; -InputObject stops PowerShell from
# unrolling it, so the output is always a JSON array.
ConvertTo-Json -InputObject @([GigaWlanReader]::Read()) -Compress
