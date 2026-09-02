import { defineConfig } from '@playwright/test';

// Variant of the e2e suite that runs against **real staging** (Azure) instead
// of the local docker stack. Run it with:  npm run e2e:stg
//
// Differences from playwright.config.ts:
//   * No docker: the backend is the one deployed on Azure.
//   * Serves the app with `ng serve` **without** the e2e configuration, so it
//     uses `_environment.prod.ts` as-is — which is on `mode: 'stg'` and
//     therefore resolves restAPIStg + tokenStg. The token is never handled here.
//   * `E2E_SKIP_DB=1`: there is no Postgres container to query, so the column
//     assertions are skipped and only the payload, storage and UI ones remain.
//   * The school is a real staging one, whose giga id is not known upfront.
//
// WARNING: this **writes real data** to staging (one device registration and
// one measurement per test that uploads). It is not a disposable environment.
//
// Known limitation: until unicef/giga-meter-backend#349 is merged and deployed,
// staging does not have the `upload_failed`/`scheduled_slot`/`scheduled_at`
// columns, so this run cannot validate them in the database — only that the app
// sends them in the payload.
const STG_API = 'https://uni-ooi-giga-meter-backend-stg.azurewebsites.net/api/v1/';

// Set here and not in `webServer.env`, because that only affects the server
// process: the specs read them in the workers, which inherit this process's
// environment. Whatever the shell already provides wins, so it can be
// overridden.
process.env.E2E_API ??= STG_API;
process.env.E2E_SKIP_DB ??= '1';
process.env.E2E_SCHOOL_ID ??= 'spaintestschool1';
// Deliberately empty: the giga id of a real school is not known upfront, so
// the spec only checks that it exists and is consistent.
process.env.E2E_GIGA_ID ??= '';

export default defineConfig({
  testDir: './e2e/playwright',
  timeout: 300_000,
  expect: { timeout: 20_000 }, // Azure responds more slowly than the local stack
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
      reuseExistingServer: false, // do not reuse an ng serve pointing at local
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
