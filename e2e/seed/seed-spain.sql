-- ============================================================
-- Spain (ES) fixture for the e2e suite — school flow
-- ============================================================
-- Ported (and trimmed) from `seed-spain-project-connect.sql` in
-- giga-meter-backend, which only lives on the `develop` line: commit ef07c5b of
-- the health-entity work added it and it never reached `staging`. This copy
-- belongs to the app repo and is mounted into the container, so the suite does
-- not depend on which branch the sibling backend has checked out.
--
-- Scope: only what RC 2.0.4 needs, which registers and measures through
-- `/api/v1` with schools. `facility_type`, `country_facility_type_whitelist`
-- and `health` were left out of the original: they belong to the multi-facility
-- work, their tables do not exist on `staging`, and the app on this branch
-- never touches them.
--
-- What the app needs (traced from its services):
--   * dailycheckapp_country → country dropdown and code validation
--   * country               → target of the school FK
--   * school                → matched by external_id + country_code
--
-- Registrations and measurements are deliberately NOT seeded: creating them is
-- exactly what the test verifies.

-- ============================================================
-- 1.  country (ES) — target of the school FK
-- ============================================================
INSERT INTO country (name, code, iso3_format, is_active)
VALUES ('Spain', 'ES', 'ESP', true)
ON CONFLICT (code) DO UPDATE
SET name        = EXCLUDED.name,
    iso3_format = EXCLUDED.iso3_format,
    is_active   = true;

-- ============================================================
-- 2.  dailycheckapp_country (ES) — backs the country dropdown
-- ============================================================
-- id 34 / country_id '216' follow the local-dev-seed.sql convention.
INSERT INTO dailycheckapp_country (id, code, code_iso3, name, country_id)
VALUES (34, 'ES', 'ESP', 'Spain', '216')
ON CONFLICT (id) DO UPDATE
SET code      = EXCLUDED.code,
    code_iso3 = EXCLUDED.code_iso3,
    name      = EXCLUDED.name,
    country_id= EXCLUDED.country_id;

-- ============================================================
-- 3.  school — test school
-- ============================================================
-- Looked up by external_id (case-insensitive) + country_code + is_active
-- + deleted IS NULL. geopoint is PostGIS geography(Point,4326):
-- ST_MakePoint(longitude, latitude) — the order matters.
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

-- No facility_type / whitelist / health on purpose: RC 2.0.4 only runs the
-- school flow over /api/v1, and `staging` does not have those tables. When
-- multi-facility lands, the seed on that branch adds its own.
