-- Fix #1120: opportunity_capability_matches.opportunity_id typed uuid, but
-- opportunities.id is BIGSERIAL (numeric GovWin id). The uuid column made every
-- GET/POST /v3/opportunities/:id/capability-matches 500 with
-- "invalid input syntax for type uuid" (string_to_uuid, code 22P02).
--
-- Re-key opportunity_id to bigint so it matches opportunities.id, and add a
-- proper FK. Existing rows (if any) are keyed under the wrong uuid type and
-- cannot be cast to bigint; the matches table is a derived cache that is
-- recomputed on demand via POST .../capability-matches, so stale rows are
-- cleared. capability_id stays uuid (it correctly references capabilities.id).
--
-- Idempotent and safe to re-run.

DO $do$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'opportunity_capability_matches'
    AND column_name = 'opportunity_id';

  IF col_type IS NULL THEN
    RAISE NOTICE 'opportunity_capability_matches.opportunity_id not found; skipping';
  ELSIF col_type = 'bigint' THEN
    RAISE NOTICE 'opportunity_id already bigint; skipping type change';
  ELSE
    -- Drop the FK first so the column type can change, then clear un-castable rows.
    EXECUTE 'ALTER TABLE opportunity_capability_matches
             DROP CONSTRAINT IF EXISTS opportunity_capability_matches_opportunity_id_fkey';
    EXECUTE 'TRUNCATE TABLE opportunity_capability_matches';
    EXECUTE 'ALTER TABLE opportunity_capability_matches
             ALTER COLUMN opportunity_id TYPE bigint USING opportunity_id::text::bigint';
  END IF;
END
$do$;

-- (Re)build the FK to opportunities(id).
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'opportunity_capability_matches'
      AND constraint_name = 'opportunity_capability_matches_opportunity_id_fkey'
  ) THEN
    ALTER TABLE opportunity_capability_matches
      ADD CONSTRAINT opportunity_capability_matches_opportunity_id_fkey
      FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE;
  END IF;
END
$do$;
