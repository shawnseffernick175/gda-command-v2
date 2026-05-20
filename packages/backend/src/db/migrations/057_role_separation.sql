-- Migration 057: Postgres role separation for deploy-path enforcement.
-- Part of F-019: Prevent unversioned production DB modifications.
--
-- BOOTSTRAP NOTE: This is the last migration applied by the old DDL-capable
-- role (gda). After this migration, the gda role loses CREATE/ALTER/DROP
-- privileges. All subsequent migrations MUST use MIGRATION_DATABASE_URL
-- (the gda_migrator role).
--
-- Creates three roles:
--   gda_migrator  — full DDL + DML, used exclusively by the migration runner
--   gda_drift_reader — SELECT on schema_migrations only, used by weekly drift check
--   (gda remains as the app role with DML only — no DDL)
--
-- In development (single-user Postgres), this migration is safe to skip if
-- roles already exist or if the DB user lacks CREATEROLE. The IF NOT EXISTS
-- guards handle idempotency.

-- Create the migrator role (full DDL + DML)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'gda_migrator') THEN
    CREATE ROLE gda_migrator WITH LOGIN PASSWORD 'CHANGE_ME_ON_DEPLOY';
  END IF;
END
$$;

-- Create the drift reader role (SELECT only)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'gda_drift_reader') THEN
    CREATE ROLE gda_drift_reader WITH LOGIN PASSWORD 'CHANGE_ME_ON_DEPLOY';
  END IF;
END
$$;

-- Grant gda_migrator full privileges on the current database
GRANT ALL PRIVILEGES ON DATABASE gda_command TO gda_migrator;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gda_migrator;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gda_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO gda_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO gda_migrator;
-- gda_migrator needs to create tables, so grant schema usage + create
GRANT CREATE ON SCHEMA public TO gda_migrator;

-- Grant gda_drift_reader SELECT on schema_migrations only
GRANT CONNECT ON DATABASE gda_command TO gda_drift_reader;
GRANT USAGE ON SCHEMA public TO gda_drift_reader;
GRANT SELECT ON schema_migrations TO gda_drift_reader;

-- Revoke DDL from gda (the application role).
-- After this, gda can SELECT/INSERT/UPDATE/DELETE but cannot
-- CREATE TABLE, ALTER TABLE, or DROP TABLE.
REVOKE CREATE ON SCHEMA public FROM gda;
-- Note: gda retains DML on existing tables via prior grants.
-- New tables created by gda_migrator need explicit grants to gda:
ALTER DEFAULT PRIVILEGES FOR ROLE gda_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gda;
ALTER DEFAULT PRIVILEGES FOR ROLE gda_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO gda;
