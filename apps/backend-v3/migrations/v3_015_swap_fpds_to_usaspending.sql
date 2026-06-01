-- V3 Migration 015: Swap default data source from FPDS to USAspending (F-241b)
-- FPDS.gov was decommissioned Feb 24, 2026. The awards table and source tables
-- are source-agnostic; this migration only updates the default.
-- Per-award source rows are created at runtime by the ingest job.

BEGIN;

-- Update default for awards.data_source to reflect the live source.
ALTER TABLE awards ALTER COLUMN data_source SET DEFAULT 'usaspending';

COMMIT;
