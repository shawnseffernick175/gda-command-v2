-- V3 Migration 015: Swap default data source from FPDS to USAspending (F-241b)
-- FPDS.gov was decommissioned Feb 24, 2026. The awards table and source tables
-- are source-agnostic; this migration only updates the default and seeds the
-- USAspending source row. No schema change.

BEGIN;

-- Update default for awards.data_source to reflect the live source.
ALTER TABLE awards ALTER COLUMN data_source SET DEFAULT 'usaspending';

-- Add USAspending source row if not present (idempotent via legacy_id).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM sources WHERE kind = 'usaspending' AND url = 'https://www.usaspending.gov'
  ) THEN
    INSERT INTO sources (kind, url, title, confidence, legacy_id)
    VALUES ('usaspending', 'https://www.usaspending.gov', 'USA Spending', 'high', 'usaspending.gov.root');
  END IF;
END $$;

COMMIT;
