-- F-020: Create least-privilege runtime role.
-- Run as the bootstrap superuser (gda on prod, gda_staging on staging).
-- Idempotent — safe to re-run.
--
-- Usage:
--   docker exec gda-postgres psql -U gda -d gda -f scripts/create-gda-runtime.sql
--   docker exec gda-postgres-staging psql -U gda_staging -d gda_command_staging -f scripts/create-gda-runtime.sql

DO $$
DECLARE
  bootstrap TEXT := current_user;
  runtime   TEXT;
  dbname    TEXT := current_database();
BEGIN
  -- Derive runtime role name from bootstrap role
  IF bootstrap = 'gda' THEN
    runtime := 'gda_runtime';
  ELSIF bootstrap = 'gda_staging' THEN
    runtime := 'gda_staging_rt';
  ELSE
    RAISE EXCEPTION 'F-020: must run as bootstrap superuser (gda or gda_staging), not "%".',
      bootstrap;
  END IF;

  -- 1. Create runtime role
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime) THEN
    EXECUTE format(
      'CREATE ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE '
      'NOREPLICATION PASSWORD NULL', runtime);
    RAISE NOTICE 'F-020: created role "%"', runtime;
  ELSE
    RAISE NOTICE 'F-020: role "%" already exists (idempotent)', runtime;
  END IF;

  -- 2. Grant CONNECT + CREATE on the database
  -- CREATE is required for pg-boss to self-bootstrap the pgboss schema (F-220.1).
  EXECUTE format('GRANT CONNECT, CREATE ON DATABASE %I TO %I', dbname, runtime);

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

  -- 9. Grant full access to pgboss schema (created by pg-boss at runtime, F-220.1)
  -- The schema may not exist yet; guard with IF EXISTS.
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'pgboss') THEN
    EXECUTE format('GRANT USAGE ON SCHEMA pgboss TO %I', runtime);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO %I',
      runtime);
    EXECUTE format(
      'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgboss TO %I',
      runtime);
    RAISE NOTICE 'F-020: pgboss schema privileges granted to "%"', runtime;
  ELSE
    RAISE NOTICE 'F-020: pgboss schema does not exist yet (will be created on V3 boot)';
  END IF;

  RAISE NOTICE 'F-020: runtime role "%" is ready', runtime;
END $$;
