// Consultas a la DB del stack e2e (plan 0010, pasos 5-6: "verificar en DB").
//
// Se habla con Postgres vía `docker compose exec psql` en vez de un cliente
// node: el stack de docker ya es requisito duro de la suite, así que esto no
// añade ninguna dependencia nueva al repo del app.
//
// Las queries devuelven JSON generado por Postgres y se parsean con JSON.parse,
// así no hay que elegir separador de campos ni escapar la salida de psql.
import { execFileSync } from 'node:child_process';

const COMPOSE_FILE = 'e2e/docker-compose.e2e.yml';
const DB_SERVICE = 'e2e-db';

// Formato que produce exactamente lo mismo que Date#toISOString() en JS, para
// poder comparar scheduled_at contra el timestamp inyectado en el semáforo.
const ISO_MS = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

/** Corre una query que devuelve una sola columna JSON y la parsea. */
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
      '-t', // solo tuplas, sin cabecera
      '-A', // sin alineación ni padding
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
 * Última fila de `measurements` que cumple la condición, o null si no hay
 * ninguna. `where` se interpola tal cual: solo se llama con literales del test.
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

/** Cuántas mediciones hay para la escuela del fixture. */
export function measurementCount(gigaIdSchool: string): number {
  return queryJson<number>(
    `SELECT to_json(count(*)) FROM measurements WHERE giga_id_school = '${gigaIdSchool}';`,
  );
}

/** Cuántos registros de dispositivo hay para la escuela del fixture. */
export function schoolRegistrationCount(gigaIdSchool: string): number {
  return queryJson<number>(
    `SELECT to_json(count(*)) FROM dailycheckapp_school WHERE giga_id_school = '${gigaIdSchool}';`,
  );
}
