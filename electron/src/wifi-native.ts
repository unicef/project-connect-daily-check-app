/**
 * Fills the Wi-Fi fields `si.wifiConnections()` loses on non-English Windows.
 *
 * On Windows, systeminformation runs `netsh wlan show interfaces` and finds each
 * value by its label text. It only knows the English, French and German labels
 * (plus "Canal"), so on a Russian, Spanish, Uzbek, Kazakh… display language the
 * signal, channel, frequency, transmit rate and radio type come back empty while
 * the SSID, BSSID and interface GUID — which are never translated, or are read by
 * position — survive. Coverage of those fields was therefore a filter on the
 * Windows display language rather than anything about the school's network.
 *
 * This reads the same values from the native WLAN API (wlanapi.dll), which
 * returns numbers instead of localized text, and fills only the fields that
 * came back empty. Values are converted exactly the way systeminformation
 * converts the English netsh output, so a filled row means the same thing as a
 * row from an English machine:
 *
 *   quality      = signal quality, 0–100 (netsh "Signal")
 *   signalLevel  = quality / 2 − 100 dBm
 *   channel      = current channel number
 *   frequency    = MHz from the channel, same table as systeminformation
 *   txRate       = transmit rate in Mbps, integer
 *   type         = radio type, e.g. "802.11ac"
 *
 * The native read only runs when a connection is missing one of those fields,
 * so an English machine pays nothing for it. It fails soft: PowerShell blocked,
 * Add-Type unavailable or the API refusing simply leaves the fields as they were.
 */

import { execFile } from 'child_process';

/** One connected interface as the native WLAN API reports it. */
export interface NativeWlanConnection {
  Id?: string;
  Ssid?: string;
  Bssid?: string;
  SignalQuality?: number;
  TxRateKbps?: number;
  PhyType?: number;
  Channel?: number;
}

/** Fields of a `si.wifiConnections()` entry this module reads or fills. */
export interface WifiConnection {
  id?: string;
  bssid?: string;
  channel?: number | null;
  frequency?: number | null;
  type?: string | null;
  signalLevel?: number | null;
  quality?: number | null;
  txRate?: number | null;
  /** Set when any field below came from the native WLAN API. */
  nativeFilled?: string[];
}

const NATIVE_TIMEOUT_MS = 15000;

/**
 * C# 5 (what Windows PowerShell 5.1's Add-Type compiles) reading the current
 * connection of every connected WLAN interface. Structures are read at fixed
 * offsets rather than marshalled: they contain no pointers, so the offsets are
 * the same on 32- and 64-bit Windows.
 *
 *   WLAN_INTERFACE_INFO_LIST: count @0, items @8, each 532 bytes
 *     (GUID 16 + WCHAR[256] description + state @528)
 *   WLAN_CONNECTION_ATTRIBUTES: SSID length @520, SSID @524, BSSID @560,
 *     PHY type @568, signal quality @576, rx rate @580, tx rate @584 (kbps)
 */
const WLAN_READER_CS = `
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
}

public static class GigaWlanReader {
  [DllImport("wlanapi.dll")] static extern int WlanOpenHandle(uint version, IntPtr reserved, out uint negotiated, out IntPtr handle);
  [DllImport("wlanapi.dll")] static extern int WlanCloseHandle(IntPtr handle, IntPtr reserved);
  [DllImport("wlanapi.dll")] static extern int WlanEnumInterfaces(IntPtr handle, IntPtr reserved, out IntPtr list);
  [DllImport("wlanapi.dll")] static extern int WlanQueryInterface(IntPtr handle, ref Guid iface, int opcode, IntPtr reserved, out uint size, out IntPtr data, IntPtr valueType);
  [DllImport("wlanapi.dll")] static extern void WlanFreeMemory(IntPtr memory);

  const int OpCurrentConnection = 7;
  const int OpChannelNumber = 8;
  const int InterfaceInfoSize = 532;
  const int StateConnected = 1;

  static IntPtr At(IntPtr p, int offset) { return new IntPtr(p.ToInt64() + offset); }

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
            byte[] mac = new byte[6];
            Marshal.Copy(At(data, 560), mac, 0, 6);
            c.Bssid = BitConverter.ToString(mac).Replace('-', ':').ToLowerInvariant();
            c.PhyType = Marshal.ReadInt32(data, 568);
            c.SignalQuality = Marshal.ReadInt32(data, 576);
            c.TxRateKbps = Marshal.ReadInt32(data, 584);
          } finally { WlanFreeMemory(data); }
        }
        if (WlanQueryInterface(handle, ref guid, OpChannelNumber, IntPtr.Zero, out size, out data, IntPtr.Zero) == 0 && data != IntPtr.Zero) {
          try { c.Channel = Marshal.ReadInt32(data, 0); } finally { WlanFreeMemory(data); }
        }
        result.Add(c);
      }
    } finally {
      if (list != IntPtr.Zero) WlanFreeMemory(list);
      WlanCloseHandle(handle, IntPtr.Zero);
    }
    return result;
  }
}
`;

const WLAN_READER_PS = [
  "$ErrorActionPreference = 'Stop'",
  `Add-Type -TypeDefinition @'\n${WLAN_READER_CS}\n'@`,
  // @() keeps a single interface an array; -InputObject stops PowerShell from
  // unrolling it, so the output is always a JSON array.
  'ConvertTo-Json -InputObject @([GigaWlanReader]::Read()) -Compress',
].join('\n');

/** DOT11_PHY_TYPE → the "Radio type" English netsh prints. */
const PHY_TYPE_NAMES: Record<number, string> = {
  4: '802.11a',
  5: '802.11b',
  6: '802.11g',
  7: '802.11n',
  8: '802.11ac',
  9: '802.11ad',
  10: '802.11ax',
  11: '802.11be',
};

/**
 * Channel → MHz, the same table systeminformation uses for the English netsh
 * output, so filled rows and English rows agree (including on channels the
 * table does not know, which stay null).
 */
const CHANNEL_FREQUENCIES: Record<number, number> = (() => {
  const table: Record<number, number> = {};
  for (let ch = 1; ch <= 13; ch++) table[ch] = 2407 + 5 * ch;
  table[14] = 2484;
  const fiveGhz = [
    32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64, 68, 96,
    100, 102, 104, 106, 108, 110, 112, 114, 116, 118, 120, 122, 124, 126, 128,
    132, 134, 136, 138, 140, 142, 144, 149, 151, 153, 155, 157, 159, 161, 165,
    169, 173,
  ];
  for (const ch of fiveGhz) table[ch] = 5000 + 5 * ch;
  for (const ch of [183, 184, 185, 187, 188, 189, 192, 196]) table[ch] = 4000 + 5 * ch;
  return table;
})();

export function frequencyFromChannel(channel: number): number | null {
  return CHANNEL_FREQUENCIES[channel] ?? null;
}

/** systeminformation's quality → dBm conversion for the netsh "Signal" %. */
export function signalLevelFromQuality(quality: number): number {
  if (quality < 0) return 0;
  if (quality >= 100) return -50;
  return quality / 2 - 100;
}

const isMissing = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  value === '' ||
  (typeof value === 'number' && !Number.isFinite(value));

/**
 * True when any connection lost a field the native API can fill. `channel` 0
 * counts as lost: that is what systeminformation stores when it cannot find
 * the channel label.
 */
export function needsNativeFill(connections: WifiConnection[]): boolean {
  return connections.some(
    (c) =>
      isMissing(c.quality) ||
      isMissing(c.signalLevel) ||
      isMissing(c.channel) ||
      c.channel === 0 ||
      isMissing(c.frequency) ||
      isMissing(c.txRate) ||
      isMissing(c.type)
  );
}

const normalizeGuid = (value: unknown): string =>
  String(value ?? '').replace(/[{}]/g, '').trim().toLowerCase();

const normalizeMac = (value: unknown): string =>
  String(value ?? '').replace(/-/g, ':').trim().toLowerCase();

function matchNative(
  connection: WifiConnection,
  native: NativeWlanConnection[],
  onlyOne: boolean
): NativeWlanConnection | undefined {
  const id = normalizeGuid(connection.id);
  const byId = id && native.find((n) => normalizeGuid(n.Id) === id);
  if (byId) return byId;
  const bssid = normalizeMac(connection.bssid);
  const byBssid = bssid && native.find((n) => normalizeMac(n.Bssid) === bssid);
  if (byBssid) return byBssid;
  // One connection on each side is the same adapter; nothing else to match on.
  return onlyOne && native.length === 1 ? native[0] : undefined;
}

/**
 * Fills, in place, the fields each connection is missing from its native
 * reading. Never overwrites a value systeminformation already parsed. Returns
 * the same array for convenience.
 */
export function fillFromNative(
  connections: WifiConnection[],
  native: NativeWlanConnection[]
): WifiConnection[] {
  if (!Array.isArray(native) || native.length === 0) return connections;

  for (const connection of connections) {
    const n = matchNative(connection, native, connections.length === 1);
    if (!n) continue;
    const filled: string[] = [];

    const quality = n.SignalQuality;
    if (typeof quality === 'number' && quality >= 0 && quality <= 100) {
      if (isMissing(connection.quality)) {
        connection.quality = quality;
        filled.push('quality');
      }
      if (isMissing(connection.signalLevel)) {
        connection.signalLevel = signalLevelFromQuality(connection.quality as number);
        filled.push('signalLevel');
      }
    }

    if (
      (isMissing(connection.channel) || connection.channel === 0) &&
      typeof n.Channel === 'number' &&
      n.Channel > 0
    ) {
      connection.channel = n.Channel;
      filled.push('channel');
    }
    if (
      isMissing(connection.frequency) &&
      typeof connection.channel === 'number' &&
      connection.channel > 0
    ) {
      const frequency = frequencyFromChannel(connection.channel);
      if (frequency !== null) {
        connection.frequency = frequency;
        filled.push('frequency');
      }
    }

    if (isMissing(connection.txRate) && typeof n.TxRateKbps === 'number' && n.TxRateKbps > 0) {
      connection.txRate = Math.floor(n.TxRateKbps / 1000);
      filled.push('txRate');
    }

    const radioType = typeof n.PhyType === 'number' ? PHY_TYPE_NAMES[n.PhyType] : undefined;
    if (isMissing(connection.type) && radioType) {
      connection.type = radioType;
      filled.push('type');
    }

    if (filled.length > 0) {
      connection.nativeFilled = filled;
    }
  }

  return connections;
}

/**
 * Reads the connected interfaces from wlanapi.dll through PowerShell.
 * Resolves to an empty list on any failure.
 */
export function readNativeWlan(): Promise<NativeWlanConnection[]> {
  if (process.platform !== 'win32') return Promise.resolve([]);

  // -EncodedCommand (UTF-16LE base64) sidesteps quoting the C# source.
  const encoded = Buffer.from(WLAN_READER_PS, 'utf16le').toString('base64');
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { timeout: NATIVE_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          console.warn('[wifi-native] WLAN API read unavailable:', error.message);
          resolve([]);
          return;
        }
        try {
          const text = String(stdout).trim();
          const parsed = text ? JSON.parse(text) : [];
          resolve(Array.isArray(parsed) ? parsed : [parsed]);
        } catch (parseError) {
          console.warn('[wifi-native] WLAN API output unreadable:', parseError?.message);
          resolve([]);
        }
      }
    );
  });
}

/**
 * Completes `si.wifiConnections()` output with the native reading when a field
 * is missing. Returns the connections unchanged on a healthy (English) read or
 * when the native read fails.
 */
export async function completeWifiConnections<T extends object>(
  connections: T[]
): Promise<T[]> {
  if (!Array.isArray(connections) || connections.length === 0) return connections;
  const entries = connections as unknown as WifiConnection[];
  if (!needsNativeFill(entries)) return connections;

  fillFromNative(entries, await readNativeWlan());
  return connections;
}
