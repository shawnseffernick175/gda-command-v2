-- Migration 007: Audit log enhancements
-- The audit_log table is created in 001_initial_schema.sql.
-- This migration adds missing columns if they don't exist.

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS resource_type TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS resource_id TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);
