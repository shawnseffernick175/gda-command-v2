-- V3 Migration 000: Schema migrations tracker
-- This is the ONLY migration that uses CREATE TABLE IF NOT EXISTS.
-- All subsequent migrations are tracked by this table.
-- Clean break from legacy dual-tracker: schema_migrations + _migrations.

CREATE TABLE IF NOT EXISTS v3_schema_migrations (
  id              SERIAL        PRIMARY KEY,
  filename        TEXT          NOT NULL UNIQUE,
  file_sha256     TEXT          NOT NULL,
  applied_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  applied_by      TEXT          NOT NULL DEFAULT current_user,
  commit_sha      TEXT,
  execution_ms    INTEGER
);
