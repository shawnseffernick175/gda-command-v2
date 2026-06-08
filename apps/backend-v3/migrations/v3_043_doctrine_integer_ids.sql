-- V3 Migration 043: Fix doctrine UUID / integer type mismatch (F-602)
--
-- Problem: doctrine_evaluations.entity_id and agent_decisions.entity_id /
--          opportunity_id are typed UUID, but opportunity IDs are BIGSERIAL
--          integers. Inserting "73073" into a UUID column fails with
--          "invalid input syntax for type uuid".
--
-- Fix:    Change these columns to TEXT so they accept both UUIDs
--         (captures, unified_opportunities) and integer IDs (opportunities).
--
-- Idempotent: re-running is safe because ALTER TYPE TEXT on a TEXT column is
-- a no-op in PostgreSQL.

BEGIN;

-- 1. doctrine_evaluations.entity_id  UUID → TEXT
ALTER TABLE doctrine_evaluations
  ALTER COLUMN entity_id TYPE TEXT USING entity_id::TEXT;

-- 2. agent_decisions.entity_id  UUID → TEXT
ALTER TABLE agent_decisions
  ALTER COLUMN entity_id TYPE TEXT USING entity_id::TEXT;

-- 3. agent_decisions.opportunity_id  UUID → TEXT
ALTER TABLE agent_decisions
  ALTER COLUMN opportunity_id TYPE TEXT USING opportunity_id::TEXT;

COMMIT;
