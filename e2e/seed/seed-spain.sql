-- ============================================================
-- Fixture de España (ES) para la suite e2e — flujo school
-- ============================================================
-- Portado (y recortado) desde `seed-spain-project-connect.sql` de
-- giga-meter-backend, que vive solo en la línea de `develop`: lo añadió el
-- commit ef07c5b del trabajo health-entity y nunca llegó a `staging`. Esta
-- copia es del repo del app y se monta en el contenedor, para que la suite no
-- dependa de qué rama tenga el backend hermano.
--
-- Alcance: solo lo que necesita el RC 2.0.4, que registra y mide por
-- `/api/v1` con escuelas. Del original se dejaron fuera `facility_type`,
-- `country_facility_type_whitelist` y `health`: son del trabajo multi-facility
-- (plan 0003), sus tablas no existen en `staging` y el app de esta rama nunca
-- las toca.
--
-- Lo que necesita el app (trazado desde sus servicios):
--   * dailycheckapp_country → dropdown de países y validación del código
--   * country               → destino de la FK de school
--   * school                → match por external_id + country_code
--
-- Registros y mediciones NO se siembran a propósito: crearlos es justamente lo
-- que verifica el test.

-- ============================================================
-- 1.  country (ES) — destino de la FK de school
-- ============================================================
INSERT INTO country (name, code, iso3_format, is_active)
VALUES ('Spain', 'ES', 'ESP', true)
ON CONFLICT (code) DO UPDATE
SET name        = EXCLUDED.name,
    iso3_format = EXCLUDED.iso3_format,
    is_active   = true;

-- ============================================================
-- 2.  dailycheckapp_country (ES) — respalda el dropdown de países
-- ============================================================
-- id 34 / country_id '216' siguen la convención de local-dev-seed.sql.
INSERT INTO dailycheckapp_country (id, code, code_iso3, name, country_id)
VALUES (34, 'ES', 'ESP', 'Spain', '216')
ON CONFLICT (id) DO UPDATE
SET code      = EXCLUDED.code,
    code_iso3 = EXCLUDED.code_iso3,
    name      = EXCLUDED.name,
    country_id= EXCLUDED.country_id;

-- ============================================================
-- 3.  school — escuela de prueba
-- ============================================================
-- Se busca por external_id (case-insensitive) + country_code + is_active
-- + deleted IS NULL. geopoint es geography(Point,4326) de PostGIS:
-- ST_MakePoint(longitud, latitud) — el orden importa.
INSERT INTO school (
  id, external_id, giga_id_school, name,
  country_id, country_code, address,
  admin_1_name, education_level,
  geopoint, is_active, created, modified, deleted
) VALUES (
  900001,
  'ES-TEST-SCHOOL-01',
  '11111111-1111-4111-8111-111111111111',
  'Spain Test School 01',
  216, 'ES', 'Calle de Prueba 1, Madrid',
  'Madrid', 'Primary',
  ST_SetSRID(ST_MakePoint(-3.7038, 40.4168), 4326)::geography,
  true, NOW(), NOW(), NULL
)
ON CONFLICT (id) DO NOTHING;

SELECT setval(
  pg_get_serial_sequence('school', 'id'),
  GREATEST(COALESCE((SELECT MAX(id) FROM school), 0), 900001)
);

-- Nada de facility_type / whitelist / health a propósito: el RC 2.0.4 solo
-- hace el flujo school sobre /api/v1, y `staging` no tiene esas tablas. Cuando
-- entre multi-facility (plan 0003), el seed de esa rama añade lo suyo.
