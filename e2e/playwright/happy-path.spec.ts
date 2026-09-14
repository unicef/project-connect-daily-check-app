import { test, expect, Browser, Page } from '@playwright/test';
import { latestMeasurement, measurementCount } from './db';

// Daily Check App happy path: clean install → school registration → first
// automatic test → realtime upload → manual test → scheduled slot → UI →
// restart.
//
// The steps deliberately share a single page: the checklist is a linear walk
// over the same installation (localStorage + IndexedDB + DB rows accumulate),
// so they run serially and on the same browser context.
//
// Fixtures: seed-spain-project-connect.sql (applied by the e2e compose).
test.describe.configure({ mode: 'serial' });

// The local docker stack by default. `playwright.stg.config.ts` repoints these
// variables at real staging, where there is no DB container to query
// (E2E_SKIP_DB) and the school is a real one, with a giga id that is not known
// upfront.
const API = process.env.E2E_API ?? 'http://localhost:3000/api/v1/';
const COUNTRY_NAME = process.env.E2E_COUNTRY ?? 'Spain';
const SCHOOL_EXTERNAL_ID = process.env.E2E_SCHOOL_ID ?? 'ES-TEST-SCHOOL-01';
// Empty = the expected giga id is unknown; the only check is that it is
// non-empty and consistent between storage and payload.
const EXPECTED_GIGA_ID =
  process.env.E2E_GIGA_ID ?? '11111111-1111-4111-8111-111111111111';
const SKIP_DB = process.env.E2E_SKIP_DB === '1';

// The app queries ipinfo/geojs with retries of up to ~14 s; fixed responses
// keep the test fast and deterministic without touching the real backend.
const FAKE_IP_INFO = {
  ip: '83.56.0.10',
  asn: 'AS3352',
  as_name: 'Telefonica de Espana',
  country: 'ES',
  country_code: 'ES',
  continent: 'EU',
};
const FAKE_GEOJS = {
  ip: '83.56.0.10',
  country: 'Spain',
  country_code: 'ES',
  latitude: '40.4168',
  longitude: '-3.7038',
  organization_name: 'Telefonica de Espana',
};
// Shape of IpInfoData that network.service expects from
// GET /api/v1/ip-metadata/:ip. It is mocked because the containerized backend
// resolves this by calling the real ipinfo (slow/non-deterministic) and the
// searchcountry ion-loading does not close until it answers.
const FAKE_IP_METADATA = {
  ip: '83.56.0.10',
  hostname: 'e2e.local',
  city: 'Madrid',
  region: 'Madrid',
  country: 'ES',
  loc: '40.4168,-3.7038',
  org: 'AS3352 Telefonica de Espana',
  postal: '28001',
  timezone: 'Europe/Madrid',
};

// The scheduler tick runs every 60 s (app.component), so a test that depends
// on it needs at least that minute on top of the real ndt7 run.
const SCHEDULER_TICK = 60_000;
const NDT7_UPLOAD_TIMEOUT = 240_000;

// Ionic keeps previous pages in the DOM (ion-page-hidden), so every selector
// must filter by :visible or it matches hidden copies.
function visibleButton(page: Page, text: string) {
  return page.locator('ion-button:visible', { hasText: text }).first();
}

// The app's ion-loading overlays (up to 15 s in schooldetails) block clicks.
async function waitForLoaderGone(page: Page): Promise<void> {
  await page
    .locator('ion-loading')
    .first()
    .waitFor({ state: 'attached', timeout: 2_000 })
    .catch(() => undefined); // it may never be shown
  await page.waitForFunction(
    () => document.querySelectorAll('ion-loading').length === 0,
    undefined,
    { timeout: 30_000 },
  );
}

/**
 * Closes the "first test completed" modal if it is open: it only appears after
 * the first test of a fresh installation and covers the meter.
 */
async function dismissModalIfOpen(page: Page): Promise<void> {
  const modal = page.locator('ion-modal:visible').first();
  if (!(await modal.isVisible().catch(() => false))) return;
  await modal.locator('button.close-button').first().click();
  await modal.waitFor({ state: 'hidden', timeout: 10_000 });
}

/**
 * Waits for the measurement to land in the DB (the POST answers before the
 * commit). Returns null when running against a remote backend, where there is
 * no Postgres container to query.
 */
async function expectMeasurementRow(where: string) {
  if (SKIP_DB) return null;
  await expect
    .poll(() => latestMeasurement(where), { timeout: 15_000 })
    .not.toBeNull();
  return latestMeasurement(where)!;
}

let page: Page;

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  page = await browser.newPage();

  await page.route('**/api.ipinfo.io/**', (route) =>
    route.fulfill({ json: FAKE_IP_INFO }),
  );
  await page.route('**/ipv4.geojs.io/**', (route) =>
    route.fulfill({ json: FAKE_GEOJS }),
  );
  await page.route('**/api/v1/ip-metadata/**', (route) =>
    route.fulfill({ json: FAKE_IP_METADATA }),
  );

  // Silence the startup test (random 0-15 min delay) so it does not compete
  // with the tests the checklist triggers. A `lastStartupTest` of today makes
  // scheduleStartupTestIfNeeded treat it as already run on every later tick.
  await page.addInitScript(() => {
    const now = String(Date.now());
    localStorage.setItem('startupTestScheduled', now);
    localStorage.setItem('lastStartupTest', now);
    localStorage.setItem('lastMeasurement', now);
  });
});

test.afterAll(async () => {
  await page?.close();
});

test('steps 1-4: school registration → first test → upload with offline_synced=false', async () => {
  // ── 1. Clean install: home is the onboarding screen ──
  await page.goto('/#/home');
  await waitForLoaderGone(page); // home's 6 s loader
  await visibleButton(page, 'Next').click();

  // ── 2. Registration intro: 3 slides + privacy checkbox ──
  await waitForLoaderGone(page);
  await visibleButton(page, 'Next').click();
  await visibleButton(page, 'Next').click();
  await page.locator('ion-checkbox[name="privacy"]:visible').click();
  await visibleButton(page, 'Start Registration').click();

  // ── 3. Country: search, pick and validate against the local backend ──
  await waitForLoaderGone(page); // country network detection loader
  await page.locator('ion-searchbar input:visible').fill(COUNTRY_NAME);
  await page
    .locator('ion-item.dropdown_list:visible', { hasText: COUNTRY_NAME })
    .first()
    .click();
  // The validation (GET dailycheckapp_countries/ES) shows a spinner.
  await page
    .locator('ion-spinner:visible')
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => undefined);
  const confirmBtn = visibleButton(page, 'Confirm');
  await expect(confirmBtn).toBeEnabled();
  await confirmBtn.click();

  // ── 4. School: search by ID against the local backend ──
  await waitForLoaderGone(page);
  await page.locator('input.searchTerm:visible').fill(SCHOOL_EXTERNAL_ID);
  await visibleButton(page, 'Search ID').click();

  // ── 5. Details: single result → Select ──
  await waitForLoaderGone(page);
  await expect(page.locator('ion-item.single_school:visible')).toBeVisible();
  await visibleButton(page, 'Select').click();

  // ── 6. Confirm: POST dailycheckapp_schools and navigation to starttest ──
  const registrationResponse = page.waitForResponse(
    (resp) =>
      resp.url().startsWith(`${API}dailycheckapp_schools`) &&
      resp.request().method() === 'POST',
    { timeout: 30_000 },
  );
  // The upload arrives ~40 s after the registration (real ndt7 test): arm the
  // waiters before confirming.
  const measurementResponse = page.waitForResponse(
    (resp) =>
      resp.url() === `${API}measurements` &&
      resp.request().method() === 'POST',
    { timeout: NDT7_UPLOAD_TIMEOUT },
  );
  await waitForLoaderGone(page);
  await page.locator('ion-button.yesbtn:visible', { hasText: 'Yes' }).click();

  const registration = await registrationResponse;
  expect(registration.ok()).toBe(true);
  const registrationBody = await registration.json();
  const userId = registrationBody?.data?.user_id;
  expect(userId).toBeTruthy();

  // Registration persisted in localStorage and app on the test screen.
  await page.waitForURL('**/starttest', { timeout: 15_000 });
  const stored = await page.evaluate(() => ({
    schoolId: localStorage.getItem('schoolId'),
    gigaId: localStorage.getItem('gigaId'),
    schoolUserId: localStorage.getItem('schoolUserId'),
  }));
  expect(stored.schoolId).toBeTruthy();
  if (EXPECTED_GIGA_ID) {
    expect(stored.gigaId).toBe(EXPECTED_GIGA_ID);
  } else {
    expect(stored.gigaId).toBeTruthy();
  }
  expect(String(stored.schoolUserId)).toBe(String(userId));

  // ── 7. First automatic test (real ndt7 against M-Lab) → upload ──
  const upload = await measurementResponse;
  expect(upload.ok()).toBe(true);

  const payload = upload.request().postDataJSON();
  expect(payload.offline_synced).toBe(false); // happy path: realtime upload
  expect(payload.scheduled_slot).toBeNull(); // first test, not scheduled
  expect(payload.scheduled_at).toBeNull();
  expect(payload.giga_id_school).toBe(stored.gigaId);
  expect(String(payload.BrowserID)).toBe(String(userId));
  expect(payload.Notes).toBe('first');
  expect(payload.Download).toBeGreaterThan(0);
  expect(payload.Upload).toBeGreaterThan(0);

  // The first test lands in the DB with no slot context.
  const row = await expectMeasurementRow(`notes = 'first'`);
  if (row) {
    expect(row.offline_synced).toBe(false);
    expect(row.scheduled_slot).toBeNull();
    expect(row.scheduled_at).toBeNull();
    expect(row.giga_id_school).toBe(stored.gigaId);
  }

  // Nothing was left in the offline queue: the record was uploaded in realtime.
  const pendingQueue = await page.evaluate(async () => {
    const openReq = indexedDB.open('connectivity_measurements_db');
    return new Promise<number>((resolve) => {
      openReq.onsuccess = () => {
        const db = openReq.result;
        if (!db.objectStoreNames.contains('measurements')) {
          resolve(0);
          return;
        }
        const countReq = db
          .transaction('measurements', 'readonly')
          .objectStore('measurements')
          .count();
        countReq.onsuccess = () => resolve(countReq.result);
        countReq.onerror = () => resolve(-1);
      };
      openReq.onerror = () => resolve(-1);
    });
  });
  expect(pendingQueue).toBe(0);
});

test('step 5: manual test → DB row with no slot context', async () => {
  // The first test triggers a congratulations modal that covers the meter.
  await dismissModalIfOpen(page);

  // After a completed test the circular meter reads "TEST AGAIN": it is the
  // control the user taps to trigger a manual test (startNDT('manual')).
  const meter = page.locator('div.circular-progress-container:visible').first();
  await expect(meter).toBeVisible();

  const measurementResponse = page.waitForResponse(
    (resp) =>
      resp.url() === `${API}measurements` &&
      resp.request().method() === 'POST' &&
      resp.request().postDataJSON()?.Notes === 'manual',
    { timeout: NDT7_UPLOAD_TIMEOUT },
  );
  await meter.click();

  const upload = await measurementResponse;
  expect(upload.ok()).toBe(true);

  // A manual test belongs to no slot: neither slot nor scheduled time.
  const payload = upload.request().postDataJSON();
  expect(payload.Notes).toBe('manual');
  expect(payload.offline_synced).toBe(false);
  expect(payload.scheduled_slot).toBeNull();
  expect(payload.scheduled_at).toBeNull();
  expect(payload.Download).toBeGreaterThan(0);

  const row = await expectMeasurementRow(`notes = 'manual'`);
  if (row) {
    expect(row.offline_synced).toBe(false);
    expect(row.scheduled_slot).toBeNull();
    expect(row.scheduled_at).toBeNull();
  }
});

test('step 6: scheduled slot → DB row with slot and scheduled_at, no retries', async () => {
  test.setTimeout(SCHEDULER_TICK + NDT7_UPLOAD_TIMEOUT + 60_000);

  // Waiting for a real slot would take hours: an expired semaphore is injected
  // for the morning slot (choice in the past, window still open) and the
  // scheduler's 60 s tick is left to pick it up as it does in production.
  //
  // getSemaphore() keeps the current semaphore when it has a `choice`, the same
  // intervalType as the one due now and a `start` that is not later — hence
  // start being 12 h in the past. scheduledTesting is off by default, so it has
  // to be enabled or getSemaphore() clears the semaphore on every tick.
  const scheduledAt = await page.evaluate(() => {
    const now = Date.now();
    const scheduled = now - 90 * 60 * 1000; // "originally planned" time
    const settings = JSON.parse(
      localStorage.getItem('savedSettings') || '{}',
    );
    settings.scheduledTesting = true;
    localStorage.setItem('savedSettings', JSON.stringify(settings));
    localStorage.setItem(
      'scheduleSemaphore',
      JSON.stringify({
        start: now - 12 * 60 * 60 * 1000,
        end: now + 60 * 60 * 1000, // open window: the test must run
        choice: now - 1000, // expired: fires on the next tick
        scheduledAt: scheduled,
        slot: 'morning',
        intervalType: 'daily',
        retryAttempts: 0,
        backoffLevel: 0,
      }),
    );
    return scheduled;
  });

  const measurementResponse = page.waitForResponse(
    (resp) =>
      resp.url() === `${API}measurements` &&
      resp.request().method() === 'POST' &&
      resp.request().postDataJSON()?.scheduled_slot === 'morning',
    { timeout: SCHEDULER_TICK + NDT7_UPLOAD_TIMEOUT },
  );

  const upload = await measurementResponse;
  expect(upload.ok()).toBe(true);

  const payload = upload.request().postDataJSON();
  expect(payload.scheduled_slot).toBe('morning');
  expect(payload.scheduled_at).toBe(new Date(scheduledAt).toISOString());
  expect(payload.offline_synced).toBe(false);
  expect(payload.Download).toBeGreaterThan(0);

  const row = await expectMeasurementRow(`scheduled_slot = 'morning'`);
  if (row) {
    expect(row.offline_synced).toBe(false);
    expect(row.scheduled_slot).toBe('morning');
    // scheduled_at keeps the planned time, not the execution time.
    expect(row.scheduled_at).toBe(new Date(scheduledAt).toISOString());
  }

  // Happy path: the test passed on the first attempt. The scheduler clears the
  // semaphore on success, so no retries are left pending.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const raw = localStorage.getItem('scheduleSemaphore');
          if (!raw) return 0;
          return JSON.parse(raw).retryAttempts || 0;
        }),
      { timeout: 15_000 },
    )
    .toBe(0);
});

test('step 7: the UI reflects the measurements from the previous steps', async () => {
  // Local history: the three tests (first, manual, slot) were all recorded.
  const history = await page.evaluate(() => {
    const raw = localStorage.getItem('historicalData');
    return raw ? JSON.parse(raw).measurements.length : 0;
  });
  expect(history).toBeGreaterThanOrEqual(3);

  // And the DB has the three rows for the school (local stack only).
  if (!SKIP_DB) {
    const gigaId = await page.evaluate(() => localStorage.getItem('gigaId'));
    expect(measurementCount(gigaId!)).toBeGreaterThanOrEqual(3);
  }

  // The "latest measurement" card is visible and shows figures, not blanks.
  const latest = page.locator('ion-label.latest_measurement:visible').first();
  await expect(latest).toBeVisible();
  const footer = page.locator('ion-card.footer-card:visible').first();
  await expect(footer).toHaveText(/\d/);
});

test('step 8: restart → the registration persists and the scheduler is re-armed', async () => {
  const before = await page.evaluate(() => ({
    schoolId: localStorage.getItem('schoolId'),
    gigaId: localStorage.getItem('gigaId'),
  }));

  await page.reload();
  await waitForLoaderGone(page);

  // It does not go back to onboarding: the app starts straight on the test screen.
  await page.waitForURL('**/starttest', { timeout: 30_000 });
  await expect(
    page.locator('div.circular-progress-container:visible').first(),
  ).toBeVisible();

  const after = await page.evaluate(() => ({
    schoolId: localStorage.getItem('schoolId'),
    gigaId: localStorage.getItem('gigaId'),
  }));
  expect(after.schoolId).toBe(before.schoolId);
  expect(after.gigaId).toBe(before.gigaId);

  // The scheduler re-arms itself: after the restart the tick recreates a
  // semaphore with its window and a chosen time inside it.
  const readSemaphore = () =>
    page.evaluate(() => {
      const raw = localStorage.getItem('scheduleSemaphore');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.choice ? parsed : null;
    });

  await expect
    .poll(readSemaphore, { timeout: SCHEDULER_TICK + 30_000 })
    .not.toBeNull();

  const semaphore = await readSemaphore();
  expect(semaphore.intervalType).toBe('daily');
  expect(semaphore.choice).toBeGreaterThanOrEqual(semaphore.start);
  expect(semaphore.choice).toBeLessThanOrEqual(semaphore.end);
});
