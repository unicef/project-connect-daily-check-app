// Unit tests for src/wifi-native.ts, run against the compiled module with
// Node's built-in test runner: `npm test` (tsc first, then `node --test test/`).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const w = require('../build/src/wifi-native.js');

const GUID = '7e1dd97b-07f7-4562-bac1-f02fcfbfd94f';
const BSSID = '44:3b:14:e8:00:d7';

/** What si.wifiConnections() returns on an English machine. */
const english = () => ({
  id: GUID,
  iface: 'Wi-Fi',
  ssid: 'School',
  bssid: BSSID,
  channel: 100,
  frequency: 5500,
  type: '802.11ax',
  signalLevel: -57,
  quality: 86,
  txRate: 961,
});

/** What it returns on a Russian machine: only the positional fields survive. */
const russian = () => ({
  ...english(),
  channel: 0,
  frequency: null,
  type: null,
  signalLevel: NaN,
  quality: null,
  txRate: null,
});

/** What it returns on a Spanish machine: "Canal" still parses. */
const spanish = () => ({ ...english(), type: null, signalLevel: null, quality: null, txRate: null });

const native = (overrides = {}) => ({
  Id: GUID,
  Bssid: BSSID,
  SignalQuality: 92,
  TxRateKbps: 1134000,
  PhyType: 10,
  Channel: 100,
  CenterFrequencyMHz: 5500,
  ...overrides,
});

test.beforeEach(() => w.resetNativeState());

test('frequencyFromChannel follows the systeminformation table', () => {
  assert.equal(w.frequencyFromChannel(1), 2412);
  assert.equal(w.frequencyFromChannel(14), 2484);
  assert.equal(w.frequencyFromChannel(100), 5500);
  assert.equal(w.frequencyFromChannel(165), 5825);
  assert.equal(w.frequencyFromChannel(37), null);
  assert.equal(w.frequencyFromChannel(233), null);
});

test('signalLevelFromQuality matches systeminformation', () => {
  assert.equal(w.signalLevelFromQuality(86), -57);
  assert.equal(w.signalLevelFromQuality(0), -100);
  assert.equal(w.signalLevelFromQuality(100), -50);
  assert.equal(w.signalLevelFromQuality(-1), 0);
});

test('isSixGhzChannelNumber', () => {
  for (const ch of [1, 2, 5, 37, 149, 165, 233]) assert.equal(w.isSixGhzChannelNumber(ch), true, `ch ${ch}`);
  for (const ch of [0, 3, 36, 100, 116, 144, 234, 237]) assert.equal(w.isSixGhzChannelNumber(ch), false, `ch ${ch}`);
});

test('nativeFrequency prefers the BSS center frequency', () => {
  assert.equal(w.nativeFrequency(native({ Channel: 5, CenterFrequencyMHz: 5975 }), 5), 5975);
});

test('nativeFrequency leaves an ambiguous 6 GHz-capable channel null without a center frequency', () => {
  assert.equal(w.nativeFrequency(native({ CenterFrequencyMHz: -1, PhyType: 10 }), 5), null);
  assert.equal(w.nativeFrequency(native({ CenterFrequencyMHz: -1, PhyType: 11 }), 149), null);
  // 802.11ac cannot run on 6 GHz, so its channel 149 is 5 GHz.
  assert.equal(w.nativeFrequency(native({ CenterFrequencyMHz: -1, PhyType: 8 }), 149), 5745);
  // Channel 100 is never a 6 GHz number.
  assert.equal(w.nativeFrequency(native({ CenterFrequencyMHz: -1, PhyType: 10 }), 100), 5500);
});

test('missingFields: English row is complete', () => {
  assert.deepEqual(w.missingFields(english()), []);
});

test('missingFields: channel 0 counts as missing, NaN signalLevel too', () => {
  assert.deepEqual(w.missingFields(russian()), ['quality', 'signalLevel', 'channel', 'frequency', 'txRate', 'type']);
});

test('missingFields: frequency alone does not count when the channel is known (6 GHz on English)', () => {
  assert.deepEqual(w.missingFields({ ...english(), channel: 37, frequency: null }), []);
});

test('needsNativeFill: English rows do not trigger a read', () => {
  assert.equal(w.needsNativeFill([english()]), false);
  assert.equal(w.needsNativeFill([{ ...english(), channel: 53, frequency: null }]), false);
});

test('needsNativeFill: localized rows trigger a read; non-objects are ignored', () => {
  assert.equal(w.needsNativeFill([russian()]), true);
  assert.equal(w.needsNativeFill([spanish()]), true);
  assert.equal(w.needsNativeFill([null, 5, 'x']), false);
});

test('fillFromNative fills every lost field on a Russian row', () => {
  const [row] = w.fillFromNative([russian()], [native()]);
  assert.equal(row.quality, 92);
  assert.equal(row.signalLevel, -54);
  assert.equal(row.channel, 100);
  assert.equal(row.frequency, 5500);
  assert.equal(row.txRate, 1134);
  assert.equal(row.type, '802.11ax');
  assert.deepEqual(row.nativeFilled, ['quality', 'signalLevel', 'channel', 'frequency', 'txRate', 'type']);
});

test('fillFromNative never overwrites what systeminformation parsed', () => {
  const [row] = w.fillFromNative([spanish()], [native({ Channel: 36, CenterFrequencyMHz: 5180 })]);
  assert.equal(row.channel, 100);
  assert.equal(row.frequency, 5500);
  assert.deepEqual(row.nativeFilled, ['quality', 'signalLevel', 'txRate', 'type']);

  const [en] = w.fillFromNative([english()], [native({ SignalQuality: 10 })]);
  assert.equal(en.quality, 86);
  assert.equal(en.nativeFilled, undefined);
});

test('fillFromNative uses the center frequency for a 6 GHz channel', () => {
  const [row] = w.fillFromNative([russian()], [native({ Channel: 5, CenterFrequencyMHz: 5975 })]);
  assert.equal(row.channel, 5);
  assert.equal(row.frequency, 5975);
});

test('fillFromNative leaves an ambiguous frequency null', () => {
  const [row] = w.fillFromNative([russian()], [native({ Channel: 5, CenterFrequencyMHz: -1 })]);
  assert.equal(row.channel, 5);
  assert.equal(row.frequency, null);
  assert.equal(row.nativeFilled.includes('frequency'), false);
});

test('fillFromNative ignores out-of-range and missing native values', () => {
  const [row] = w.fillFromNative([russian()], [native({ SignalQuality: -1, TxRateKbps: 0, Channel: -1, PhyType: 99 })]);
  assert.equal(row.quality, null);
  assert.equal(row.txRate, null);
  assert.equal(row.channel, 0);
  assert.equal(row.type, null);
  assert.equal(row.nativeFilled, undefined);
});

test('matchNative: by GUID, then by BSSID', () => {
  const other = native({ Id: 'aaaaaaaa-0000-0000-0000-000000000000', Bssid: '00:11:22:33:44:55' });
  assert.equal(w.matchNative(russian(), [other, native()], false).Id, GUID);
  assert.equal(w.matchNative({ ...russian(), id: '{' + GUID.toUpperCase() + '}' }, [native()], true).Id, GUID);
  assert.equal(w.matchNative({ ...russian(), id: undefined }, [other, native()], false).Bssid, BSSID);
  assert.equal(w.matchNative({ ...russian(), id: undefined, bssid: BSSID.replace(/:/g, '-') }, [native()], true).Bssid, BSSID);
});

test('matchNative: two different GUIDs are never matched, even one to one', () => {
  const dongle = native({ Id: 'bbbbbbbb-0000-0000-0000-000000000000', Bssid: '00:11:22:33:44:55' });
  assert.equal(w.matchNative(russian(), [dongle], true), undefined);
  const [row] = w.fillFromNative([russian()], [dongle]);
  assert.equal(row.quality, null);
});

test('matchNative: single-adapter fallback only when the entry has no GUID and no BSSID', () => {
  const anonymous = { ...russian(), id: '', bssid: '' };
  assert.equal(w.matchNative(anonymous, [native()], true).Id, GUID);
  assert.equal(w.matchNative(anonymous, [native(), native({ Id: 'x' })], true), undefined);
  assert.equal(w.matchNative(anonymous, [native()], false), undefined);
});

test('fillFromNative skips null and non-object native items and entries', () => {
  const rows = w.fillFromNative([null, russian()], [null, 5, 'x', native()]);
  assert.equal(rows[0], null);
  assert.equal(rows[1].quality, 92);
});

test('stderrText decodes CLIXML error records', () => {
  const clixml =
    '#< CLIXML\r\n<Objs Version="1.1.0.1"><Obj S="progress" RefId="0"><TN RefId="0"><T>x</T></TN></Obj>' +
    '<S S="Error">Add-Type : a &gt; b &amp; c_x000D__x000A_</S><S S="Error">line 2</S></Objs>';
  assert.equal(w.stderrText(clixml), 'Add-Type : a > b & c\r\nline 2');
  assert.equal(w.stderrText('plain error'), 'plain error');
  assert.equal(w.stderrText(undefined), '');
});

test('readerScriptPath points at assets/, unpacked from app.asar when packaged', () => {
  const dev = path.join('C:', 'repo', 'electron', 'build', 'src');
  assert.equal(w.readerScriptPath(dev), path.join('C:', 'repo', 'electron', 'assets', 'wlan-reader.ps1'));
  const packaged = path.join('C:', 'Program Files', 'Giga Meter', 'resources', 'app.asar', 'build', 'src');
  assert.equal(
    w.readerScriptPath(packaged),
    path.join('C:', 'Program Files', 'Giga Meter', 'resources', 'app.asar.unpacked', 'assets', 'wlan-reader.ps1')
  );
});

test('readerScriptPath resolves to the shipped script in this checkout', () => {
  const fs = require('fs');
  assert.ok(fs.existsSync(w.readerScriptPath(path.join(__dirname, '..', 'build', 'src'))));
});

test('completeWifiConnections: English rows never start a read', async () => {
  let reads = 0;
  const rows = [english()];
  const out = await w.completeWifiConnections(rows, { read: async () => (reads++, [native()]) });
  assert.equal(reads, 0);
  assert.equal(out, rows);
  assert.deepEqual(out[0], english());
});

test('completeWifiConnections fills a localized row', async () => {
  const [row] = await w.completeWifiConnections([russian()], { read: async () => [native()] });
  assert.equal(row.quality, 92);
  assert.equal(row.nativeFilled.length, 6);
});

test('completeWifiConnections returns the systeminformation result when the read misses the deadline', async () => {
  let release;
  const slow = () => new Promise((resolve) => (release = () => resolve([native()])));
  const rows = [russian()];
  const out = await w.completeWifiConnections(rows, { read: slow, deadlineMs: 20 });
  assert.equal(out[0].quality, null);
  assert.equal(out[0].nativeFilled, undefined);

  // The read keeps going; the next call uses its result without a new read.
  release();
  await new Promise((r) => setImmediate(r));
  let reads = 0;
  const [next] = await w.completeWifiConnections([russian()], { read: async () => (reads++, []) });
  assert.equal(reads, 0);
  assert.equal(next.quality, 92);
});

test('completeWifiConnections shares one in-flight read between concurrent callers', async () => {
  let reads = 0;
  const read = () => new Promise((resolve) => setTimeout(() => (reads++, resolve([native()])), 30));
  const [a, b] = await Promise.all([
    w.completeWifiConnections([russian()], { read }),
    w.completeWifiConnections([russian()], { read }),
  ]);
  assert.equal(reads, 1);
  assert.equal(a[0].quality, 92);
  assert.equal(b[0].quality, 92);
});

test('completeWifiConnections reads again once the cached reading expires', async () => {
  let clock = 0;
  let reads = 0;
  const read = async () => (reads++, [native({ SignalQuality: 50 + reads })]);
  const now = () => clock;
  await w.completeWifiConnections([russian()], { read, now });
  clock = 29000;
  await w.completeWifiConnections([russian()], { read, now });
  assert.equal(reads, 1);
  clock = 31000;
  const [row] = await w.completeWifiConnections([russian()], { read, now });
  assert.equal(reads, 2);
  assert.equal(row.quality, 52);
});

test('completeWifiConnections does not read again for fields the API could not fill', async () => {
  let clock = 0;
  let reads = 0;
  const now = () => clock;
  // The driver reports no tx rate: everything else fills, txRate stays null.
  const read = async () => (reads++, [native({ TxRateKbps: 0 })]);
  const noTxRate = () => ({ ...english(), txRate: null });

  const [first] = await w.completeWifiConnections([noTxRate()], { read, now });
  assert.equal(first.txRate, null);
  assert.equal(reads, 1);

  clock = 60 * 1000; // cache expired, memo still fresh
  await w.completeWifiConnections([noTxRate()], { read, now });
  assert.equal(reads, 1);

  // A localized row on the same adapter still needs the other fields.
  await w.completeWifiConnections([{ ...russian(), txRate: null }], { read, now });
  assert.equal(reads, 2);

  clock = 2 * 60 * 60 * 1000; // memo expired
  await w.completeWifiConnections([noTxRate()], { read, now });
  assert.equal(reads, 3);
});

test('completeWifiConnections never rejects', async () => {
  const rows = [russian()];
  assert.equal(await w.completeWifiConnections(rows, { read: async () => { throw new Error('boom'); } }), rows);
  assert.equal(rows[0].quality, null);
  assert.equal(await w.completeWifiConnections('garbage'), 'garbage');
  assert.deepEqual(await w.completeWifiConnections([]), []);
  // The failed read above is cached as empty for 30 s, like any reading.
  w.resetNativeState();
  const out = await w.completeWifiConnections([null, russian()], { read: async () => [null, native()] });
  assert.equal(out[1].quality, 92);
});
