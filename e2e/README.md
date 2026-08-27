# E2E — happy path (Playwright)

Suite Playwright del happy path del Daily Check App corriendo en navegador
(`ng serve`) contra el backend real en docker. Corresponde al plan 0010 del
`project-memory` del workspace.

> La carpeta `e2e/src` + `protractor.conf.js` son restos de Protractor
> (descontinuado) y no se usan.

## Qué cubre

Los 8 pasos del checklist del plan 0010, en serie sobre la misma instalación
(comparten página: el checklist es un recorrido lineal y el estado se acumula):

| # | Paso | Verificación |
|---|------|--------------|
| 1-4 | Instalación limpia → registro (España / `ES-TEST-SCHOOL-01`) → primer test ndt7 **real** → upload en tiempo real | payload y fila en DB con `upload_failed=false`, slot `null`; cola offline vacía |
| 5 | Test manual desde el medidor | fila con `scheduled_slot`/`scheduled_at` en `null` |
| 6 | Slot programado | fila con `scheduled_slot='A'` y `scheduled_at` = la hora planificada, sin reintentos |
| 7 | UI post-medición | historial local + cifras visibles en la tarjeta de última medición |
| 8 | Reinicio | el registro persiste (sin onboarding) y el scheduler se rearma |

El paso 6 no espera a un slot real (serían horas): inyecta un semáforo vencido
para el slot A y deja que lo recoja el tick de 60 s del scheduler, como en
producción. Los tres campos del plan 0006 se comprueban **en columna de DB**
(`e2e/playwright/db.ts`, vía `psql` en el contenedor), no solo en el payload.

Lo que NO cubre (por diseño): el main process de Electron
(`systeminformation`, wifi, hardware id — llegan como `null`/`'N/A'`), el
instalador, y el camino de fallo de upload → sync (QA del plan 0006).

## Requisitos

- Docker Desktop corriendo.
- `giga-meter-backend` como repo hermano (layout del workspace giga).
- Internet (el speed test ndt7 corre contra servidores M-Lab reales).
- Una vez: `npx playwright install chromium`.

### Rama del backend hermano

El stack construye el backend desde el **working tree** del repo hermano, así
que la suite corre contra la rama que tengas ahí checked out. Funciona con
`develop` y con `staging` (verificado en ambas, 2026-08-17).

Los fixtures viven en `e2e/seed/` de **este** repo y se montan en el
contenedor, para no depender de que el backend traiga el tooling de seed:

- `seed.js` — cargador con `pg`. Sustituye a `src/prisma/scripts/seed-runner.ts`
  del backend, que solo existe en la línea de `develop` (lo añadió el commit
  `ef07c5b` del trabajo health-entity y nunca llegó a `staging`).
- `seed-spain.sql` — fixture ES mínimo: `country`, `dailycheckapp_country` y la
  escuela `ES-TEST-SCHOOL-01`. Nada de `facility_type`, whitelist ni `health`:
  eso es del multi-facility (plan 0003), sus tablas no existen en `staging` y el
  RC 2.0.4 solo hace el flujo school sobre `/api/v1`.

Única condición extra: para que pasen las aserciones en DB de
`upload_failed`/`scheduled_slot`/`scheduled_at`, la rama del backend necesita la
migración del plan 0006.

## Contra el staging real

```bash
npm run e2e:stg
```

Usa `playwright.stg.config.ts`: no levanta docker, sirve el app con `npm start`
(sin la config `e2e`, así que `_environment.prod.ts` manda — está en
`mode: 'stg'` y resuelve `restAPIStg` + `tokenStg`) y corre el mismo spec con
`E2E_SKIP_DB=1`, que omite las comprobaciones en columna porque no hay
contenedor de Postgres. Quedan las de payload, storage y UI.

**Escribe datos reales**: un registro de dispositivo y hasta 3 mediciones ndt7
por corrida, en un entorno compartido. No es desechable.

## Correr

```bash
npm run e2e
```

Playwright levanta solo los dos servidores (config `webServer`):

1. `docker compose -f e2e/docker-compose.e2e.yml up --build` — Postgres
   (PostGIS, puerto host 55432) + Redis + backend en `:3000` + un mock del
   servicio de validación de api keys de Project Connect (acepta cualquier
   token con write access y categoría `giga_meter`). Al arrancar aplica
   migraciones y los seeds idempotentes (`seed-spain-project-connect.sql` +
   `e2e/seed/e2e-category-config.sql`). La primera vez el build de la imagen
   tarda varios minutos.
2. `npm run start:e2e` — `ng serve --configuration e2e`, que reemplaza
   `_environment.prod.ts` por `src/environments/_environment.e2e.ts`
   (API → `http://localhost:3000/api/v1/`).

Ambos usan `reuseExistingServer`: si ya los tienes levantados a mano, los
reutiliza. Para bajar y limpiar el stack docker (borra la DB):

```bash
npm run e2e:down
```

Modo visible / debug:

```bash
npm run e2e:headed
```

```bash
npx playwright test --debug
```

Reporte HTML tras un fallo: `e2e/playwright-report/` (trace y video se
guardan solo en fallos).

## Notas de estabilidad

- `api.ipinfo.io` y `ipv4.geojs.io` van interceptados con respuestas fijas
  (evita ~14 s de reintentos y flakiness).
- El **startup test** se silencia sembrando `startupTestScheduled`/
  `lastStartupTest`/`lastMeasurement` en localStorage antes de cargar la app,
  para que su delay aleatorio de 0-15 min no compita con los tests del
  checklist. El scheduler en sí sigue vivo: el paso 6 lo necesita.
- `scheduledTesting` viene desactivado por defecto; el paso 6 lo habilita en
  `savedSettings` antes de inyectar el semáforo, o `getSemaphore()` lo vaciaría
  en cada tick.
- El primer test dispara un modal de felicitación que tapa el medidor: el paso 5
  lo cierra antes de pinchar.
- La suite completa tarda ~4-5 min (cada speed test real dura ~25-45 s y el
  paso 6 espera hasta un minuto al tick del scheduler).
- El compose define `DIRECT_DATABASE_URL` además de `DATABASE_URL`: algunas
  ramas declaran `directUrl` en el datasource de Prisma y sin ella el backend
  no arranca (P1012).
