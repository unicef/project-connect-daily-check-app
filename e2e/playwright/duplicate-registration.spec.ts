import { test, expect, Browser, Page } from '@playwright/test';
import { schoolRegistrationCount } from './db';

// Regression test for the duplicate registration bug: the confirmation screen
// created one `dailycheckapp_school` row (with its own user_id) per tap on
// "Yes", because the button had no re-entrancy guard and the loader dismissed
// itself after 4 s, leaving the screen apparently dead while the registration
// was still in flight.
//
// Fixtures: the same as the happy path (seed-spain, applied by the e2e
// compose). This spec creates its own page, so it does not depend on the state
// happy-path.spec.ts leaves behind — it only measures the delta of rows in the
// DB, which is shared.
test.describe.configure({ mode: 'serial' });

const API = process.env.E2E_API ?? 'http://localhost:3000/api/v1/';
const COUNTRY_NAME = process.env.E2E_COUNTRY ?? 'Spain';
const SCHOOL_EXTERNAL_ID = process.env.E2E_SCHOOL_ID ?? 'ES-TEST-SCHOOL-01';
const EXPECTED_GIGA_ID =
  process.env.E2E_GIGA_ID ?? '11111111-1111-4111-8111-111111111111';
const SKIP_DB = process.env.E2E_SKIP_DB === '1';

// Against the local backend the registration POST answers in milliseconds, so
// without a delay there would be no window in which to tap "Yes" again and the
// test would pass even with the bug present. This delay simulates the slow
// machine from the report. It is longer than the 4 s auto-dismiss the loader
// used to have, so the spec also catches anyone passing it a `duration` again.
const REGISTRATION_DELAY = 6_000;
const EXTRA_TAPS = 5;
const TAP_INTERVAL = 1_000;

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
let registrationPosts = 0;

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

  // Delay the registration and count how many times it is sent. The counter
  // lives here (and not in page.on('response')) so it also counts the POSTs
  // still in flight if the test ends before they answer.
  await page.route(`${API}dailycheckapp_schools`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    registrationPosts += 1;
    await new Promise((resolve) => setTimeout(resolve, REGISTRATION_DELAY));
    await route.continue();
  });

  // Silence the startup test (random 0-15 min delay) so it does not compete
  // with the registration.
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

test('tapping "Yes" several times registers the school only once', async () => {
  const rowsBefore = SKIP_DB ? null : schoolRegistrationCount(EXPECTED_GIGA_ID);

  // ── Registration up to the confirmation screen (happy path steps 1-5) ──
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

  // ── Impatient user: one tap plus five more while the POST is in flight ──
  await waitForLoaderGone(page);
  const yesBtn = page
    .locator('ion-button.yesbtn:visible', { hasText: 'Yes' })
    .first();
  await yesBtn.click();

  // The button is disabled as soon as the registration starts.
  await expect(yesBtn).toHaveAttribute('aria-disabled', 'true');

  // dispatchEvent skips the "clickable" check, so the test covers the
  // component guard and not just the template's [disabled] binding.
  for (let i = 0; i < EXTRA_TAPS; i++) {
    await page.waitForTimeout(TAP_INTERVAL);
    await yesBtn.dispatchEvent('click').catch(() => undefined);
  }

  // ~5 s after the first tap the loader is still on screen: it no longer
  // dismisses itself after 4 s while the registration is in flight.
  await expect(page.locator('ion-loading').first()).toBeAttached();

  await page.waitForURL('**/starttest', { timeout: 30_000 });

  expect(registrationPosts).toBe(1);

  if (rowsBefore !== null) {
    await expect
      .poll(() => schoolRegistrationCount(EXPECTED_GIGA_ID), { timeout: 15_000 })
      .toBe(rowsBefore + 1);
  }
});
