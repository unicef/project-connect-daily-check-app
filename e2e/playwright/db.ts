// Database queries for the e2e stack, used by the specs that assert on columns
// rather than only on the request payload.
//
// Postgres is reached through `docker compose exec psql` instead of a node
// client: the docker stack is already a hard requirement of the suite, so this
// adds no new dependency to the app repo.
//
// Queries return JSON built by Postgres and are parsed with JSON.parse, which
// avoids picking a field separator or escaping psql output.
import { execFileSync } from 'node:child_process';

const COMPOSE_FILE = 'e2e/docker-compose.e2e.yml';
const DB_SERVICE = 'e2e-db';

// Format that produces exactly what Date#toISOString() produces in JS, so
// scheduled_at can be compared against the timestamp injected in the semaphore.
const ISO_MS = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

/** Runs a query that returns a single JSON column and parses it. */
function queryJson<T>(sql: string): T {
  const stdout = execFileSync(
    'docker',
    [
      'compose',
      '-f',
      COMPOSE_FILE,
      'exec',
      '-T',
      DB_SERVICE,
      'psql',
      '-U',
      'giga',
      '-d',
      'giga_e2e',
      '-t', // tuples only, no header
      '-A', // unaligned, no padding
      '-c',
      sql,
    ],
    { encoding: 'utf8' },
  );
  return JSON.parse(stdout.trim());
}

export interface MeasurementRow {
  notes: string | null;
  upload_failed: boolean | null;
  scheduled_slot: string | null;
  scheduled_at: string | null;
  giga_id_school: string | null;
}

/**
 * Latest `measurements` row matching the condition, or null when there is
 * none. `where` is interpolated as-is: it is only ever called with test
 * literals.
 */
export function latestMeasurement(where: string): MeasurementRow | null {
  return queryJson<MeasurementRow | null>(
    `SELECT coalesce(to_json(t), 'null'::json)
       FROM (
         SELECT notes,
                upload_failed,
                scheduled_slot,
                to_char(scheduled_at AT TIME ZONE 'UTC', ${ISO_MS}) AS scheduled_at,
                giga_id_school
           FROM measurements
          WHERE ${where}
          ORDER BY id DESC
          LIMIT 1
       ) t;`,
  );
}

/** How many measurements exist for the fixture school. */
export function measurementCount(gigaIdSchool: string): number {
  return queryJson<number>(
    `SELECT to_json(count(*)) FROM measurements WHERE giga_id_school = '${gigaIdSchool}';`,
  );
}

/** How many device registrations exist for the fixture school. */
export function schoolRegistrationCount(gigaIdSchool: string): number {
  return queryJson<number>(
    `SELECT to_json(count(*)) FROM dailycheckapp_school WHERE giga_id_school = '${gigaIdSchool}';`,
  );
}
