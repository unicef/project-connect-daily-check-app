/**
 * Analytics helpers for the Electron main process.
 *
 * The main process does not talk to PostHog itself: it hands events to the
 * renderer through sendTelemetry() (index.ts), whose SDK queues them. These
 * helpers only work out what to send. The event names match
 * src/app/analytics/analytics-events.ts (MainProcessEvent), which this side
 * cannot import.
 *
 * Privacy: no paths, user names, IPs or URLs with tokens leave through here.
 */
import fs from 'fs-extra';
import path from 'path';

const STATE_FILE = 'analytics-state.json';

export interface LaunchReport {
  event: 'app_first_launch' | 'app_updated' | null;
  properties: Record<string, any>;
}

/**
 * Decides whether this launch is the first on this PC, the first after an
 * update, or an ordinary one, and records it in userData.
 *
 * userData survives updates and is deleted on uninstall (NSIS
 * deleteAppDataOnUninstall), so a reinstall counts as a first launch again.
 * A PC upgrading from a build older than this file has userData but no state
 * file yet: `hadUserDataBefore` (Chromium's Local Storage folder existed
 * before this launch created anything) tells that case apart from a first
 * launch, and it is reported as an update from an unknown version.
 */
export function recordLaunch(
  userDataPath: string,
  version: string,
  hadUserDataBefore: boolean,
  now: Date = new Date()
): LaunchReport {
  const file = path.join(userDataPath, STATE_FILE);
  let state: { firstLaunchAt?: string; lastVersion?: string } = {};
  try {
    state = fs.readJsonSync(file);
  } catch {
    state = {};
  }

  let report: LaunchReport = { event: null, properties: {} };
  if (!state.lastVersion) {
    report = hadUserDataBefore
      ? {
          event: 'app_updated',
          properties: { from_version: null, to_version: version },
        }
      : { event: 'app_first_launch', properties: { version } };
  } else if (state.lastVersion !== version) {
    report = {
      event: 'app_updated',
      properties: { from_version: state.lastVersion, to_version: version },
    };
  }

  try {
    fs.ensureDirSync(userDataPath);
    fs.writeJsonSync(file, {
      firstLaunchAt: state.firstLaunchAt ?? now.toISOString(),
      lastVersion: version,
    });
  } catch (error) {
    console.warn('[analytics] could not save the launch state:', error?.message);
  }
  return report;
}

/** Whether Chromium's Local Storage already existed: an earlier launch ran. */
export function hadUserData(userDataPath: string): boolean {
  try {
    return fs.existsSync(path.join(userDataPath, 'Local Storage'));
  } catch {
    return false;
  }
}

/**
 * all_users (Program Files, the documented install), per_user (AppData) or
 * other (a development or unpacked run). The setup guide insists on "all
 * users": a per-user install stops measuring when another user logs on.
 */
export function installScope(
  exePath: string,
  env: NodeJS.ProcessEnv = process.env
): 'all_users' | 'per_user' | 'other' {
  const exe = (exePath || '').toLowerCase();
  const programFiles = [
    env.ProgramFiles,
    env['ProgramFiles(x86)'],
    env.ProgramW6432,
  ]
    .filter(Boolean)
    .map((dir) => String(dir).toLowerCase());
  if (programFiles.some((dir) => exe.startsWith(dir))) {
    return 'all_users';
  }
  if (env.LOCALAPPDATA && exe.startsWith(env.LOCALAPPDATA.toLowerCase())) {
    return 'per_user';
  }
  return 'other';
}

/** Why electron-updater failed, as a short code. */
export function classifyUpdateError(message: string | null | undefined): string {
  const text = message ?? '';
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|net::ERR_|socket hang up/i.test(text)) {
    return 'network';
  }
  if (/sha512|checksum|signature|not signed|publisherName/i.test(text)) {
    return 'signature';
  }
  if (/ENOSPC/i.test(text)) {
    return 'disk_full';
  }
  if (/EPERM|EACCES|EBUSY/i.test(text)) {
    return 'permission';
  }
  if (/\b404\b|Cannot find latest|Cannot find channel/i.test(text)) {
    return 'feed_not_found';
  }
  return 'unknown';
}

/**
 * A message made safe to send: URLs cut to their host, Windows paths (which
 * contain the user name), IPs and e-mail addresses masked, 200 characters max.
 */
export function sanitizeForTelemetry(raw: unknown, max = 200): string | null {
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }
  const text = String(raw)
    .replace(/https?:\/\/([^/\s'"]+)[^\s'"]*/g, '$1')
    .replace(/[A-Za-z]:\\[^\s'"]*/g, '<path>')
    .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '<ip>')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>');
  return text.length > max ? text.slice(0, max) : text;
}
