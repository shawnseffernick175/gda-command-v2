-- F-020: Least-privilege Postgres roles
--
-- This migration has TWO paths depending on who runs it:
--
--   Bootstrap path (current_user = gda | gda_staging):
--     Creates the runtime role and applies all grants.
--     Used in CI (fresh database) and one-time admin runs.
--
--   Auto-deploy path (current_user = gda_app or other):
--     Verifies the runtime role already exists with correct grants.
--     RAISE EXCEPTION if role is missing (bootstrap script wasn't run yet).
--     Used by auto-deploy (F-041f) which runs as gda_app.
--
-- Role architecture after this migration:
--   gda           (bootstrap, SUPERUSER) — admin/migration only
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
  bootstrap TEXT := current_user;
  runtime   TEXT;
  dbname    TEXT := current_database();
  grant_ok  BOOLEAN;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- Derive runtime role name from bootstrap role
  -- ═══════════════════════════════════════════════════════════════════════
  IF bootstrap = 'gda' THEN
    runtime := 'gda_runtime';
  ELSIF bootstrap = 'gda_staging' THEN
    runtime := 'gda_staging_rt';
  ELSE
    -- ─── Auto-deploy path (non-bootstrap user, e.g. gda_app) ───────────
    -- Determine expected runtime role from database name.
    IF dbname IN ('gda', 'gda_command') THEN
      runtime := 'gda_runtime';
    ELSIF dbname IN ('gda_staging', 'gda_command_staging') THEN
      runtime := 'gda_staging_rt';
    ELSE
      RAISE EXCEPTION 'F-020: unrecognized database "%" — cannot determine runtime role name. '
        'Expected gda, gda_command, gda_staging, or gda_command_staging.',
        dbname;
    END IF;

    -- Verify runtime role exists (created by scripts/bootstrap-gda-runtime.sh)
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime) THEN
      RAISE EXCEPTION 'F-020: runtime role "%" does not exist. '
        'Run scripts/bootstrap-gda-runtime.sh on the VPS first, then re-deploy.',
        runtime;
    END IF;

    -- Spot-check grants on a representative table
    SELECT has_table_privilege(runtime, 'opportunities', 'SELECT') INTO grant_ok;
    IF NOT grant_ok THEN
      RAISE EXCEPTION 'F-020: runtime role "%" exists but lacks SELECT on opportunities. '
        'Bootstrap may have failed — re-run scripts/bootstrap-gda-runtime.sh.',
        runtime;
    END IF;

    RAISE NOTICE 'F-020: verified runtime role "%" exists with correct grants (auto-deploy path)', runtime;
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- Bootstrap path (CI or direct admin run).
  -- Creates role and applies all grants. Idempotent.
  -- ═══════════════════════════════════════════════════════════════════════

  -- 1. Create runtime role
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime) THEN
    EXECUTE format(
      'CREATE ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE '
      'NOREPLICATION PASSWORD NULL', runtime);
    RAISE NOTICE 'F-020: created role "%"', runtime;
  END IF;

  -- 2. Grant CONNECT on the database
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', dbname, runtime);

  -- 3. Grant schema usage
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', runtime);

  -- 4. Grant DML on ALL existing tables in public
  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I',
    runtime);

  -- 5. Grant sequence access
  EXECUTE format(
    'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I',
    runtime);

  -- 6. Grant EXECUTE on all functions (trigger + extension functions)
  EXECUTE format(
    'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO %I',
    runtime);

  -- 7. DEFAULT PRIVILEGES — future objects created by bootstrap
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

  -- 8. DEFAULT PRIVILEGES — future objects created by gda_app (prod only)
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

    ALTER ROLE gda_app NOCREATEDB;

    RAISE NOTICE 'F-020: default privileges configured for gda_app → %', runtime;
  END IF;

  RAISE NOTICE 'F-020: runtime role "%" is ready — update DATABASE_URL to use it', runtime;
END $$;
