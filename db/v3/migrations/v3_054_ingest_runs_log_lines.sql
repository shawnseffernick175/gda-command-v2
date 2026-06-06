-- V3 Migration 054: Add log_lines column to ingest_runs for F-630 Ingest Health Dashboard
-- Also adds 'degraded' and 'partial' to the status check constraint.

BEGIN;

-- Drop old CHECK and recreate with expanded values
ALTER TABLE ingest_runs DROP CONSTRAINT IF EXISTS ingest_runs_status_check;
ALTER TABLE ingest_runs ADD CONSTRAINT ingest_runs_status_check
  CHECK (status IN ('running', 'success', 'error', 'degraded', 'partial'));

-- Add log_lines column for storing recent log output per run
ALTER TABLE ingest_runs ADD COLUMN IF NOT EXISTS log_lines JSONB DEFAULT '[]';

-- Add a composite index for efficient "latest run per source" queries
CREATE INDEX IF NOT EXISTS idx_ingest_runs_source_started
  ON ingest_runs (source_key, started_at DESC);

COMMIT;
