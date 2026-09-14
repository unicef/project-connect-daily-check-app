import { defineConfig } from '@playwright/test';

// Happy-path e2e suite for the Daily Check App.
// Boots the backend stack in docker (postgres + redis + giga-meter-backend)
// and the Angular app via `ng serve --configuration e2e`, then drives the
// real registration + speed-test flow in a browser. The NDT7 speed test runs
// against real M-Lab servers, so the suite needs internet access and a run
// can take a few minutes.
export default defineConfig({
  testDir: './e2e/playwright',
  timeout: 300_000, // registration + real ndt7 test + upload
  expect: { timeout: 15_000 },
  workers: 1, // the app is stateful (localStorage/backend rows) — never parallel
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e/playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      // First run builds the backend image (npm install inside) — allow long.
      // /metrics is auth-exempt and only answers once the entrypoint got past
      // migrations + seeds, so it doubles as a "fixtures ready" check.
      command: 'docker compose -f e2e/docker-compose.e2e.yml up --build',
      url: 'http://localhost:3000/metrics',
      timeout: 600_000,
      reuseExistingServer: true,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'npm run start:e2e',
      url: 'http://localhost:4200',
      timeout: 300_000,
      reuseExistingServer: true,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
