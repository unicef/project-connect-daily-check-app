-- E2E only: make `giga_meter` the default API category with unrestricted
-- access. The e2e auth mock stamps requests with category giga_meter; this
-- row guarantees that category resolves to an allow-everything config (empty
-- allowedAPIs/notAllowedAPIs) and doubles as the default for any request
-- that reaches the CategoryGuard without a category. DB rows override the
-- static category config (CategoryConfigProvider prefers DB rows).
BEGIN;

INSERT INTO category_config
  (name, "isDefault", "allowedAPIs", "notAllowedAPIs", "responseFilters",
   "allowedCountries", swagger, created_at, updated_at)
VALUES
  ('giga_meter', true, ARRAY[]::jsonb[], ARRAY[]::jsonb[], '{}'::jsonb,
   ARRAY[]::text[], '{"visible": false}'::jsonb, now(), now())
ON CONFLICT (name) DO UPDATE
SET "isDefault"     = true,
    "allowedAPIs"   = EXCLUDED."allowedAPIs",
    "notAllowedAPIs"= EXCLUDED."notAllowedAPIs",
    updated_at      = now();

COMMIT;

SELECT name, "isDefault" FROM category_config;
