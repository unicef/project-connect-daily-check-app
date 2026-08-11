#!/usr/bin/env node
/**
 * probe-system-info.js — Research probe for Plan 0008 (network & device info).
 *
 * Standalone Node script: no app build, no Electron. Copy this file to the
 * target Windows PC and run:
 *
 *     node probe-system-info.js
 *
 * It resolves `systeminformation` from the repo's node_modules when run in
 * place; on a standalone copy run `npm i systeminformation@^5` next to it.
 *
 * For every attribute in the ticket list it:
 *   1. runs the systeminformation call (or the native fallback),
 *   2. measures duration in ms,
 *   3. records the value, whether it came back empty, and any error,
 *   4. runs a second pass a few seconds later to flag volatile values.
 *
 * Outputs (written to the current working directory):
 *   probe-<hostname>-<timestamp>.json           raw dump — DO NOT share as-is
 *   probe-<hostname>-<timestamp>-redacted.json  masked copy, safe to attach
 *   probe-<hostname>-<timestamp>.csv            one row per attribute (redacted)
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawnSync } = require('child_process');

// ---------------------------------------------------------------------------
// Load systeminformation from the repo or from a local npm install.
// ---------------------------------------------------------------------------
function loadSysteminformation() {
  const candidates = [
    'systeminformation',
    path.join(__dirname, '..', '..', 'node_modules', 'systeminformation'),
    path.join(__dirname, '..', '..', 'electron', 'node_modules', 'systeminformation'),
    path.join(process.cwd(), 'node_modules', 'systeminformation'),
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (_) {
      /* try next */
    }
  }
  console.error(
    'No pude cargar "systeminformation". Corre el script desde el repo o haz\n' +
      '`npm i systeminformation@^5` en la carpeta donde copiaste este archivo.'
  );
  process.exit(1);
}

const si = loadSysteminformation();

const PASS_DELAY_MS = 5000; // gap between pass 1 and pass 2 (volatility check)
const NETSTATS_SAMPLE_GAP_MS = 2000; // gap between the two networkStats samples

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function runPowershellJson(psCommand) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psCommand + ' | ConvertTo-Json -Depth 4'],
      { timeout: 30000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(err);
        const text = stdout.trim();
        if (!text) return resolve(null);
        try {
          resolve(JSON.parse(text));
        } catch (parseErr) {
          reject(new Error('PowerShell devolvió algo no-JSON: ' + text.slice(0, 200)));
        }
      }
    );
  });
}

/** True when the current process is elevated (fltmc requires admin). */
function isProcessElevated() {
  const result = spawnSync('fltmc.exe', [], { windowsHide: true, stdio: 'ignore' });
  return result.status === 0;
}

/** VPN heuristic: virtual adapters + well-known VPN driver/interface names. */
const VPN_NAME_PATTERN = /(tap|tun|wintun|wireguard|openvpn|anyconnect|cisco|zerotier|tailscale|nordlynx|hamachi|fortissl|fortinet|globalprotect|pangp|juniper|pulse|ppp|l2tp|sstp|ikev2)/i;

function inferVpn(interfaces, routes) {
  const candidates = (interfaces || []).filter(
    (iface) =>
      iface.operstate === 'up' &&
      (iface.virtual === true || VPN_NAME_PATTERN.test(iface.ifaceName || '') || VPN_NAME_PATTERN.test(iface.iface || ''))
  );
  const routeList = Array.isArray(routes) ? routes : routes ? [routes] : [];
  const defaultRoutes = routeList.map((route) => ({
    interfaceAlias: route.InterfaceAlias,
    nextHop: route.NextHop,
    metric: route.RouteMetric,
  }));
  return {
    vpnLikely: candidates.length > 0,
    vpnCandidateInterfaces: candidates.map((iface) => ({
      iface: iface.iface,
      ifaceName: iface.ifaceName,
      virtual: iface.virtual,
      type: iface.type,
      ip4: iface.ip4,
    })),
    defaultRoutes,
  };
}

// ---------------------------------------------------------------------------
// Probe definitions. `requiresAdmin` is what we expect on Windows; the run
// itself verifies it (values that come back empty without elevation).
// ---------------------------------------------------------------------------
function buildProbes() {
  return [
    // --- Red: interfaces / gateway / uso / conexiones ---
    {
      group: 'red-interfaces',
      attr: 'interfaces (ip4/ip6, tipo, MAC, velocidad, virtual, dhcp, dns)',
      call: 'si.networkInterfaces()',
      requiresAdmin: 'no',
      fn: () => si.networkInterfaces(),
    },
    {
      group: 'red-gateway',
      attr: 'gateway por defecto',
      call: 'si.networkGatewayDefault()',
      requiresAdmin: 'no',
      fn: () => si.networkGatewayDefault(),
    },
    {
      group: 'red-uso',
      attr: 'bytes rx/tx y tasa (2 muestras)',
      call: `si.networkStats() x2 (${NETSTATS_SAMPLE_GAP_MS} ms)`,
      requiresAdmin: 'no',
      fn: async () => {
        const first = await si.networkStats();
        await sleep(NETSTATS_SAMPLE_GAP_MS);
        const second = await si.networkStats();
        return second.map((sample, i) => {
          const prev = first[i] || {};
          const seconds = NETSTATS_SAMPLE_GAP_MS / 1000;
          return {
            iface: sample.iface,
            rx_bytes: sample.rx_bytes,
            tx_bytes: sample.tx_bytes,
            rx_bytes_per_sec:
              prev.rx_bytes != null ? Math.round((sample.rx_bytes - prev.rx_bytes) / seconds) : null,
            tx_bytes_per_sec:
              prev.tx_bytes != null ? Math.round((sample.tx_bytes - prev.tx_bytes) / seconds) : null,
          };
        });
      },
    },
    {
      group: 'red-conexiones',
      attr: 'conexiones activas (coste alto, evaluar)',
      call: 'si.networkConnections()',
      requiresAdmin: 'parcial (PID/proceso solo elevado)',
      fn: async () => {
        const connections = await si.networkConnections();
        // Full list is huge and privacy-heavy; keep counts + a small sample.
        return {
          total: connections.length,
          byState: connections.reduce((acc, c) => {
            acc[c.state || 'unknown'] = (acc[c.state || 'unknown'] || 0) + 1;
            return acc;
          }, {}),
          sample: connections.slice(0, 5),
        };
      },
    },
    // --- Red: Wi-Fi ---
    {
      group: 'red-wifi',
      attr: 'Wi-Fi conectada (ya en uso por el app)',
      call: 'si.wifiConnections()',
      requiresAdmin: 'no',
      fn: () => si.wifiConnections(),
    },
    {
      group: 'red-wifi',
      attr: 'redes Wi-Fi visibles (scan real)',
      call: 'si.wifiNetworks()',
      requiresAdmin: 'no (requiere servicio WLAN activo)',
      fn: () => si.wifiNetworks(),
    },
    {
      group: 'red-wifi',
      attr: 'adaptadores Wi-Fi',
      call: 'si.wifiInterfaces()',
      requiresAdmin: 'no',
      fn: () => si.wifiInterfaces(),
    },
    // --- Red: DNS ---
    {
      group: 'red-dns',
      attr: 'servidores DNS configurados',
      call: 'Get-DnsClientServerAddress (PowerShell)',
      requiresAdmin: 'no',
      fn: async () => {
        const result = await runPowershellJson(
          "Get-DnsClientServerAddress -AddressFamily IPv4 | Where-Object {$_.ServerAddresses} | Select-Object InterfaceAlias, ServerAddresses"
        );
        return result;
      },
    },
    // --- Red: VPN ---
    {
      group: 'red-vpn',
      attr: 'detección de VPN (inferencia)',
      call: 'si.networkInterfaces() + Get-NetRoute 0.0.0.0/0',
      requiresAdmin: 'no',
      fn: async () => {
        const interfaces = await si.networkInterfaces();
        let routes = null;
        try {
          routes = await runPowershellJson(
            "Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Select-Object InterfaceAlias, NextHop, RouteMetric"
          );
        } catch (_) {
          /* route table optional */
        }
        return inferVpn(Array.isArray(interfaces) ? interfaces : [interfaces], routes);
      },
    },
    // --- Sistema ---
    {
      group: 'sistema-os',
      attr: 'OS (build, edición, arquitectura, hypervisor)',
      call: 'si.osInfo()',
      requiresAdmin: 'no',
      fn: () => si.osInfo(),
    },
    {
      group: 'sistema-cpu',
      attr: 'CPU modelo/núcleos/velocidad',
      call: 'si.cpu()',
      requiresAdmin: 'no',
      fn: () => si.cpu(),
    },
    {
      group: 'sistema-cpu',
      attr: 'carga actual de CPU',
      call: 'si.currentLoad()',
      requiresAdmin: 'no',
      fn: async () => {
        const load = await si.currentLoad();
        // Drop the per-core array from the stored value; keep the summary.
        return {
          avgLoad: load.avgLoad,
          currentLoad: load.currentLoad,
          currentLoadUser: load.currentLoadUser,
          currentLoadSystem: load.currentLoadSystem,
          cpuCount: (load.cpus || []).length,
        };
      },
    },
    {
      group: 'sistema-cpu',
      attr: 'temperatura de CPU',
      call: 'si.cpuTemperature()',
      requiresAdmin: 'probable (WMI/ACPI suele requerir elevación)',
      fn: () => si.cpuTemperature(),
    },
    // --- Disco / memoria ---
    {
      group: 'sistema-disco',
      attr: 'discos físicos (tipo HDD/SSD, tamaño)',
      call: 'si.diskLayout()',
      requiresAdmin: 'no',
      fn: () => si.diskLayout(),
    },
    {
      group: 'sistema-disco',
      attr: 'filesystems (tamaño/usado/libre)',
      call: 'si.fsSize()',
      requiresAdmin: 'no',
      fn: () => si.fsSize(),
    },
    {
      group: 'sistema-memoria',
      attr: 'memoria total/libre/usada',
      call: 'si.mem()',
      requiresAdmin: 'no',
      fn: () => si.mem(),
    },
    // --- Instalación / entorno de ejecución ---
    {
      group: 'sistema-instalacion',
      attr: 'proceso corre elevado',
      call: 'fltmc.exe (exit code)',
      requiresAdmin: 'no',
      fn: async () => ({ elevated: isProcessElevated() }),
    },
    {
      group: 'sistema-instalacion',
      attr: 'entorno de ejecución (Node, usuario, hostname)',
      call: 'os.userInfo() / process.version',
      requiresAdmin: 'no',
      fn: async () => ({
        nodeVersion: process.version,
        hostname: os.hostname(),
        username: os.userInfo().username,
        windowsRelease: os.release(),
        note: 'app.getAppPath() y fecha de instalación: verificar en Electron (Artefacto 2)',
      }),
    },
  ];
}

// ---------------------------------------------------------------------------
// Runner: executes one pass of every probe with timing + error capture.
// ---------------------------------------------------------------------------
async function runPass(probes) {
  const results = [];
  for (const probe of probes) {
    const startedAt = process.hrtime.bigint();
    let value = null;
    let error = null;
    try {
      value = await probe.fn();
    } catch (err) {
      error = String((err && err.message) || err);
    }
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    results.push({ ...probe, fn: undefined, value, error, ms: Math.round(ms) });
    const status = error ? 'ERROR' : isEmptyValue(value) ? 'vacío' : 'ok';
    console.log(`  ${probe.call.padEnd(50)} ${String(Math.round(ms)).padStart(6)} ms  ${status}`);
  }
  return results;
}

function isEmptyValue(value) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return true;
    return keys.every((key) => value[key] == null || value[key] === '' || value[key] === -1);
  }
  return value === '';
}

/** 'sí' | 'no' | 'parcial' for the CSV. */
function availability(entry) {
  if (entry.error) return 'no';
  if (isEmptyValue(entry.value)) return 'no';
  const value = entry.value;
  const flatValues = [];
  (function walk(node) {
    if (node == null) return flatValues.push(null);
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node === 'object') return Object.values(node).forEach(walk);
    flatValues.push(node);
  })(value);
  if (flatValues.length === 0) return 'parcial'; // structure exists but all values null/empty
  const emptyish = flatValues.filter((v) => v === '' || v === null || v === -1).length;
  return emptyish > flatValues.length / 2 ? 'parcial' : 'sí';
}

// ---------------------------------------------------------------------------
// Redaction — the raw dump stays on the machine; everything shared is masked.
// ---------------------------------------------------------------------------
const IP4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const MAC_RE = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;
const SENSITIVE_KEY_RE = /(ssid|bssid|mac|ip4|ip6|address|user|host|fqdn|serial|uuid|gateway|dns|nexthop)/i;

function maskString(key, raw) {
  const value = String(raw);
  if (IP4_RE.test(value)) return value.split('.')[0] + '.x.x.x';
  if (MAC_RE.test(value)) return value.slice(0, 8) + ':xx:xx:xx';
  if (/ssid/i.test(key)) return 'SSID-' + shortHash(value);
  if (value.includes('::') || /^[0-9a-f:]{6,}$/i.test(value)) return '«ipv6»';
  return '«' + key.toLowerCase() + '-' + shortHash(value) + '»';
}

function shortHash(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  return Math.abs(hash).toString(16).slice(0, 4);
}

function redact(node, parentKey = '') {
  if (node == null) return node;
  // Bare strings that look like an IP or MAC get masked regardless of key
  // (e.g. networkGatewayDefault() returns a plain string).
  if (typeof node === 'string' && (IP4_RE.test(node) || MAC_RE.test(node))) {
    return maskString(parentKey || 'value', node);
  }
  if (Array.isArray(node)) return node.map((item) => redact(item, parentKey));
  if (typeof node === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string' && value !== '' && SENSITIVE_KEY_RE.test(key)) {
        out[key] = maskString(key, value);
      } else if (Array.isArray(value) && SENSITIVE_KEY_RE.test(key)) {
        out[key] = value.map((item) =>
          typeof item === 'string' ? maskString(key, item) : redact(item, key)
        );
      } else {
        out[key] = redact(value, key);
      }
    }
    return out;
  }
  return node;
}

// ---------------------------------------------------------------------------
// CSV — one row per attribute; this is the table for the UNICEF spreadsheet.
// ---------------------------------------------------------------------------
function csvEscape(text) {
  return '"' + String(text == null ? '' : text).replace(/"/g, '""') + '"';
}

function sampleValue(entry) {
  if (entry.error) return 'ERROR: ' + entry.error.slice(0, 120);
  const redacted = redact(entry.value);
  let text = JSON.stringify(redacted);
  if (text && text.length > 220) text = text.slice(0, 220) + '…';
  return text;
}

function buildCsv(rows) {
  const header = [
    'grupo',
    'atributo',
    'llamada',
    'disponible',
    'valor de ejemplo (redactado)',
    'ms',
    'requiere admin',
    'volátil',
    'notas',
  ];
  const lines = [header.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.group,
        row.attr,
        row.call,
        row.disponible,
        row.ejemplo,
        row.ms,
        row.requiresAdmin,
        row.volatil,
        row.notas,
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  return lines.join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const hostname = os.hostname();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runtime = process.versions.electron ? `electron-${process.versions.electron}` : 'node';
  const baseName = `probe-${hostname}-${runtime}-${timestamp}`;
  const elevated = isProcessElevated();

  console.log(`\nProbe de red/sistema — plan 0008 (release v2.0.4)`);
  console.log(
    `Equipo: ${hostname} | Node ${process.version}` +
      (process.versions.electron ? ` (Electron ${process.versions.electron}, main process)` : '') +
      ` | elevado: ${elevated ? 'sí' : 'no'}`
  );
  console.log(`\nPasada 1/2:`);
  const probes = buildProbes();
  const pass1 = await runPass(probes);

  console.log(`\nEsperando ${PASS_DELAY_MS / 1000}s para la pasada de volatilidad…`);
  await sleep(PASS_DELAY_MS);

  console.log(`\nPasada 2/2:`);
  const pass2 = await runPass(buildProbes());

  const rows = pass1.map((entry, i) => {
    const second = pass2[i];
    const changed =
      !entry.error && !second.error && JSON.stringify(entry.value) !== JSON.stringify(second.value);
    const notes = [];
    if (entry.error) notes.push('falló en pasada 1');
    if (second.error && !entry.error) notes.push('falló solo en pasada 2 (inestable)');
    if (Math.max(entry.ms, second.ms) > 1000)
      notes.push(`lento (peor pasada: ${Math.max(entry.ms, second.ms)} ms)`);
    return {
      group: entry.group,
      attr: entry.attr,
      call: entry.call,
      disponible: availability(entry),
      ejemplo: sampleValue(entry),
      ms: Math.round((entry.ms + second.ms) / 2),
      requiresAdmin: entry.requiresAdmin,
      volatil: changed ? 'sí' : 'no',
      notas: notes.join('; '),
    };
  });

  const rawDump = {
    meta: {
      hostname,
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      electronVersion: process.versions.electron || null,
      windowsRelease: os.release(),
      elevated,
      passDelayMs: PASS_DELAY_MS,
    },
    pass1: pass1.map(({ fn, ...rest }) => rest),
    pass2: pass2.map(({ fn, ...rest }) => rest),
  };

  const outDir = process.env.PROBE_OUT_DIR || process.cwd();
  const rawPath = path.join(outDir, `${baseName}.json`);
  const redactedPath = path.join(outDir, `${baseName}-redacted.json`);
  const csvPath = path.join(outDir, `${baseName}.csv`);

  fs.writeFileSync(rawPath, JSON.stringify(rawDump, null, 2));
  fs.writeFileSync(redactedPath, JSON.stringify(redact(rawDump), null, 2));
  fs.writeFileSync(csvPath, buildCsv(rows));

  // Console summary: failures + worst timings.
  const failures = pass1.filter((entry) => entry.error);
  const slowest = [...pass1].sort((a, b) => b.ms - a.ms).slice(0, 5);
  console.log('\n================ RESUMEN ================');
  console.log(`Atributos probados: ${pass1.length} | fallos: ${failures.length}`);
  for (const failure of failures) console.log(`  FALLO ${failure.call}: ${failure.error}`);
  console.log('Llamadas más lentas (pasada 1):');
  for (const entry of slowest) console.log(`  ${String(entry.ms).padStart(6)} ms  ${entry.call}`);
  console.log('\nArchivos generados:');
  console.log(`  ${rawPath}`);
  console.log(`  ${redactedPath}`);
  console.log(`  ${csvPath}`);
  console.log(
    '\nAVISO: el JSON crudo contiene SSIDs, MACs, IPs internas y el usuario de\n' +
      'Windows. NO lo compartas fuera del equipo sin revisarlo; adjunta al\n' +
      'ticket/spreadsheet la versión -redacted.json y el CSV.'
  );
}

// Run directly (`node probe-system-info.js`) or require it from an Electron
// main process (Artefacto 2 del plan 0008) and await `main()` there.
if (require.main === module) {
  main().catch((err) => {
    console.error('El probe terminó con un error no controlado:', err);
    process.exit(1);
  });
} else {
  module.exports = { main };
}
