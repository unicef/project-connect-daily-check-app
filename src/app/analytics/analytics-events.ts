/**
 * Giga Meter's PostHog tracking plan, in code.
 *
 * Every event the renderer sends is named here, so a dashboard and the code
 * that feeds it can't drift apart through a typo. The events the Electron main
 * process sends (update lifecycle, first launch, hardware ID) are listed too:
 * electron/src cannot import this file, so it repeats the names as strings,
 * and they must stay identical. docs/analytics-tracking-plan.md describes each
 * event, its properties and the dashboard it feeds.
 *
 * Privacy: these events describe how the app behaves, never who uses it.
 * No IP addresses, Wi-Fi names, coordinates, school names, Windows usernames
 * or install paths. Free-text error messages go through sanitizeMessage().
 * The school's name and external ID (public school records) are only on its
 * PostHog group (PosthogService.setSchool), for the dashboards' tables.
 */
export const AnalyticsEvent = {
  // App lifecycle
  AppStarted: 'app_started',
  DeviceHeartbeat: 'device_heartbeat',

  // Onboarding and registration (flow 1)
  OnboardingStarted: 'onboarding_started',
  ConsentAccepted: 'consent_accepted',
  CountryDetected: 'country_detected',
  CountryDetectionFailed: 'country_detection_failed',
  CountryCheckFailed: 'country_check_failed',
  CountryConfirmed: 'country_confirmed',
  SchoolSearchPerformed: 'school_search_performed',
  SchoolSearchFailed: 'school_search_failed',
  SchoolSelected: 'school_selected',
  // Every registration is one app instance: manual (the user picked the
  // school) or auto (the app registered at the school of the PC's existing
  // registration), told apart by registration_source.
  RegistrationCompleted: 'registration_completed',
  RegistrationFailed: 'registration_failed',
  RegistrationLost: 'registration_lost',
  // An install from before app instances attaching its new ID to the
  // registration it has (2.0.4 migration).
  AppInstanceClaimed: 'app_instance_claimed',
  AppInstanceClaimFailed: 'app_instance_claim_failed',
  DeviceDeactivatedRemotely: 'device_deactivated_remotely',
  DeviceStatusCheckFailed: 'device_status_check_failed',
  HardwareIdUnavailable: 'hardware_id_unavailable',

  // Logout and re-registration (flow 4)
  LogoutStarted: 'logout_started',
  LogoutCancelled: 'logout_cancelled',
  LogoutFailed: 'logout_failed',
  LogoutCompleted: 'logout_completed',

  // Measurements, manual and scheduled (flows 2 and 3)
  MeasurementStarted: 'measurement_started',
  MeasurementRetrying: 'measurement_retrying',
  MeasurementCompleted: 'measurement_completed',
  MeasurementFailed: 'measurement_failed',
  ScheduledTestRescheduled: 'scheduled_test_rescheduled',
  ScheduledTestMissed: 'scheduled_test_missed',

  // Delivery to the backend
  MeasurementUploaded: 'measurement_uploaded',
  MeasurementQueuedOffline: 'measurement_queued_offline',
  MeasurementRejected: 'measurement_rejected',
  MeasurementsSynced: 'measurements_synced',
  MeasurementsSyncFailed: 'measurements_sync_failed',
} as const;

export type AnalyticsEventName =
  (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];

/**
 * Sent by the Electron main process (electron/src/index.ts) through the
 * telemetry bridge. Listed for reference; keep in step with the main process.
 */
export const MainProcessEvent = {
  AppLaunched: 'app_launched',
  AppFirstLaunch: 'app_first_launch',
  AppUpdated: 'app_updated',
  AppQuit: 'app_quit',
  UpdateAvailable: 'update_available',
  UpdateDownloaded: 'update_downloaded',
  UpdatePromptAnswered: 'update_prompt_answered',
  UpdateFailed: 'update_failed',
  HardwareIdResolved: 'hardware_id_resolved',
  MainProcessError: 'main_process_error',
} as const;

/** The fields every failure event carries, so one dashboard reads them all. */
export interface FailureProperties {
  /** A short, fixed code: what a dashboard groups by. */
  error_code: string;
  /** The HTTP status, when the failure was an HTTP answer. */
  http_status: number | null;
  /** Host and path of the failed request, with IDs replaced by `:id`. */
  endpoint: string | null;
  /** The message, cleaned of personal data and cut to MAX_MESSAGE_LENGTH. */
  error_message: string | null;
}

export const MAX_MESSAGE_LENGTH = 200;

/**
 * A URL reduced to what helps debugging and nothing else: host and path, with
 * every path segment that is not a plain word (IDs, IPs, hardware IDs, school
 * IDs with digits) replaced by `:id`, and no query string, which is where
 * tokens travel (M-Lab's locate URLs carry an access_token).
 */
export function templateUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url, 'https://app.gigameter.local');
    const segments = parsed.pathname
      .split('/')
      .filter((segment) => segment !== '')
      .map((segment) =>
        /^[A-Za-z_-]+$/.test(segment) || /^v\d+$/.test(segment)
          ? segment
          : ':id'
      );
    return `${parsed.host}/${segments.join('/')}`;
  } catch {
    return null;
  }
}

/**
 * A free-text message made safe to send: URLs reduced by templateUrl(), and
 * IP addresses, MAC addresses, e-mail addresses and Windows paths (which
 * contain the user name) masked. Cut to `max` characters.
 */
export function sanitizeMessage(
  raw: unknown,
  max = MAX_MESSAGE_LENGTH
): string | null {
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }
  let text = typeof raw === 'string' ? raw : String(raw);
  text = text
    .replace(/https?:\/\/[^\s'"<>)]+/g, (url) => templateUrl(url) ?? '<url>')
    .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '<ip>')
    .replace(/\b([0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/gi, '<mac>')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>')
    .replace(/[A-Za-z]:\\[^\s'"]*/g, '<path>');
  return text.length > max ? text.slice(0, max) : text;
}

/** An HTTP status turned into the code dashboards group by. */
export function httpErrorCode(status: number): string {
  if (status === 0) {
    return 'network';
  }
  if (status === 408 || status === 504) {
    return 'timeout';
  }
  if ([400, 401, 403, 404, 409, 422, 429].includes(status)) {
    return `http_${status}`;
  }
  if (status >= 500) {
    return 'http_5xx';
  }
  if (status >= 400) {
    return 'http_4xx';
  }
  return `http_${status}`;
}

/**
 * The standard failure fields for anything a catch block can receive: an
 * Angular HttpErrorResponse (recognised by its numeric status), an rxjs
 * TimeoutError, an Error, or a plain string. `fallbackCode` names failures
 * that fit no other bucket.
 */
export function describeError(
  error: unknown,
  fallbackCode = 'unknown'
): FailureProperties {
  try {
    const err = error as any;
    if (err?.name === 'TimeoutError') {
      return {
        error_code: 'timeout',
        http_status: null,
        endpoint: null,
        error_message: sanitizeMessage(err.message),
      };
    }
    if (err && typeof err === 'object' && typeof err.status === 'number') {
      // The backend's AllExceptionFilter answers { statusCode, message }.
      const body = err.error;
      const serverMessage =
        typeof body === 'string'
          ? body
          : Array.isArray(body?.message)
          ? body.message.join('; ')
          : body?.message;
      return {
        error_code: httpErrorCode(err.status),
        http_status: err.status,
        endpoint: templateUrl(err.url),
        error_message: sanitizeMessage(serverMessage ?? err.message),
      };
    }
    const offline =
      typeof navigator !== 'undefined' && navigator.onLine === false;
    const message = err instanceof Error ? err.message : err;
    return {
      error_code: offline ? 'offline' : fallbackCode,
      http_status: null,
      endpoint: null,
      error_message: sanitizeMessage(message),
    };
  } catch {
    return {
      error_code: fallbackCode,
      http_status: null,
      endpoint: null,
      error_message: null,
    };
  }
}

/**
 * What went wrong in a speed test, from the message ndt7 or the app threw.
 * The phase (where in the test it happened) is tracked separately.
 */
export function classifyMeasurementError(message: string | null): string {
  const text = message ?? '';
  if (/locate\.measurementlab\.net|Could not understand response|locate/i.test(text)) {
    return 'locate_failed';
  }
  if (/did not produce a result/i.test(text)) {
    return 'no_result';
  }
  if (/websocket/i.test(text)) {
    return 'websocket_error';
  }
  if (/timed? ?out|timeout/i.test(text)) {
    return 'timeout';
  }
  if (/fetch|network|ERR_[A-Z_]+/i.test(text)) {
    return 'network';
  }
  return 'unknown';
}

/**
 * Why the backend refused a measurement, when it did. The backend stores a
 * refused measurement in `measurements_failed` and answers 400 with
 * "Failed to add measurement(s) with error...: <reasons>". Sending it again
 * gets the same answer and another `measurements_failed` row, so such a
 * measurement must not stay in the retry queue. Null for every other failure,
 * including other 400s (those keep the old retry behaviour).
 */
export function parseMeasurementRejection(
  error: unknown
): { reason: string } | null {
  const err = error as any;
  if (!err || err.status !== 400) {
    return null;
  }
  const body = err.error;
  const message: string =
    typeof body === 'string' ? body : String(body?.message ?? '');
  if (!/Failed to add measurements? with error/i.test(message)) {
    return null;
  }
  const reasons = new Set<string>();
  if (/school does not exist/i.test(message)) {
    reasons.add('school_doesnt_exist');
  }
  if (/wrong country code/i.test(message)) {
    reasons.add('wrong_country_code');
  }
  if (reasons.size === 0) {
    reasons.add('other');
  }
  return { reason: Array.from(reasons).sort().join(',') };
}

/*
 * The device ID (TECH-8828): the backend's ID for one physical PC across all
 * its app instances, worked out from its firmware UUID, motherboard serial and
 * disk serial. It is the PostHog person; each registration is one app instance
 * on it (appInstanceId, sent as `app_instance_id`). The backend returns it
 * from this app instance's registration and from the status check the app
 * runs at every start; SchoolService remembers it here.
 */
export const DEVICE_ID_KEY = 'device_id';

/** Remembers the device ID the backend returned. Ignores an empty one. */
export function rememberDeviceId(deviceId: unknown): void {
  try {
    if (typeof deviceId === 'string' && deviceId.trim() !== '') {
      localStorage.setItem(DEVICE_ID_KEY, deviceId.trim());
    }
  } catch {
    // Best effort.
  }
}

/** The device ID the backend gave this PC, or null when not known yet. */
export function getRememberedDeviceId(): string | null {
  try {
    return localStorage.getItem(DEVICE_ID_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

/*
 * Flow markers. Two timestamps that registration_completed reads, so the
 * dashboards can show how long registering took and how many registrations
 * follow a logout. Kept outside StorageService on purpose.
 */
const ONBOARDING_STARTED_KEY = 'analytics_onboarding_started_at';
const LOGGED_OUT_AT_KEY = 'analytics_logged_out_at';

/**
 * Remembers when this onboarding started. sessionStorage: it survives the
 * page reloads inside one run of the app, and a restart mid-onboarding just
 * leaves the duration unknown.
 */
export function markOnboardingStarted(now = Date.now()): void {
  try {
    sessionStorage.setItem(ONBOARDING_STARTED_KEY, String(now));
  } catch {
    // Best effort.
  }
}

/** Milliseconds since markOnboardingStarted(), or null when not known. */
export function onboardingDurationMs(now = Date.now()): number | null {
  try {
    const started = Number(sessionStorage.getItem(ONBOARDING_STARTED_KEY));
    return started > 0 && now >= started ? now - started : null;
  } catch {
    return null;
  }
}

/**
 * Remembers that this PC just logged out. Call it after StorageService.clear(),
 * which wipes localStorage.
 */
export function markLoggedOut(now = Date.now()): void {
  try {
    localStorage.setItem(LOGGED_OUT_AT_KEY, String(now));
  } catch {
    // Best effort.
  }
}

/**
 * When this PC last logged out, if it did and has not registered since.
 * Reading it clears it: only the first registration after a logout is a
 * re-registration.
 */
export function takeLoggedOutAt(): number | null {
  try {
    const value = Number(localStorage.getItem(LOGGED_OUT_AT_KEY));
    localStorage.removeItem(LOGGED_OUT_AT_KEY);
    return value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** What a registration sent, as far as registrationProps() reads it. */
export interface RegistrationPayload {
  country_code?: string | null;
  registration_source?: string | null;
  geolocation?: unknown;
  device_hardware_id?: string | null;
  baseboard_serial?: string | null;
  disk_serial?: string | null;
}

/**
 * The properties every registration_completed carries, manual or automatic:
 * how it came about, whether it follows a logout, and what the backend had
 * to work out the device ID from (without a motherboard or disk serial, a
 * firmware UUID shared by several PCs can't tell them apart). Reads, and so
 * clears, the logout marker.
 */
export function registrationProps(
  payload: RegistrationPayload,
  now = Date.now()
): Record<string, unknown> {
  const loggedOutAt = takeLoggedOutAt();
  return {
    country_code: payload.country_code ?? null,
    registration_source: payload.registration_source ?? null,
    is_reregistration: loggedOutAt !== null,
    minutes_since_logout:
      loggedOutAt !== null ? Math.round((now - loggedOutAt) / 60000) : null,
    has_geolocation: !!payload.geolocation,
    has_hardware_id: !!payload.device_hardware_id,
    has_serials: !!(payload.baseboard_serial || payload.disk_serial),
  };
}

/** A count in coarse bands, for properties where the exact number is noise. */
export function bucketCount(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) {
    return 'unknown';
  }
  if (n <= 0) {
    return '0';
  }
  if (n === 1) {
    return '1';
  }
  if (n <= 3) {
    return '2-3';
  }
  if (n <= 10) {
    return '4-10';
  }
  return '11+';
}
