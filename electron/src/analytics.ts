import { app } from 'electron';
import { PostHog } from 'posthog-node';

/**
 * PostHog (product analytics) for the Electron MAIN process.
 *
 * Server-side counterpart to the renderer's posthog-js
 * (src/app/services/posthog.service.ts). It captures app-level telemetry the
 * UI cannot see — launch, auto-update outcomes, quit.
 *
 * Identity model:
 *  - The main process has no persistence of its own, so it does NOT invent a
 *    device id (and deliberately does NOT use the hardware ID, which can be
 *    null or collide). Instead the renderer relays its own PostHog anonymous
 *    distinct_id (and the school's GigaID) over IPC; we adopt both so main and
 *    renderer events are the same person and roll up under the same school.
 *  - Events fired before that relay arrives (e.g. app_launched at startup) are
 *    buffered and flushed once identity is known.
 *
 * Config comes from environment variables so no secret is committed:
 *   POSTHOG_API_KEY   the project API key (phc_...)
 *   POSTHOG_HOST      optional, defaults to PostHog US Cloud
 *
 * Every operation is wrapped in try/catch so analytics can never crash the app.
 */
const SCHOOL_GROUP = 'school';

// PostHog project API key (phc_...) is a PUBLISHABLE client key — it is meant
// to ship in clients, so baking it in is safe. POSTHOG_API_KEY env var overrides.
const DEFAULT_POSTHOG_API_KEY = 'phc_y8Km5qP2Jx3znSMppNz4NHUShqfnNDFhK5Pf8tFnZh5T';

interface QueuedEvent {
  event: string;
  properties?: Record<string, any>;
}

let client: PostHog | null = null;
let distinctId: string | null = null;
let schoolGigaId: string | null = null;
const queue: QueuedEvent[] = [];

export function initPosthog(): void {
  try {
    const apiKey = process.env.POSTHOG_API_KEY || DEFAULT_POSTHOG_API_KEY;
    const host = process.env.POSTHOG_HOST || 'https://eu.i.posthog.com';

    if (!apiKey) {
      console.warn('[PostHog][main] Skipping init: no API key.');
      return;
    }

    // Desktop app can quit shortly after an event; flush each event
    // immediately rather than batching.
    client = new PostHog(apiKey, {
      host,
      flushAt: 1,
      flushInterval: 0,
    });
    console.log('[PostHog][main] initialized.');
  } catch (error) {
    console.warn('[PostHog][main] init failed:', error);
  }
}

/**
 * Adopt the identity relayed from the renderer (its anonymous distinct_id and
 * the school GigaID) and flush any events buffered before it arrived.
 */
export function setPosthogIdentity(
  id: string | null | undefined,
  gigaId: string | number | null | undefined
): void {
  try {
    if (id) {
      distinctId = id;
    }
    if (gigaId != null && gigaId !== '') {
      schoolGigaId = String(gigaId);
    }
    if (distinctId) {
      flushQueue();
    }
  } catch (error) {
    console.warn('[PostHog][main] setPosthogIdentity failed:', error);
  }
}

export function capturePosthog(
  event: string,
  properties?: Record<string, any>
): void {
  try {
    if (!client) {
      return;
    }
    if (!distinctId) {
      // Identity not relayed yet — buffer until the renderer reports in.
      queue.push({ event, properties });
      return;
    }
    sendEvent(event, properties);
  } catch (error) {
    console.warn('[PostHog][main] capture failed:', error);
  }
}

function sendEvent(event: string, properties?: Record<string, any>): void {
  if (!client || !distinctId) {
    return;
  }
  client.capture({
    distinctId,
    event,
    properties: {
      ...properties,
      app_version: app.getVersion(),
      platform: process.platform,
      source: 'electron-main',
      ...(schoolGigaId ? { giga_id_school: schoolGigaId } : {}),
    },
    ...(schoolGigaId ? { groups: { [SCHOOL_GROUP]: schoolGigaId } } : {}),
  });
}

function flushQueue(): void {
  while (queue.length > 0) {
    const item = queue.shift();
    if (item) {
      sendEvent(item.event, item.properties);
    }
  }
}

/** Flush and close the client. Call on app quit. */
export async function shutdownPosthog(): Promise<void> {
  try {
    if (client) {
      await client.shutdown();
      client = null;
    }
  } catch (error) {
    console.warn('[PostHog][main] shutdown failed:', error);
  }
}
