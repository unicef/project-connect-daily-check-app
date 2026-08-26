/**
 * Network and device context captured next to a measurement (research plan 0008).
 *
 * Two things live here:
 *
 * 1. `getDeviceNetworkInformation()` — the volatile per-measurement context the
 *    ticket asked for and that no column covered: DNS, default gateway,
 *    connection type, VPN inference, IP family, rx/tx bytes, plus the cheap
 *    performance context around the test (CPU load, free memory, free disk).
 *
 * 2. `classifyWifiUnavailable()` / `getSsidFromNlm()` — the diagnosis for the
 *    finding that motivated the research: on Windows 11 24H2+ the WLAN stack is
 *    gated behind the Location services permission, so `si.wifiConnections()`
 *    comes back EMPTY on a machine that is connected over Wi-Fi. The app cannot
 *    prompt its way out (WinRT returns Denied with no dialog while the master
 *    toggle is off), but it can say *why* the data is missing, and it can still
 *    read the SSID through the ungated Network Location Manager profile.
 *
 * Cost discipline. The research measured every call on a real Windows machine:
 * `networkInterfaces` (~1100 ms), `cpu` (~1700 ms) and `diskLayout` (~2100 ms)
 * are far too expensive to run per measurement, so everything derived from them
 * is computed once and cached, keyed on the default gateway so that moving to a
 * different network recomputes it. The per-measurement calls are the cheap ones
 * and they run concurrently, which keeps the added wall-clock well inside the
 * 1.5 s budget the plan set.
 *
 * Every capture fails soft: a blocked PowerShell policy or a missing adapter
 * yields a null field, never a thrown error — a measurement must never fail
 * because the diagnostics could not be read.
 */

import { execFile } from 'child_process';
import * as si from 'systeminformation';

/** Volatile context stored as `device_network_information` on the measurement. */
export interface DeviceNetworkInformation {
  connection_type?: string;
  default_gateway?: string;
  dns_servers?: string[];
  ip_family?: string;
  vpn_likely?: boolean;
  vpn_adapter?: string;
  link_speed_mbps?: number;
  net_bytes_rx?: number;
  net_bytes_tx?: number;
  cpu_load_percent?: number;
  memory_available_mb?: number;
  disk_free_mb?: number;
}

/** Why `wifi_connections` came back empty. Mirrors the backend's whitelist. */
export type WifiUnavailableReason =
  | 'no_adapter'
  | 'wlan_service_off'
  | 'location_disabled'
  | 'unknown';

const EXEC_TIMEOUT_MS = 10000;

/** VPN heuristic: virtual adapters plus well-known VPN driver/interface names. */
const VPN_NAME_PATTERN =
  /(tap|tun|wintun|wireguard|openvpn|anyconnect|cisco|zerotier|tailscale|nordlynx|hamachi|fortissl|fortinet|globalprotect|pangp|juniper|pulse|l2tp|sstp|ikev2)/i;

const BYTES_PER_MB = 1024 * 1024;

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { timeout: EXEC_TIMEOUT_MS, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(String(stdout)))
    );
  });
}

function runPowershellJson(psCommand: string): Promise<any> {
  return run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `${psCommand} | ConvertTo-Json -Depth 4 -Compress`,
  ]).then((stdout) => {
    const text = stdout.trim();
    if (!text) return null;
    return JSON.parse(text);
  });
}

/** Resolves to null instead of rejecting, so one blocked call cannot sink the rest. */
async function soft<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    console.warn(`[device-context] ${label} unavailable:`, error?.message ?? error);
    return null;
  }
}

function toMb(bytes: unknown): number | undefined {
  return typeof bytes === 'number' && Number.isFinite(bytes)
    ? Math.round(bytes / BYTES_PER_MB)
    : undefined;
}

function round(value: unknown, decimals = 1): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Expensive, slow-moving half: derived from networkInterfaces + DNS, cached.
// ---------------------------------------------------------------------------

interface CachedNetworkShape {
  gateway: string | null;
  connection_type?: string;
  ip_family?: string;
  vpn_likely?: boolean;
  vpn_adapter?: string;
  link_speed_mbps?: number;
  dns_servers?: string[];
  /** Name of the wireless adapter, used by the Wi-Fi diagnosis below. */
  wirelessAlias?: string;
  hasWirelessAdapter: boolean;
}

let cachedShape: CachedNetworkShape | null = null;

function pickDefaultInterface(interfaces: si.Systeminformation.NetworkInterfacesData[]) {
  return (
    interfaces.find((iface) => iface.default) ??
    interfaces.find((iface) => iface.operstate === 'up' && !iface.internal && iface.ip4) ??
    null
  );
}

function inferConnectionType(iface: si.Systeminformation.NetworkInterfacesData | null) {
  if (!iface) return undefined;
  if (iface.type === 'wireless') return 'wifi';
  if (iface.type === 'wired') return 'ethernet';
  return 'unknown';
}

function inferIpFamily(iface: si.Systeminformation.NetworkInterfacesData | null) {
  if (!iface) return undefined;
  const hasV4 = Boolean(iface.ip4);
  const hasV6 = Boolean(iface.ip6);
  if (hasV4 && hasV6) return 'dual';
  if (hasV4) return 'v4';
  if (hasV6) return 'v6';
  return undefined;
}

function inferVpn(interfaces: si.Systeminformation.NetworkInterfacesData[]) {
  const candidate = interfaces.find(
    (iface) =>
      iface.operstate === 'up' &&
      (iface.virtual === true ||
        VPN_NAME_PATTERN.test(iface.ifaceName || '') ||
        VPN_NAME_PATTERN.test(iface.iface || ''))
  );
  return {
    vpn_likely: Boolean(candidate),
    vpn_adapter: candidate ? candidate.ifaceName || candidate.iface : undefined,
  };
}

/**
 * DNS servers of the active interfaces.
 *
 * `si.networkInterfaces()` does not expose them on Windows, so this shells out to
 * PowerShell (~1 s in the research runs) — which is exactly why it sits on the
 * cached side and never in the per-measurement path.
 */
async function readDnsServers(): Promise<string[] | undefined> {
  const result = await soft('DNS servers', () =>
    runPowershellJson(
      'Get-DnsClientServerAddress -AddressFamily IPv4 | ' +
        'Where-Object {$_.ServerAddresses} | Select-Object -ExpandProperty ServerAddresses'
    )
  );
  if (!result) return undefined;
  const list = (Array.isArray(result) ? result : [result])
    .filter((item): item is string => typeof item === 'string' && item !== '')
    // Loopback entries are the local resolver stub, not a configured server.
    .filter((item) => !item.startsWith('127.'));
  return list.length > 0 ? Array.from(new Set(list)) : undefined;
}

/**
 * The slow-moving half of the context, recomputed only when the default gateway
 * changes — i.e. when the machine moves to a different network.
 */
async function getNetworkShape(gateway: string | null): Promise<CachedNetworkShape> {
  if (cachedShape && cachedShape.gateway === gateway) {
    return cachedShape;
  }

  const interfaces = (await soft('network interfaces', () => si.networkInterfaces())) ?? [];
  const list = Array.isArray(interfaces) ? interfaces : [interfaces];
  const active = pickDefaultInterface(list);
  const wireless = list.find((iface) => iface.type === 'wireless');
  const { vpn_likely, vpn_adapter } = inferVpn(list);

  cachedShape = {
    gateway,
    connection_type: inferConnectionType(active),
    ip_family: inferIpFamily(active),
    vpn_likely,
    vpn_adapter,
    link_speed_mbps:
      active && typeof active.speed === 'number' && active.speed > 0
        ? active.speed
        : undefined,
    dns_servers: await readDnsServers(),
    wirelessAlias: wireless ? wireless.ifaceName || wireless.iface : undefined,
    hasWirelessAdapter: Boolean(wireless),
  };

  return cachedShape;
}

/** Drops the internal bookkeeping before the shape goes into the payload. */
function shapeToPayload(shape: CachedNetworkShape): Partial<DeviceNetworkInformation> {
  return {
    connection_type: shape.connection_type,
    ip_family: shape.ip_family,
    vpn_likely: shape.vpn_likely,
    vpn_adapter: shape.vpn_adapter,
    link_speed_mbps: shape.link_speed_mbps,
    dns_servers: shape.dns_servers,
  };
}

// ---------------------------------------------------------------------------
// Per-measurement capture
// ---------------------------------------------------------------------------

/**
 * Captures the volatile network/system context for one measurement.
 *
 * The cheap calls run concurrently: they are independent I/O, and serialising
 * them is what would push the capture past the 1.5 s budget.
 */
export async function getDeviceNetworkInformation(): Promise<DeviceNetworkInformation> {
  const [gateway, stats, load, memory, disks] = await Promise.all([
    soft('default gateway', () => si.networkGatewayDefault()),
    soft('network stats', () => si.networkStats()),
    soft('cpu load', () => si.currentLoad()),
    soft('memory', () => si.mem()),
    soft('filesystems', () => si.fsSize()),
  ]);

  const shape = await getNetworkShape(gateway || null);

  const primaryStats = Array.isArray(stats) ? stats[0] : stats;
  // Free space on the volume the OS lives on; a machine with several volumes
  // would otherwise report whichever one happened to come back first.
  const systemDisk = Array.isArray(disks)
    ? disks.find((fs) => /^[a-z]:/i.test(fs.mount) && fs.mount.toUpperCase().startsWith('C')) ??
      disks[0]
    : null;

  const context: DeviceNetworkInformation = {
    ...shapeToPayload(shape),
    default_gateway: gateway || undefined,
    net_bytes_rx: primaryStats?.rx_bytes ?? undefined,
    net_bytes_tx: primaryStats?.tx_bytes ?? undefined,
    cpu_load_percent: round(load?.currentLoad),
    memory_available_mb: toMb(memory?.available),
    disk_free_mb: toMb(systemDisk?.available),
  };

  // Undefined keys would serialise as absent anyway, but stripping them keeps the
  // stored Json to the fields that were actually readable on this machine.
  Object.keys(context).forEach((key) => {
    if (context[key] === undefined) delete context[key];
  });

  return context;
}

// ---------------------------------------------------------------------------
// Wi-Fi unavailability diagnosis
// ---------------------------------------------------------------------------

/**
 * Reads one `CapabilityAccessManager\ConsentStore\location` value.
 *
 * HKLM is the system-wide Location master toggle; HKCU\...\NonPackaged is the
 * per-user permission that covers desktop (unpackaged) apps such as this one.
 * Either being off is enough to blank the WLAN stack.
 *
 * @returns the raw value ('Allow' / 'Deny'), or null when the key is unreadable.
 */
async function readLocationConsent(hive: 'HKLM' | 'HKCU'): Promise<string | null> {
  const key =
    hive === 'HKLM'
      ? 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location'
      : 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location\\NonPackaged';

  const stdout = await soft(`${hive} location consent`, () =>
    run('reg.exe', ['query', key, '/v', 'Value'])
  );
  if (!stdout) return null;

  const match = stdout.match(/Value\s+REG_SZ\s+(\S+)/i);
  return match ? match[1] : null;
}

/** True when the WLAN AutoConfig service is running. */
async function isWlanServiceRunning(): Promise<boolean | null> {
  const stdout = await soft('WlanSvc state', () => run('sc.exe', ['query', 'WlanSvc']));
  if (!stdout) return null;
  return /STATE\s+:\s+4\s+RUNNING/i.test(stdout);
}

/**
 * Explains an empty `wifiConnections()` result.
 *
 * Order matters: a machine with no wireless adapter is not a permission problem,
 * and a stopped WLAN service is not one either — only once both are ruled out
 * does the Location toggle become the answer.
 */
export async function classifyWifiUnavailable(): Promise<WifiUnavailableReason> {
  // The Wi-Fi read happens before the context capture in the measurement flow, so
  // on a blocked machine this is usually what populates the cache. Resolve the
  // real gateway first (~200 ms) so the shape is cached under the right key and
  // the capture that follows reuses it instead of recomputing the ~2 s of
  // interface + DNS lookups.
  const shape =
    cachedShape ??
    (await getNetworkShape(
      (await soft('default gateway', () => si.networkGatewayDefault())) || null
    ));
  if (!shape.hasWirelessAdapter) {
    return 'no_adapter';
  }

  const wlanRunning = await isWlanServiceRunning();
  if (wlanRunning === false) {
    return 'wlan_service_off';
  }

  const [machine, user] = await Promise.all([
    readLocationConsent('HKLM'),
    readLocationConsent('HKCU'),
  ]);
  const blocked = [machine, user].some(
    (value) => typeof value === 'string' && value.toLowerCase() !== 'allow'
  );
  if (blocked) {
    return 'location_disabled';
  }

  return 'unknown';
}

/**
 * The connected SSID as the Network Location Manager knows it.
 *
 * NLM stores the profile name of the network the adapter is on, and — unlike
 * `netsh wlan` — it is not gated behind the Location permission, so this still
 * answers on a machine where the WLAN stack has gone silent. It only yields the
 * name: BSSID, RSSI, channel and the neighbour scan have no ungated equivalent.
 */
export async function getSsidFromNlm(): Promise<string | null> {
  const shape = cachedShape;
  const profiles = await soft('NLM connection profile', () =>
    runPowershellJson(
      'Get-NetConnectionProfile | Select-Object Name, InterfaceAlias, IPv4Connectivity'
    )
  );
  if (!profiles) return null;

  const list = Array.isArray(profiles) ? profiles : [profiles];
  const match =
    (shape?.wirelessAlias &&
      list.find((profile) => profile?.InterfaceAlias === shape.wirelessAlias)) ||
    list.find((profile) => /wi-?fi|wireless|wlan/i.test(String(profile?.InterfaceAlias ?? ''))) ||
    list[0];

  const name = match?.Name;
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : null;
}

/** Test seam: drops the cached slow-moving half. */
export function resetDeviceContextCache(): void {
  cachedShape = null;
}
