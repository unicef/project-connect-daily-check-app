import { defineConfig } from '@playwright/test';

// Variante de la suite e2e contra el **staging real** (Azure), no el stack
// local de docker. Corre con:  npm run e2e:stg
//
// Diferencias con playwright.config.ts:
//   * No levanta docker: el backend es el desplegado en Azure.
//   * Sirve el app con `ng serve` **sin** la configuración e2e, así que usa
//     `_environment.prod.ts` tal cual — que está en `mode: 'stg'` y por tanto
//     resuelve restAPIStg + tokenStg. El token nunca se maneja aquí.
//   * `E2E_SKIP_DB=1`: no hay contenedor de Postgres al que consultar, así que
//     las comprobaciones en columna se omiten y quedan las de payload, storage
//     y UI.
//   * La escuela es una real de staging, cuyo giga id no se conoce de antemano.
//
// AVISO: esto **escribe datos reales** en staging (un registro de dispositivo y
// una medición por cada test que sube). No es un entorno desechable.
//
// Limitación conocida: mientras el PR #349 no esté mergeado y desplegado,
// staging no tiene las columnas del plan 0006, así que esta corrida no puede
// validar `upload_failed`/`scheduled_slot`/`scheduled_at` en base de datos —
// solo que el app los envía en el payload.
const STG_API = 'https://uni-ooi-giga-meter-backend-stg.azurewebsites.net/api/v1/';

// Se fijan aquí, no en `webServer.env`, porque eso solo afecta al proceso del
// servidor: los specs las leen en los workers, que heredan el entorno de este
// proceso. Se respeta lo que ya venga del shell para poder sobreescribir.
process.env.E2E_API ??= STG_API;
process.env.E2E_SKIP_DB ??= '1';
process.env.E2E_SCHOOL_ID ??= 'spaintestschool1';
// Vacío a propósito: el giga id de una escuela real no se conoce de antemano,
// así que el spec solo comprueba que exista y sea coherente.
process.env.E2E_GIGA_ID ??= '';

export default defineConfig({
  testDir: './e2e/playwright',
  timeout: 300_000,
  expect: { timeout: 20_000 }, // Azure responde más lento que el stack local
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e/playwright-report-stg', open: 'never' }],
  ],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm start',
      url: 'http://localhost:4200',
      timeout: 300_000,
      reuseExistingServer: false, // no reutilizar un ng serve apuntando a local
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
