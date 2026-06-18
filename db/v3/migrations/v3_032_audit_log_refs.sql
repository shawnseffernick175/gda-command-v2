-- V3 Migration 032: Audit Log Reference Columns (F-442)
--
-- The generic `audit_log` table (v3_001) exists with numeric `user_id` and
-- `record_id` columns. Some audited entities are keyed by UUID (e.g.
-- unified_opportunities.internal_id) and the actor may be a JWT `sub` string
-- rather than a numeric users.id. This migration adds three nullable text
-- columns so callers can record string-keyed refs and actors without altering
-- existing columns.
--
-- Additive only — no changes to existing audit_log columns, no CHECK on
-- action (must keep accepting 'analysis_timeout' and any other free-text
-- action). Table is empty so no data migration required.

-- Up Migration

BEGIN;

ALTER TABLE audit_log ADD COLUMN record_ref  TEXT NULL;
ALTER TABLE audit_log ADD COLUMN actor       TEXT NULL;
ALTER TABLE audit_log ADD COLUMN request_id  TEXT NULL;

CREATE INDEX idx_audit_log_ref
  ON audit_log (table_name, record_ref, created_at DESC)
  WHERE record_ref IS NOT NULL;

COMMIT;

-- Down Migration

BEGIN;

DROP INDEX IF EXISTS idx_audit_log_ref;

ALTER TABLE audit_log DROP COLUMN IF EXISTS request_id;
ALTER TABLE audit_log DROP COLUMN IF EXISTS actor;
ALTER TABLE audit_log DROP COLUMN IF EXISTS record_ref;

COMMIT;
