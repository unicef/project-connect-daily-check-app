import { test, expect, Browser, Page } from '@playwright/test';
import { latestMeasurement, measurementCount } from './db';

// Happy path del Daily Check App (plan 0010): instalación limpia → registro de
// escuela → primer test automático → upload en tiempo real → test manual →
// slot programado → UI → reinicio.
//
// Los pasos comparten una única página a propósito: el checklist es un recorrido
// lineal sobre la misma instalación (localStorage + IndexedDB + filas en la DB
// se acumulan), así que corren en serie y sobre el mismo contexto de browser.
//
// Fixtures: seed-spain-project-connect.sql (aplicado por el compose de e2e).
test.describe.configure({ mode: 'serial' });

// Por defecto, el stack local de docker. `playwright.stg.config.ts` reapunta
// estas variables al staging real, donde no hay contenedor de DB al que
// consultar (E2E_SKIP_DB) y la escuela es una de verdad, con un giga id que no
// conocemos de antemano.
const API = process.env.E2E_API ?? 'http://localhost:3000/api/v1/';
const COUNTRY_NAME = process.env.E2E_COUNTRY ?? 'Spain';
const SCHOOL_EXTERNAL_ID = process.env.E2E_SCHOOL_ID ?? 'ES-TEST-SCHOOL-01';
// Vacío = no se conoce el giga id esperado; se comprueba solo que sea no vacío
// y coherente entre storage y payload.
const EXPECTED_GIGA_ID =
  process.env.E2E_GIGA_ID ?? '11111111-1111-4111-8111-111111111111';
const SKIP_DB = process.env.E2E_SKIP_DB === '1';

// La app consulta ipinfo/geojs con reintentos de hasta ~14 s; respuestas fijas
// mantienen el test rápido y determinista sin tocar el backend real.
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
// Shape de IpInfoData que network.service espera de GET /api/v1/ip-metadata/:ip.
// Se mockea porque el backend containerizado resuelve esto llamando a ipinfo
// real (lento/no determinista) y el ion-loading de searchcountry no se cierra
// hasta que responde.
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

// El tick del scheduler corre cada 60 s (app.component), así que un test que
// dependa de él necesita al menos ese minuto además del ndt7 real.
const SCHEDULER_TICK = 60_000;
const NDT7_UPLOAD_TIMEOUT = 240_000;

// Ionic mantiene las páginas anteriores en el DOM (ion-page-hidden), así que
// todo selector debe filtrar por :visible o matchea copias ocultas.
function visibleButton(page: Page, text: string) {
  return page.locator('ion-button:visible', { hasText: text }).first();
}

// Los ion-loading de la app (hasta 15 s en schooldetails) bloquean los clics.
async function waitForLoaderGone(page: Page): Promise<void> {
  await page
    .locator('ion-loading')
    .first()
    .waitFor({ state: 'attached', timeout: 2_000 })
    .catch(() => undefined); // puede no llegar a mostrarse
  await page.waitForFunction(
    () => document.querySelectorAll('ion-loading').length === 0,
    undefined,
    { timeout: 30_000 },
  );
}

/**
 * Cierra el modal de "primer test completado" si está abierto: aparece solo
 * tras el primer test de una instalación nueva y tapa el medidor.
 */
async function dismissModalIfOpen(page: Page): Promise<void> {
  const modal = page.locator('ion-modal:visible').first();
  if (!(await modal.isVisible().catch(() => false))) return;
  await modal.locator('button.close-button').first().click();
  await modal.waitFor({ state: 'hidden', timeout: 10_000 });
}

/**
 * Espera a que la medición aterrice en la DB (el POST responde antes del
 * commit). Devuelve null cuando se corre contra un backend remoto, donde no hay
 * contenedor de Postgres al que consultar.
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

  // Silenciar el startup test (delay aleatorio de 0-15 min) para que no compita
  // con los tests que dispara el checklist. `lastStartupTest` de hoy hace que
  // scheduleStartupTestIfNeeded lo dé por corrido en todos los ticks siguientes.
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

test('pasos 1-4: registro de escuela → primer test → upload con upload_failed=false', async () => {
  // ── 1. Instalación limpia: home es la pantalla de onboarding ──
  await page.goto('/#/home');
  await waitForLoaderGone(page); // loader de 6 s de home
  await visibleButton(page, 'Next').click();

  // ── 2. Intro de registro: 3 slides + checkbox de privacidad ──
  await waitForLoaderGone(page);
  await visibleButton(page, 'Next').click();
  await visibleButton(page, 'Next').click();
  await page.locator('ion-checkbox[name="privacy"]:visible').click();
  await visibleButton(page, 'Start Registration').click();

  // ── 3. País: buscar, elegir y validar contra el backend local ──
  await waitForLoaderGone(page); // loader de detección de red del país
  await page.locator('ion-searchbar input:visible').fill(COUNTRY_NAME);
  await page
    .locator('ion-item.dropdown_list:visible', { hasText: COUNTRY_NAME })
    .first()
    .click();
  // La validación (GET dailycheckapp_countries/ES) muestra un spinner.
  await page
    .locator('ion-spinner:visible')
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => undefined);
  const confirmBtn = visibleButton(page, 'Confirm');
  await expect(confirmBtn).toBeEnabled();
  await confirmBtn.click();

  // ── 4. Escuela: búsqueda por ID contra el backend local ──
  await waitForLoaderGone(page);
  await page.locator('input.searchTerm:visible').fill(SCHOOL_EXTERNAL_ID);
  await visibleButton(page, 'Search ID').click();

  // ── 5. Detalle: resultado único → Select ──
  await waitForLoaderGone(page);
  await expect(page.locator('ion-item.single_school:visible')).toBeVisible();
  await visibleButton(page, 'Select').click();

  // ── 6. Confirmar: POST dailycheckapp_schools y navegación a starttest ──
  const registrationResponse = page.waitForResponse(
    (resp) =>
      resp.url().startsWith(`${API}dailycheckapp_schools`) &&
      resp.request().method() === 'POST',
    { timeout: 30_000 },
  );
  // El upload llega ~40 s después del registro (test ndt7 real): dejar los
  // waiters armados antes de confirmar.
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

  // Registro persistido en localStorage y app en la pantalla de test.
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

  // ── 7. Primer test automático (ndt7 real contra M-Lab) → upload ──
  const upload = await measurementResponse;
  expect(upload.ok()).toBe(true);

  const payload = upload.request().postDataJSON();
  expect(payload.upload_failed).toBe(false); // camino feliz: subida en tiempo real
  expect(payload.scheduled_slot).toBeNull(); // primer test, no programado
  expect(payload.scheduled_at).toBeNull();
  expect(payload.giga_id_school).toBe(stored.gigaId);
  expect(String(payload.BrowserID)).toBe(String(userId));
  expect(payload.Notes).toBe('first');
  expect(payload.Download).toBeGreaterThan(0);
  expect(payload.Upload).toBeGreaterThan(0);

  // El primer test aterriza en la DB sin contexto de slot.
  const row = await expectMeasurementRow(`notes = 'first'`);
  if (row) {
    expect(row.upload_failed).toBe(false);
    expect(row.scheduled_slot).toBeNull();
    expect(row.scheduled_at).toBeNull();
    expect(row.giga_id_school).toBe(stored.gigaId);
  }

  // Nada quedó en la cola offline: el registro se subió en tiempo real.
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

test('paso 5: test manual → fila en DB sin contexto de slot', async () => {
  // El primer test dispara un modal de felicitación que tapa el medidor.
  await dismissModalIfOpen(page);

  // Tras un test completado el medidor circular queda en "TEST AGAIN": es el
  // control con el que el usuario dispara un test manual (startNDT('manual')).
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

  // Un test manual no pertenece a ningún slot: sin slot ni hora programada.
  const payload = upload.request().postDataJSON();
  expect(payload.Notes).toBe('manual');
  expect(payload.upload_failed).toBe(false);
  expect(payload.scheduled_slot).toBeNull();
  expect(payload.scheduled_at).toBeNull();
  expect(payload.Download).toBeGreaterThan(0);

  const row = await expectMeasurementRow(`notes = 'manual'`);
  if (row) {
    expect(row.upload_failed).toBe(false);
    expect(row.scheduled_slot).toBeNull();
    expect(row.scheduled_at).toBeNull();
  }
});

test('paso 6: slot programado → fila en DB con slot y scheduled_at, sin reintentos', async () => {
  test.setTimeout(SCHEDULER_TICK + NDT7_UPLOAD_TIMEOUT + 60_000);

  // Esperar a que llegue un slot real tardaría horas: se inyecta un semáforo
  // vencido para el slot A (choice en el pasado, ventana todavía abierta) y se
  // deja que el tick de 60 s del scheduler lo recoja como en producción.
  //
  // getSemaphore() conserva el semáforo actual si tiene `choice`, el mismo
  // intervalType que el que tocaría ahora y un `start` no posterior — de ahí
  // que start quede 12 h atrás. scheduledTesting viene desactivado por defecto,
  // así que hay que habilitarlo o getSemaphore() lo vacía en cada tick.
  const scheduledAt = await page.evaluate(() => {
    const now = Date.now();
    const scheduled = now - 90 * 60 * 1000; // hora "originalmente planificada"
    const settings = JSON.parse(
      localStorage.getItem('savedSettings') || '{}',
    );
    settings.scheduledTesting = true;
    localStorage.setItem('savedSettings', JSON.stringify(settings));
    localStorage.setItem(
      'scheduleSemaphore',
      JSON.stringify({
        start: now - 12 * 60 * 60 * 1000,
        end: now + 60 * 60 * 1000, // ventana abierta: el test debe correr
        choice: now - 1000, // vencido: dispara en el próximo tick
        scheduledAt: scheduled,
        slot: 'A',
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
      resp.request().postDataJSON()?.scheduled_slot === 'A',
    { timeout: SCHEDULER_TICK + NDT7_UPLOAD_TIMEOUT },
  );

  const upload = await measurementResponse;
  expect(upload.ok()).toBe(true);

  const payload = upload.request().postDataJSON();
  expect(payload.scheduled_slot).toBe('A');
  expect(payload.scheduled_at).toBe(new Date(scheduledAt).toISOString());
  expect(payload.upload_failed).toBe(false);
  expect(payload.Download).toBeGreaterThan(0);

  const row = await expectMeasurementRow(`scheduled_slot = 'A'`);
  if (row) {
    expect(row.upload_failed).toBe(false);
    expect(row.scheduled_slot).toBe('A');
    // scheduled_at conserva la hora planificada, no la de ejecución.
    expect(row.scheduled_at).toBe(new Date(scheduledAt).toISOString());
  }

  // Camino feliz: el test pasó al primer intento. El scheduler limpia el
  // semáforo al tener éxito, así que no quedan reintentos pendientes.
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

test('paso 7: la UI refleja las mediciones de los pasos anteriores', async () => {
  // Historial local: los tres tests (first, manual, slot) quedaron registrados.
  const history = await page.evaluate(() => {
    const raw = localStorage.getItem('historicalData');
    return raw ? JSON.parse(raw).measurements.length : 0;
  });
  expect(history).toBeGreaterThanOrEqual(3);

  // Y la DB tiene las tres filas para la escuela (solo con stack local).
  if (!SKIP_DB) {
    const gigaId = await page.evaluate(() => localStorage.getItem('gigaId'));
    expect(measurementCount(gigaId!)).toBeGreaterThanOrEqual(3);
  }

  // La tarjeta de "última medición" está visible y muestra cifras, no en blanco.
  const latest = page.locator('ion-label.latest_measurement:visible').first();
  await expect(latest).toBeVisible();
  const footer = page.locator('ion-card.footer-card:visible').first();
  await expect(footer).toHaveText(/\d/);
});

test('paso 8: reinicio → el registro persiste y el scheduler queda armado', async () => {
  const before = await page.evaluate(() => ({
    schoolId: localStorage.getItem('schoolId'),
    gigaId: localStorage.getItem('gigaId'),
  }));

  await page.reload();
  await waitForLoaderGone(page);

  // No vuelve al onboarding: la app arranca directamente en la pantalla de test.
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

  // El scheduler vuelve a armarse solo: tras el reinicio el tick recrea un
  // semáforo con su ventana y su hora elegida dentro de ella.
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
