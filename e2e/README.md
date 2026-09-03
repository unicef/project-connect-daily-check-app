# E2E — happy path (Playwright)

Playwright suite for the Daily Check App happy path, running in a browser
(`ng serve`) against the real backend in docker.

> The `e2e/src` folder and `protractor.conf.js` are leftovers from Protractor
> (discontinued) and are not used.

## What it covers

The 8 checklist steps, serially over the same installation (they share a page:
the checklist is a linear walk and state accumulates):

| # | Step | Verification |
|---|------|--------------|
| 1-4 | Clean install → registration (Spain / `ES-TEST-SCHOOL-01`) → first **real** ndt7 test → realtime upload | payload and DB row with `upload_failed=false`, slot `null`; offline queue empty |
| 5 | Manual test from the meter | row with `scheduled_slot`/`scheduled_at` set to `null` |
| 6 | Scheduled slot | row with `scheduled_slot='A'` and `scheduled_at` = the planned time, no retries |
| 7 | Post-measurement UI | local history + figures visible on the latest measurement card |
| 8 | Restart | the registration persists (no onboarding) and the scheduler re-arms |

Step 6 does not wait for a real slot (that would take hours): it injects an
expired semaphore for slot A and lets the scheduler's 60 s tick pick it up, as
in production. The three scheduling fields are checked **in the DB columns**
(`e2e/playwright/db.ts`, via `psql` in the container), not only in the payload.

What it does NOT cover (by design): the Electron main process
(`systeminformation`, wifi, hardware id — they arrive as `null`/`'N/A'`), the
installer, and the upload-failure → sync path.

## Requirements

- Docker Desktop running.
- `giga-meter-backend` checked out as a sibling repo.
- Internet (the ndt7 speed test runs against real M-Lab servers).
- Once: `npx playwright install chromium`.

### Sibling backend branch

The stack builds the backend from the sibling repo's **working tree**, so the
suite runs against whichever branch you have checked out there. It works with
`develop` and with `staging` (verified on both, 2026-08-17).

The fixtures live in `e2e/seed/` in **this** repo and are mounted into the
container, so nothing depends on the backend shipping the seed tooling:

- `seed.js` — loader using `pg`. Replaces the backend's
  `src/prisma/scripts/seed-runner.ts`, which only exists on the `develop` line
  (commit `ef07c5b` of the health-entity work added it and it never reached
  `staging`).
- `seed-spain.sql` — minimal ES fixture: `country`, `dailycheckapp_country` and
  the `ES-TEST-SCHOOL-01` school. No `facility_type`, whitelist or `health`:
  those belong to multi-facility, their tables do not exist on `staging`, and
  RC 2.0.4 only runs the school flow over `/api/v1`.

One extra condition: for the `upload_failed`/`scheduled_slot`/`scheduled_at` DB
assertions to pass, the backend branch needs the migration that adds those
columns.

## Against real staging

```bash
npm run e2e:stg
```

Uses `playwright.stg.config.ts`: no docker, serves the app with `npm start`
(without the `e2e` configuration, so `_environment.prod.ts` wins — it is on
`mode: 'stg'` and resolves `restAPIStg` + `tokenStg`) and runs the same spec
with `E2E_SKIP_DB=1`, which skips the column checks because there is no Postgres
container. The payload, storage and UI ones remain.

**It writes real data**: one device registration and up to 3 ndt7 measurements
per run, in a shared environment. It is not disposable.

## Running

```bash
npm run e2e
```

Playwright starts both servers itself (`webServer` config):

1. `docker compose -f e2e/docker-compose.e2e.yml up --build` — Postgres
   (PostGIS, host port 55432) + Redis + backend on `:3000` + a mock of the
   Project Connect api key validation service (it accepts any token with write
   access and the `giga_meter` category). On startup it applies migrations and
   the idempotent seeds (`seed-spain-project-connect.sql` +
   `e2e/seed/e2e-category-config.sql`). The first image build takes several
   minutes.
2. `npm run start:e2e` — `ng serve --configuration e2e`, which replaces
   `_environment.prod.ts` with `src/environments/_environment.e2e.ts`
   (API → `http://localhost:3000/api/v1/`).

Both use `reuseExistingServer`: if you already have them up by hand, they are
reused. To bring down and clean the docker stack (this deletes the DB):

```bash
npm run e2e:down
```

Headed / debug mode:

```bash
npm run e2e:headed
```

```bash
npx playwright test --debug
```

HTML report after a failure: `e2e/playwright-report/` (trace and video are kept
on failures only).

## Stability notes

- `api.ipinfo.io` and `ipv4.geojs.io` are intercepted with fixed responses
  (avoids ~14 s of retries and flakiness).
- The **startup test** is silenced by seeding `startupTestScheduled`/
  `lastStartupTest`/`lastMeasurement` into localStorage before loading the app,
  so its random 0-15 min delay does not compete with the checklist tests. The
  scheduler itself stays alive: step 6 needs it.
- `scheduledTesting` is off by default; step 6 enables it in `savedSettings`
  before injecting the semaphore, or `getSemaphore()` would clear it on every
  tick.
- The first test triggers a congratulations modal that covers the meter: step 5
  closes it before clicking.
- The full suite takes ~4-5 min (each real speed test lasts ~25-45 s and step 6
  waits up to a minute for the scheduler tick).
- The compose file defines `DIRECT_DATABASE_URL` in addition to `DATABASE_URL`:
  some branches declare `directUrl` in the Prisma datasource and without it the
  backend does not start (P1012).
