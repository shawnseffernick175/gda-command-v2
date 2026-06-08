-- V3 Migration 065: Fix doctrine UUID / integer type mismatch (F-602)
--
-- Problem: doctrine_evaluations.entity_id and agent_decisions.entity_id /
--          opportunity_id are typed UUID, but opportunity IDs are BIGSERIAL
--          integers. Inserting "73073" into a UUID column fails with
--          "invalid input syntax for type uuid".
--
-- Fix:    Change these columns to TEXT so they accept both UUIDs
--         (captures, unified_opportunities) and integer IDs (opportunities).
--
-- Idempotent: each ALTER only fires when the column is still uuid.
--             Safe to re-run on a DB where the orchestrator already applied
--             the fix directly.

-- 1. doctrine_evaluations.entity_id  UUID -> TEXT
DO $do$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'doctrine_evaluations' AND column_name = 'entity_id') = 'uuid' THEN
    ALTER TABLE doctrine_evaluations ALTER COLUMN entity_id TYPE TEXT USING entity_id::TEXT;
  END IF;
END $do$;

-- 2. agent_decisions.entity_id  UUID -> TEXT
DO $do$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'agent_decisions' AND column_name = 'entity_id') = 'uuid' THEN
    ALTER TABLE agent_decisions ALTER COLUMN entity_id TYPE TEXT USING entity_id::TEXT;
  END IF;
END $do$;

-- 3. agent_decisions.opportunity_id  UUID -> TEXT
DO $do$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'agent_decisions' AND column_name = 'opportunity_id') = 'uuid' THEN
    ALTER TABLE agent_decisions ALTER COLUMN opportunity_id TYPE TEXT USING opportunity_id::TEXT;
  END IF;
END $do$;
