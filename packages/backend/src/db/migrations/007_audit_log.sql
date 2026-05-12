-- Migration 007: Audit log enhancements
-- The audit_log table is created in 001_initial_schema.sql.
-- This migration adds missing columns if they don't exist.

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb;
