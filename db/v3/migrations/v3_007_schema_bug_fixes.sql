-- V3 Migration 007: Schema bug fixes from parity run (#420)
-- 1. Add sources.legacy_id column (omitted from v3_001)
--
-- STRATEGY B (F-220.1): pg-boss owns its schema. The pgboss.job
-- column renames previously in this file are no longer needed —
-- pg-boss creates its own columns at boot with the correct names.
-- Idempotent: running twice is a no-op.
-- Forward-only.

BEGIN;

-- ============================================================================
-- 1. sources.legacy_id — required by load.ts, missing from v3_001
-- ============================================================================
ALTER TABLE sources ADD COLUMN IF NOT EXISTS legacy_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS sources_legacy_id_uniq
  ON sources(legacy_id) WHERE legacy_id IS NOT NULL;

COMMIT;
