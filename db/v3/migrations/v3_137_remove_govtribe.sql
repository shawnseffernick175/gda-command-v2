-- V3 Migration 137: Remove GovTribe entirely (#1135)
--
-- #1130 only disabled ingestion. This migration permanently removes GovTribe
-- from the schema and data:
--   1. Delete all opportunities rows with data_source='govtribe' (184 rows),
--      after clearing/deleting dependent rows that FK to them.
--   2. Drop the five govtribe_* tables.
--   3. Drop opportunities.govtribe_id.
--   4. Recreate the sources.kind CHECK constraint without 'govtribe'.
--
-- Forward-only and idempotent — safe to re-run.

BEGIN;

-- ============================================================================
-- 1. Delete govtribe opportunities + dependents
-- ============================================================================
-- Collect the govtribe opportunity ids once.
CREATE TEMP TABLE _gt_opp_ids ON COMMIT DROP AS
  SELECT id FROM opportunities WHERE data_source = 'govtribe';

-- Detach/delete dependent rows before removing the opportunities they FK to.
-- Each table is guarded with to_regclass: the two migration folders
-- (apps/backend-v3/migrations and db/v3/migrations) have historically diverged
-- (e.g. unified_opportunity_links exists only in the apps runner's chain), and
-- this file must apply identically in both. plpgsql plans each statement lazily,
-- so a guarded reference to an absent table is never parsed.
DO $$
BEGIN
  -- Nullable FK references (no ON DELETE CASCADE) — detach them.
  IF to_regclass('public.action_items') IS NOT NULL THEN
    UPDATE action_items SET opportunity_id = NULL WHERE opportunity_id IN (SELECT id FROM _gt_opp_ids);
  END IF;
  IF to_regclass('public.documents') IS NOT NULL THEN
    UPDATE documents SET opportunity_id = NULL WHERE opportunity_id IN (SELECT id FROM _gt_opp_ids);
  END IF;
  IF to_regclass('public.color_team_runs') IS NOT NULL THEN
    UPDATE color_team_runs SET linked_rfp_id = NULL WHERE linked_rfp_id IN (SELECT id FROM _gt_opp_ids);
  END IF;
  IF to_regclass('public.vault_documents') IS NOT NULL THEN
    UPDATE vault_documents SET linked_opportunity_id = NULL WHERE linked_opportunity_id IN (SELECT id FROM _gt_opp_ids);
  END IF;
  IF to_regclass('public.awards') IS NOT NULL THEN
    UPDATE awards SET linked_opportunity_id = NULL WHERE linked_opportunity_id IN (SELECT id FROM _gt_opp_ids);
  END IF;
  IF to_regclass('public.generated_documents') IS NOT NULL THEN
    UPDATE generated_documents SET opportunity_id = NULL WHERE opportunity_id IN (SELECT id FROM _gt_opp_ids);
  END IF;
  -- NOT NULL FK reference (no ON DELETE CASCADE) — delete the rows.
  IF to_regclass('public.pipeline_items') IS NOT NULL THEN
    DELETE FROM pipeline_items WHERE opportunity_id IN (SELECT id FROM _gt_opp_ids);
  END IF;
  -- Unified links/rows that mirror govtribe source records.
  IF to_regclass('public.unified_opportunity_links') IS NOT NULL THEN
    DELETE FROM unified_opportunity_links WHERE source = 'govtribe';
  END IF;
END$$;

-- Remaining dependents use ON DELETE CASCADE — the delete below cleans them up.
DELETE FROM opportunities WHERE data_source = 'govtribe';

-- ============================================================================
-- 2. Drop the govtribe_* connector tables
-- ============================================================================
DROP TABLE IF EXISTS
  govtribe_cache,
  govtribe_credit_monthly,
  govtribe_saved_search_runs,
  govtribe_credit_ledger
  CASCADE;

-- ============================================================================
-- 2b. Rename the repurposed contacts table off the govtribe_ name.
-- govtribe_contacts became the general Contacts store in v3_046 (govtribe_id
-- made nullable; contact_category/is_manual/etc. added). It backs the whole
-- Contacts door, so it is renamed to `contacts` rather than dropped, and its
-- now-vestigial govtribe_id column is removed.
-- ============================================================================
ALTER TABLE IF EXISTS govtribe_contacts RENAME TO contacts;
ALTER TABLE contacts DROP COLUMN IF EXISTS govtribe_id;
ALTER INDEX IF EXISTS govtribe_contacts_agency_idx   RENAME TO contacts_agency_idx;
ALTER INDEX IF EXISTS govtribe_contacts_name_idx     RENAME TO contacts_name_idx;
ALTER INDEX IF EXISTS govtribe_contacts_category_idx RENAME TO contacts_category_idx;

-- Rename the remaining govtribe_-prefixed internal objects (sequence, primary
-- key, CHECK constraints) so no 'govtribe' identifier survives anywhere.
ALTER SEQUENCE IF EXISTS govtribe_contacts_id_seq RENAME TO contacts_id_seq;
ALTER INDEX    IF EXISTS govtribe_contacts_pkey    RENAME TO contacts_pkey;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'govtribe_contacts_contact_category_check') THEN
    ALTER TABLE contacts RENAME CONSTRAINT govtribe_contacts_contact_category_check TO contacts_contact_category_check;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'govtribe_contacts_relationship_score_check') THEN
    ALTER TABLE contacts RENAME CONSTRAINT govtribe_contacts_relationship_score_check TO contacts_relationship_score_check;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'govtribe_contacts_relationship_temp_check') THEN
    ALTER TABLE contacts RENAME CONSTRAINT govtribe_contacts_relationship_temp_check TO contacts_relationship_temp_check;
  END IF;
END$$;

-- ============================================================================
-- 3. Drop opportunities.govtribe_id (+ its index)
-- ============================================================================
DROP INDEX IF EXISTS idx_opps_govtribe_id;
ALTER TABLE opportunities DROP COLUMN IF EXISTS govtribe_id;

-- ============================================================================
-- 4. Remove 'govtribe' from the sources.kind CHECK constraint
-- ============================================================================
-- Reassign any lingering govtribe-kind source rows so the new constraint holds.
UPDATE sources SET kind = 'internal' WHERE kind = 'govtribe';

ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_kind_check;

ALTER TABLE sources ADD CONSTRAINT sources_kind_check CHECK (
  kind = ANY (ARRAY[
    'sam_gov', 'fpds', 'usaspending', 'govwin',
    'news', 'doctrine', 'partner_site', 'internal', 'manual',
    'n8n_workflow', 'dibbs', 'neco', 'sbir', 'federal_register',
    'color_team', 'nsf', 'dod_rss', 'nih', 'arxiv', 'grants_gov'
  ])
);

-- ============================================================================
-- 5. Drop the govtribe feature flag row
-- ============================================================================
DELETE FROM feature_flags WHERE flag_name = 'govtribe_connector_v1';

COMMIT;
