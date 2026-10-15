/* eslint-disable */
/**
 * Builds the Windows installer, optionally under a custom file name.
 *
 * Runs the same three steps as before (Angular build -> capacitor sync ->
 * electron-builder, no publish), and adds a `--name` option so a build can be
 * told apart from the others sitting in electron/dist:
 *
 *   npm run build:electron                          -> Giga-Meter-Setup-2.0.4.exe
 *   npm run build:electron -- --name giga-stg       -> giga-stg.exe
 *   npm run build:electron -- giga-qa-geolocate     -> giga-qa-geolocate.exe
 *   BUILD_NAME=giga-stg npm run build:electron      -> giga-stg.exe
 *
 * Without a name, electron-builder keeps the artifactName from
 * electron/electron-builder.config.json, so existing builds are unchanged.
 *
 * The build mode still comes from src/environments/_environment.prod.ts, or
 * from APP_MODE for a one-off build:
 *
 *   APP_MODE=stg npm run build:electron -- --name giga-stg
 */
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ELECTRON_DIR = path.join(ROOT, 'electron');
// Anything that is safe in a file name on every platform we ship from.
const VALID_NAME = /^[A-Za-z0-9._-]+$/;

function parseName(argv) {
  const args = argv.slice(2);
  let name = process.env.BUILD_NAME || '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--name' || arg === '-n') {
      name = args[++i] || '';
    } else if (arg.startsWith('--name=')) {
      name = arg.slice('--name='.length);
    } else if (!arg.startsWith('-')) {
      name = arg; // bare positional, e.g. `-- giga-stg`
    } else {
      console.error(`[build:electron] unknown option "${arg}"`);
      process.exit(1);
    }
  }

  name = name.trim().replace(/\.exe$/i, '');
  if (name && !VALID_NAME.test(name)) {
    console.error(
      `[build:electron] invalid name "${name}" — use letters, digits, dot, dash or underscore.`
    );
    process.exit(1);
  }
  return name;
}

function run(command, cwd) {
  console.log(`\n[build:electron] ${command}`);
  const result = spawnSync(command, { cwd, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(`[build:electron] failed: ${command}`);
    process.exit(result.status === null ? 1 : result.status);
  }
}

const name = parseName(process.argv);
console.log(
  name
    ? `[build:electron] artifact name: ${name}.exe`
    : '[build:electron] artifact name: default from electron-builder.config.json'
);

run('npx ng build', ROOT);
run('npx cap sync @capacitor-community/electron', ROOT);
// generate-build-mode + tsc + electron-rebuild, as `electron:make-not-publish` does.
run('npm run build', ELECTRON_DIR);

const builder = [
  'npx electron-builder build',
  '-c ./electron-builder.config.json',
  '--x64 --ia32',
];
if (name) {
  // ${ext} is an electron-builder macro, not a shell variable.
  builder.push(`-c.artifactName="${name}.\${ext}"`);
}
run(builder.join(' '), ELECTRON_DIR);

console.log(
  `\n[build:electron] done — see ${path.join('electron', 'dist')}${
    name ? ` (${name}.exe)` : ''
  }`
);
