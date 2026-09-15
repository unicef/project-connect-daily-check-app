import { test, expect, Browser, Page, Route } from '@playwright/test';
import { measurementCount } from './db';

// Regression test for the stalled upload: the measurement upload waits for
// geolocation before it posts, and the geolocate request had no timeout. When
// that request stayed pending, the finished test was never uploaded, never
// queued offline and never added to the local history, and the screen stayed
// on "Running Test (Upload)".
//
// In a plain browser there is no Electron bridge, so the Wi-Fi list is empty
// and the app never calls geolocate at all. This spec injects a minimal bridge
// with two access points to force that call, and holds every geolocate request
// open for the whole test.
//
// Fixtures: the same as the happy path (seed-spain, applied by the e2e
// compose). It creates its own page and only measures deltas in the DB.
test.describe.configure({ mode: 'serial' });

const API = process.env.E2E_API ?? 'http://localhost:3000/api/v1/';
const COUNTRY_NAME = process.env.E2E_COUNTRY ?? 'Spain';
const SCHOOL_EXTERNAL_ID = process.env.E2E_SCHOOL_ID ?? 'ES-TEST-SCHOOL-01';
const EXPECTED_GIGA_ID =
  process.env.E2E_GIGA_ID ?? '11111111-1111-4111-8111-111111111111';
const SKIP_DB = process.env.E2E_SKIP_DB === '1';

// Real ndt7 run (~25-45 s) plus two timed-out geolocate attempts (~21 s).
const UPLOAD_TIMEOUT = 240_000;

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

// Ionic leaves previous pages in the DOM (ion-page-hidden): every selector
// filters by :visible or it matches hidden copies.
function visibleButton(page: Page, text: string) {
  return page.locator('ion-button:visible', { hasText: text }).first();
}

async function waitForLoaderGone(page: Page): Promise<void> {
  await page
    .locator('ion-loading')
    .first()
    .waitFor({ state: 'attached', timeout: 2_000 })
    .catch(() => undefined);
  await page.waitForFunction(
    () => document.querySelectorAll('ion-loading').length === 0,
    undefined,
    { timeout: 30_000 },
  );
}

let page: Page;
// Held open until the page closes: never fulfilled, never aborted.
const pendingGeolocate: Route[] = [];

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
  await page.route(`${API}geolocation/geolocate`, (route) => {
    pendingGeolocate.push(route);
  });

  await page.addInitScript(() => {
    // Silence the startup test (random 0-15 min delay) so it does not compete
    // with the first test.
    const now = String(Date.now());
    localStorage.setItem('startupTestScheduled', now);
    localStorage.setItem('lastStartupTest', now);
    localStorage.setItem('lastMeasurement', now);

    // Minimal Electron bridge: a Wi-Fi scan with two access points, so the app
    // has something to geolocate. Listener registrations are no-ops and every
    // other call resolves to null, which the app already handles as "not
    // available".
    const wifi = [
      { ssid: 'e2e-ap-1', signal: -40, macAddress: 'aa:bb:cc:dd:ee:01' },
      { ssid: 'e2e-ap-2', signal: -65, macAddress: 'aa:bb:cc:dd:ee:02' },
    ];
    const bridge: Record<string, unknown> = {
      getWifiList: async () => wifi,
      onHardwareId: () => undefined,
      onHardwareIdError: () => undefined,
      removeHardwareIdListener: () => undefined,
      onTelemetryEvent: () => undefined,
    };
    (window as any).electronAPI = new Proxy(bridge, {
      get: (target, prop) =>
        typeof prop !== 'string'
          ? undefined
          : prop in target
            ? target[prop]
            : async () => null,
    });
  });
});

test.afterAll(async () => {
  await page?.close();
});

test('a geolocate request that never answers does not block the upload', async () => {
  test.setTimeout(360_000);
  const measurementsBefore = SKIP_DB ? null : measurementCount(EXPECTED_GIGA_ID);

  // ── Registration (happy path steps 1-6) ──
  await page.goto('/#/home');
  await waitForLoaderGone(page);
  await visibleButton(page, 'Next').click();

  await waitForLoaderGone(page);
  await visibleButton(page, 'Next').click();
  await visibleButton(page, 'Next').click();
  await page.locator('ion-checkbox[name="privacy"]:visible').click();
  await visibleButton(page, 'Start Registration').click();

  await waitForLoaderGone(page);
  await page.locator('ion-searchbar input:visible').fill(COUNTRY_NAME);
  await page
    .locator('ion-item.dropdown_list:visible', { hasText: COUNTRY_NAME })
    .first()
    .click();
  await page
    .locator('ion-spinner:visible')
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => undefined);
  const confirmBtn = visibleButton(page, 'Confirm');
  await expect(confirmBtn).toBeEnabled();
  await confirmBtn.click();

  await waitForLoaderGone(page);
  await page.locator('input.searchTerm:visible').fill(SCHOOL_EXTERNAL_ID);
  await visibleButton(page, 'Search ID').click();

  await waitForLoaderGone(page);
  await expect(page.locator('ion-item.single_school:visible')).toBeVisible();
  await visibleButton(page, 'Select').click();

  const measurementResponse = page.waitForResponse(
    (resp) =>
      resp.url() === `${API}measurements` &&
      resp.request().method() === 'POST',
    { timeout: UPLOAD_TIMEOUT },
  );
  await waitForLoaderGone(page);
  await page.locator('ion-button.yesbtn:visible', { hasText: 'Yes' }).click();
  await page.waitForURL('**/starttest', { timeout: 30_000 });

  // ── First automatic test → upload despite the pending geolocate ──
  const upload = await measurementResponse;
  expect(upload.ok()).toBe(true);

  // The upload path did try to geolocate (first attempt + one retry), and got
  // no answer to any request.
  expect(pendingGeolocate.length).toBeGreaterThanOrEqual(2);

  const payload = upload.request().postDataJSON();
  expect(payload.Notes).toBe('first');
  expect(payload.offline_synced).toBe(false);
  // Nothing was ever resolved or cached, so the measurement goes without it.
  expect(payload.geolocation).toBeNull();

  if (measurementsBefore !== null) {
    await expect
      .poll(() => measurementCount(EXPECTED_GIGA_ID), { timeout: 15_000 })
      .toBe(measurementsBefore + 1);
  }

  // The test was also recorded locally, which only happens after the upload
  // settles.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem('historicalData') || 'null')
              ?.measurements?.length ?? 0,
        ),
      { timeout: 15_000 },
    )
    .toBe(1);
});
