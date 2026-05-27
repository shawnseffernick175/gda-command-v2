-- F-020: Least-privilege Postgres roles
--
-- PostgreSQL prevents demoting the bootstrap superuser (the role created by
-- POSTGRES_USER during initdb).  Instead of demoting gda/gda_staging, this
-- migration creates a dedicated runtime role (gda_runtime / gda_staging_rt)
-- with NOSUPERUSER + DML-only privileges.  Application connection strings
-- (DATABASE_URL) should be updated to use the runtime role after this
-- migration is applied.
--
-- Role architecture after this migration:
--   gda           (bootstrap, SUPERUSER) — admin/migration only, not in app connection strings
--   gda_app       (prod only)            — migration runner via MIGRATION_DATABASE_URL
--   gda_runtime   (new)                  — app + n8n runtime connections
--
-- On staging:
--   gda_staging      (bootstrap, SUPERUSER) — admin/migration only
--   gda_staging_rt   (new)                  — app runtime connections
--
-- ROLLBACK:
--   DROP ROLE IF EXISTS gda_runtime;
--   DROP ROLE IF EXISTS gda_staging_rt;
--   -- Then revert DATABASE_URL to use gda/gda_staging.

DO $$
DECLARE
  bootstrap TEXT := current_user;       -- gda (prod) or gda_staging (staging)
  runtime   TEXT;
  dbname    TEXT := current_database();
BEGIN
  -- ── Derive runtime role name from bootstrap role ──────────────────────
  IF bootstrap = 'gda' THEN
    runtime := 'gda_runtime';
  ELSIF bootstrap = 'gda_staging' THEN
    runtime := 'gda_staging_rt';
  ELSE
    -- CI or unknown — skip role creation, just run as the connecting user
    RAISE NOTICE 'F-020: bootstrap user is "%", skipping runtime role creation (CI/dev)', bootstrap;
    RETURN;
  END IF;

  -- ── 1. Create runtime role ────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime) THEN
    EXECUTE format(
      'CREATE ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE '
      'NOREPLICATION PASSWORD NULL', runtime);
    RAISE NOTICE 'F-020: created role "%"', runtime;
  END IF;

  -- ── 2. Grant CONNECT on the database ──────────────────────────────────
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', dbname, runtime);

  -- ── 3. Grant schema usage + create (in case app creates temp objects) ─
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', runtime);

  -- ── 4. Grant DML on ALL existing tables in public ─────────────────────
  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I',
    runtime);

  -- ── 5. Grant sequence access ──────────────────────────────────────────
  EXECUTE format(
    'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I',
    runtime);

  -- ── 6. Grant EXECUTE on all functions (trigger + extension functions) ─
  EXECUTE format(
    'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO %I',
    runtime);

  -- ── 7. DEFAULT PRIVILEGES — future objects created by bootstrap ───────
  --    (covers both manual admin work and any migrations that run as gda)
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
    'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
    bootstrap, runtime);
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
    'GRANT USAGE, SELECT ON SEQUENCES TO %I',
    bootstrap, runtime);
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
    'GRANT EXECUTE ON FUNCTIONS TO %I',
    bootstrap, runtime);

  -- ── 8. DEFAULT PRIVILEGES — future objects created by gda_app (prod) ──
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gda_app') THEN
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE gda_app IN SCHEMA public '
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', runtime);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE gda_app IN SCHEMA public '
      'GRANT USAGE, SELECT ON SEQUENCES TO %I', runtime);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE gda_app IN SCHEMA public '
      'GRANT EXECUTE ON FUNCTIONS TO %I', runtime);

    -- Demote gda_app — it only needs schema-level CREATE for DDL
    ALTER ROLE gda_app NOCREATEDB;

    RAISE NOTICE 'F-020: default privileges configured for gda_app → %', runtime;
  END IF;

  RAISE NOTICE 'F-020: runtime role "%" is ready — update DATABASE_URL to use it', runtime;
END $$;
