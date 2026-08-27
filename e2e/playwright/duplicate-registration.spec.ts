import { test, expect, Browser, Page } from '@playwright/test';
import { schoolRegistrationCount } from './db';

// Regresión del bug de registros duplicados: la pantalla de confirmación creaba
// una fila en `dailycheckapp_school` (con su propio user_id) por cada tap en
// "Yes", porque el botón no tenía guard de reentrada y el loader se cerraba solo
// a los 4 s, dejando la pantalla aparentemente muerta mientras el registro
// seguía en curso.
//
// Fixtures: los mismos que el happy path (seed-spain, aplicado por el compose
// de e2e). Este spec crea su propia página, así que no depende del estado que
// deja happy-path.spec.ts — solo mide el delta de filas en la DB, que sí es
// compartido.
test.describe.configure({ mode: 'serial' });

const API = process.env.E2E_API ?? 'http://localhost:3000/api/v1/';
const COUNTRY_NAME = process.env.E2E_COUNTRY ?? 'Spain';
const SCHOOL_EXTERNAL_ID = process.env.E2E_SCHOOL_ID ?? 'ES-TEST-SCHOOL-01';
const EXPECTED_GIGA_ID =
  process.env.E2E_GIGA_ID ?? '11111111-1111-4111-8111-111111111111';
const SKIP_DB = process.env.E2E_SKIP_DB === '1';

// Contra el backend local el POST de registro responde en milisegundos, así que
// sin retardo no habría ventana en la que tocar "Yes" otra vez y el test pasaría
// incluso con el bug presente. Este retardo simula la máquina lenta del reporte.
// Es mayor que los 4 s del auto-dismiss que tenía el loader, para que el spec
// también detecte si alguien vuelve a pasarle una `duration`.
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

// Ionic deja las páginas anteriores en el DOM (ion-page-hidden): todo selector
// filtra por :visible o matchea copias ocultas.
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

  // Retardar el registro y contar cuántas veces se manda. El contador va aquí
  // (y no en page.on('response')) para que cuente también los POST que se
  // quedan en vuelo si el test termina antes de que respondan.
  await page.route(`${API}dailycheckapp_schools`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    registrationPosts += 1;
    await new Promise((resolve) => setTimeout(resolve, REGISTRATION_DELAY));
    await route.continue();
  });

  // Silenciar el startup test (delay aleatorio de 0-15 min) para que no compita
  // con el registro.
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

test('tocar "Yes" varias veces registra la escuela una sola vez', async () => {
  const rowsBefore = SKIP_DB ? null : schoolRegistrationCount(EXPECTED_GIGA_ID);

  // ── Registro hasta la pantalla de confirmación (pasos 1-5 del happy path) ──
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

  // ── Usuario impaciente: un tap y cinco más mientras el POST está en vuelo ──
  await waitForLoaderGone(page);
  const yesBtn = page
    .locator('ion-button.yesbtn:visible', { hasText: 'Yes' })
    .first();
  await yesBtn.click();

  // El botón queda deshabilitado en cuanto arranca el registro.
  await expect(yesBtn).toHaveAttribute('aria-disabled', 'true');

  // dispatchEvent salta la comprobación de "clickable": así el test cubre el
  // guard del componente y no solo el binding [disabled] del template.
  for (let i = 0; i < EXTRA_TAPS; i++) {
    await page.waitForTimeout(TAP_INTERVAL);
    await yesBtn.dispatchEvent('click').catch(() => undefined);
  }

  // ~5 s después del primer tap el loader sigue en pantalla: ya no se cierra
  // solo a los 4 s mientras el registro sigue en vuelo.
  await expect(page.locator('ion-loading').first()).toBeAttached();

  await page.waitForURL('**/starttest', { timeout: 30_000 });

  expect(registrationPosts).toBe(1);

  if (rowsBefore !== null) {
    await expect
      .poll(() => schoolRegistrationCount(EXPECTED_GIGA_ID), { timeout: 15_000 })
      .toBe(rowsBefore + 1);
  }
});
