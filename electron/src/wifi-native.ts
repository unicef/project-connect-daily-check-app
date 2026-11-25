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
 * came back empty. Values are converted the way systeminformation converts the
 * English netsh output, so a filled row means the same thing as a row from an
 * English machine:
 *
 *   quality      = signal quality, 0–100 (netsh "Signal")
 *   signalLevel  = quality / 2 − 100 dBm
 *   channel      = current channel number
 *   frequency    = center frequency of the connected BSS in MHz; without it,
 *                  MHz from the channel (same table as systeminformation), or
 *                  null when the channel number could also be a 6 GHz one
 *   txRate       = transmit rate in Mbps, integer
 *   type         = radio type, e.g. "802.11ac"
 *
 * Cost and failure:
 * - The native read only runs when a connection is missing a field it can fill.
 *   A field it could not fill for an adapter and BSS is not asked for again for
 *   an hour, so an English machine whose driver reports no tx rate does not
 *   start PowerShell on every call.
 * - Callers wait at most FILL_DEADLINE_MS. A slower read keeps running in the
 *   background and its result is reused by the next call within
 *   NATIVE_CACHE_TTL_MS; concurrent calls share one read.
 * - Everything fails soft: PowerShell missing or blocked, Add-Type refused, the
 *   API refusing, or a timeout leave the connections exactly as systeminformation
 *   returned them.
 */

import { execFile, ExecFileException } from 'child_process';
import * as path from 'path';

/** One connected interface as the native WLAN API reports it. */
export interface NativeWlanConnection {
  Id?: string;
  Ssid?: string;
  Bssid?: string;
  SignalQuality?: number;
  TxRateKbps?: number;
  PhyType?: number;
  Channel?: number;
  /** Center frequency of the connected BSS, from the scan list; -1 when unknown. */
  CenterFrequencyMHz?: number;
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

/**
 * How long a caller waits for the native read. Registration caps the whole
 * Wi-Fi lookup at 10 s, and a test waits for it before ndt7 starts, so this
 * stays well under both. A read measured 0.5–2 s on the machines tested.
 */
export const FILL_DEADLINE_MS = 4000;

/** Hard limit for the PowerShell process; the whole process tree is killed then. */
const NATIVE_HARD_TIMEOUT_MS = 15000;

/** A reading is reused for this long, so back-to-back calls compile once. */
const NATIVE_CACHE_TTL_MS = 30000;

/** How long a field the native API could not fill is not asked for again. */
const UNFILLABLE_TTL_MS = 60 * 60 * 1000;

const READER_SCRIPT = 'wlan-reader.ps1';

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

/** 802.11ax and 802.11be are the only PHY types that can run on 6 GHz. */
const SIX_GHZ_CAPABLE_PHY_TYPES = new Set([10, 11]);

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

/** 6 GHz channel numbers (2, and 1, 5, 9 … 233) overlap the 2.4 and 5 GHz ones. */
export function isSixGhzChannelNumber(channel: number): boolean {
  return channel === 2 || (channel >= 1 && channel <= 233 && (channel - 1) % 4 === 0);
}

/**
 * Frequency in MHz for a native reading. Prefers the center frequency of the
 * connected BSS. Without it, the channel table is only used when the channel
 * number cannot be a 6 GHz one for this PHY type: on 802.11ax/be, channel 5
 * may be 2432 MHz or 5975 MHz, so the answer is null rather than a guess.
 */
export function nativeFrequency(native: NativeWlanConnection, channel: number): number | null {
  if (typeof native.CenterFrequencyMHz === 'number' && native.CenterFrequencyMHz > 0) {
    return native.CenterFrequencyMHz;
  }
  if (
    typeof native.PhyType === 'number' &&
    SIX_GHZ_CAPABLE_PHY_TYPES.has(native.PhyType) &&
    isSixGhzChannelNumber(channel)
  ) {
    return null;
  }
  return frequencyFromChannel(channel);
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

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `channel` 0 is what systeminformation stores when it cannot find the label. */
const isChannelMissing = (c: WifiConnection): boolean => isMissing(c.channel) || c.channel === 0;

/**
 * Fields of one connection the native read could fill. `frequency` only counts
 * when the channel is missing too: with a channel, systeminformation leaves
 * the frequency null only for channels its table does not know (e.g. 6 GHz),
 * which is not a reason to start a native read.
 */
export function missingFields(c: WifiConnection): string[] {
  const fields: string[] = [];
  if (isMissing(c.quality)) fields.push('quality');
  if (isMissing(c.signalLevel)) fields.push('signalLevel');
  if (isChannelMissing(c)) {
    fields.push('channel');
    if (isMissing(c.frequency)) fields.push('frequency');
  }
  if (isMissing(c.txRate)) fields.push('txRate');
  if (isMissing(c.type)) fields.push('type');
  return fields;
}

const normalizeGuid = (value: unknown): string =>
  String(value ?? '').replace(/[{}]/g, '').trim().toLowerCase();

const normalizeMac = (value: unknown): string =>
  String(value ?? '').replace(/-/g, ':').trim().toLowerCase();

const connectionKey = (c: WifiConnection): string =>
  `${normalizeGuid(c.id)}|${normalizeMac(c.bssid)}`;

/** Fields the native read could not fill, per adapter and BSS. */
const unfillable = new Map<string, { fields: Set<string>; at: number }>();

function fieldsWorthReading(c: WifiConnection, now: number): string[] {
  const memo = unfillable.get(connectionKey(c));
  const fields = missingFields(c);
  if (!memo || now - memo.at >= UNFILLABLE_TTL_MS) return fields;
  return fields.filter((field) => !memo.fields.has(field));
}

/**
 * True when any connection is missing a field the native API can fill, leaving
 * out fields it already failed to fill for the same adapter and BSS.
 */
export function needsNativeFill(connections: WifiConnection[], now: number = Date.now()): boolean {
  return connections.some((c) => isObject(c) && fieldsWorthReading(c, now).length > 0);
}

/**
 * The native reading for a connection: same GUID, else same BSSID. With one
 * connection on each side and no GUID or BSSID on the systeminformation entry,
 * the single native reading is used. Two different GUIDs are two different
 * adapters, so they are never matched.
 */
export function matchNative(
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
  return onlyOne && native.length === 1 && !id && !bssid ? native[0] : undefined;
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
  if (!Array.isArray(native)) return connections;
  // Only objects can be matched; a stray null or scalar would throw on n.Id.
  native = native.filter(isObject);
  if (native.length === 0) return connections;

  for (const connection of connections) {
    if (!isObject(connection)) continue;
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

    if (isChannelMissing(connection) && typeof n.Channel === 'number' && n.Channel > 0) {
      connection.channel = n.Channel;
      filled.push('channel');
    }
    if (
      isMissing(connection.frequency) &&
      typeof connection.channel === 'number' &&
      connection.channel > 0
    ) {
      const frequency = nativeFrequency(n, connection.channel);
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

/** Remembers, per matched connection, the fields still missing after a fill. */
function rememberUnfillable(
  connections: WifiConnection[],
  native: NativeWlanConnection[],
  now: number
): void {
  const readings = Array.isArray(native) ? native.filter(isObject) : [];
  for (const connection of connections) {
    if (!isObject(connection) || !matchNative(connection, readings, connections.length === 1)) {
      continue;
    }
    const stillMissing = missingFields(connection);
    const key = connectionKey(connection);
    if (stillMissing.length > 0) unfillable.set(key, { fields: new Set(stillMissing), at: now });
    else unfillable.delete(key);
  }
}

/**
 * Path of the reader script. It ships in `assets/` and is unpacked next to
 * app.asar (`asarUnpack`), because PowerShell cannot read a file inside the
 * archive.
 */
export function readerScriptPath(dir: string = __dirname): string {
  return path
    .join(dir, '..', '..', 'assets', READER_SCRIPT)
    .replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
}

const MAX_FAILURE_DETAIL = 500;

/**
 * PowerShell can write its error stream to a redirected stderr as CLIXML.
 * Returns the plain text of the error records, or the input unchanged when it
 * is not CLIXML.
 */
export function stderrText(stderr: string): string {
  const text = String(stderr ?? '');
  if (!text.trimStart().startsWith('#< CLIXML')) return text;
  const records: string[] = [];
  const pattern = /<S S="Error">([\s\S]*?)<\/S>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) records.push(match[1]);
  return records
    .join('')
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** A short reason for a failed native read, never the full command line. */
function describeFailure(error: ExecFileException, stderr: string): string {
  // Spawn failures (ENOENT, EACCES…) and maxBuffer carry a string code and a short message.
  if (typeof error.code === 'string') return error.message;
  const detail = stderrText(stderr).replace(/\s+/g, ' ').trim();
  if (detail) return detail.slice(0, MAX_FAILURE_DETAIL);
  return `powershell.exe exited with code ${error.code}`;
}

/**
 * Kills a process and its children. Killing only powershell.exe can leave the
 * csc.exe that Add-Type started running.
 */
function killProcessTree(pid: number | undefined): void {
  if (!pid) return;
  try {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => undefined);
  } catch {
    // Nothing else to do: the process is gone or cannot be killed.
  }
}

export interface ReadOptions {
  scriptPath?: string;
  timeoutMs?: number;
}

/**
 * Reads the connected interfaces from wlanapi.dll through PowerShell.
 * Resolves to an empty list on any failure.
 */
export function readNativeWlan(options: ReadOptions = {}): Promise<NativeWlanConnection[]> {
  if (process.platform !== 'win32') return Promise.resolve([]);

  const scriptPath = options.scriptPath ?? readerScriptPath();
  const timeoutMs = options.timeoutMs ?? NATIVE_HARD_TIMEOUT_MS;
  return new Promise((resolve) => {
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const child = execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
        { windowsHide: true, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => {
          if (timer) clearTimeout(timer);
          try {
            if (timedOut) {
              console.warn(`[wifi-native] WLAN API read unavailable: timed out after ${timeoutMs} ms`);
              resolve([]);
              return;
            }
            if (error) {
              console.warn('[wifi-native] WLAN API read unavailable:', describeFailure(error, stderr));
              resolve([]);
              return;
            }
            const text = String(stdout).trim();
            const parsed: unknown = text ? JSON.parse(text) : [];
            const list = Array.isArray(parsed) ? parsed : [parsed];
            resolve(list.filter(isObject) as NativeWlanConnection[]);
          } catch (parseError) {
            console.warn('[wifi-native] WLAN API output unreadable:', parseError?.message);
            resolve([]);
          }
        }
      );
      timer = setTimeout(() => {
        timedOut = true;
        killProcessTree(child.pid);
      }, timeoutMs);
    } catch (spawnError) {
      // execFile can throw synchronously (e.g. EPERM/EMFILE on spawn).
      console.warn('[wifi-native] WLAN API read could not start:', spawnError?.message);
      resolve([]);
    }
  });
}

let cachedReading: { at: number; data: NativeWlanConnection[] } | null = null;
let readInFlight: Promise<NativeWlanConnection[]> | null = null;

/**
 * One native read shared by concurrent callers, and reused for
 * NATIVE_CACHE_TTL_MS. Registration followed by the first test reads once.
 */
export function readNativeWlanShared(
  read: () => Promise<NativeWlanConnection[]> = readNativeWlan,
  now: () => number = Date.now
): Promise<NativeWlanConnection[]> {
  if (cachedReading && now() - cachedReading.at < NATIVE_CACHE_TTL_MS) {
    return Promise.resolve(cachedReading.data);
  }
  if (readInFlight) return readInFlight;

  const settle = (data: NativeWlanConnection[]): NativeWlanConnection[] => {
    cachedReading = { at: now(), data };
    readInFlight = null;
    return data;
  };
  readInFlight = read().then(settle, () => settle([]));
  return readInFlight;
}

/** Resolves to undefined if `promise` has not settled within `ms`. */
function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      }
    );
  });
}

/** Clears the shared reading, the in-flight read and the unfillable memo. For tests. */
export function resetNativeState(): void {
  cachedReading = null;
  readInFlight = null;
  unfillable.clear();
}

export interface CompleteOptions {
  /** Native reader; defaults to the PowerShell one. */
  read?: () => Promise<NativeWlanConnection[]>;
  deadlineMs?: number;
  now?: () => number;
}

/**
 * Completes `si.wifiConnections()` output with the native reading when a field
 * is missing. Returns the connections unchanged on a healthy (English) read,
 * when the native read fails, or when it has not finished by the deadline.
 *
 * Never rejects: the caller would otherwise drop the whole Wi-Fi reading,
 * including the SSID and BSSID systeminformation did parse.
 */
export async function completeWifiConnections<T extends object>(
  connections: T[],
  options: CompleteOptions = {}
): Promise<T[]> {
  try {
    if (!Array.isArray(connections) || connections.length === 0) return connections;
    const entries = connections as unknown as WifiConnection[];
    const now = options.now ?? Date.now;
    if (!needsNativeFill(entries, now())) return connections;

    const deadlineMs = options.deadlineMs ?? FILL_DEADLINE_MS;
    const native = await withDeadline(
      readNativeWlanShared(options.read ?? (() => readNativeWlan()), now),
      deadlineMs
    );
    if (native === undefined) {
      console.warn(
        `[wifi-native] WLAN API read not finished after ${deadlineMs} ms; ` +
          'returning the systeminformation result (the read continues for the next call)'
      );
      return connections;
    }
    fillFromNative(entries, native);
    rememberUnfillable(entries, native, now());
  } catch (error) {
    console.warn('[wifi-native] fill skipped:', error?.message);
  }
  return connections;
}
