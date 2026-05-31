-- V3 Migration 009: Schema alignment — F-232
--
-- Aligns DB schema with backend-v3 service code for tables that drifted:
--   1. pipeline_items — code expects capture_kickoff_at
--   2. action_items — code uses UUID id, 'detail', 'owner', 'source'
--   3. action_item_drafts — status CHECK needs generating/done/failed, source_id nullable
--   4. soak_events / soak_metrics — code references but no migration creates them (F-233)
--
-- Post F-230/F-231: captures and action_item_drafts columns were unified by
-- those PRs. This migration keeps the remaining drift fixes.
--
-- Idempotent: all statements use IF NOT EXISTS / IF EXISTS guards.
-- Forward-only.

BEGIN;

-- ============================================================================
-- 1. pipeline_items — add capture_kickoff_at
-- ============================================================================
ALTER TABLE pipeline_items ADD COLUMN IF NOT EXISTS capture_kickoff_at TIMESTAMPTZ;

-- ============================================================================
-- 2. action_items — id type TEXT, add detail/owner/source/linked columns
-- ============================================================================
-- Drop FK from action_item_drafts first (references action_items.id)
ALTER TABLE action_item_drafts DROP CONSTRAINT IF EXISTS action_item_drafts_action_item_id_fkey;

-- Change id type: BIGSERIAL → TEXT (for UUID storage)
ALTER TABLE action_items ALTER COLUMN id DROP DEFAULT;
ALTER TABLE action_items ALTER COLUMN id SET DATA TYPE TEXT USING id::text;

-- Add columns the V3 code expects
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS detail TEXT;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS owner TEXT;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS linked_record_type TEXT;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS linked_record_id TEXT;

-- Relax NOT NULL on columns the V3 code doesn't always supply
ALTER TABLE action_items ALTER COLUMN owner_email DROP NOT NULL;
ALTER TABLE action_items ALTER COLUMN source_id DROP NOT NULL;

-- Relax status CHECK to include 'in_progress'
ALTER TABLE action_items DROP CONSTRAINT IF EXISTS action_items_status_check;
ALTER TABLE action_items ADD CONSTRAINT action_items_status_check
  CHECK (status IN ('open', 'in_progress', 'done', 'blocked'));

-- Drop origin CHECK (code uses 'source' column instead)
ALTER TABLE action_items DROP CONSTRAINT IF EXISTS action_items_origin_check;

-- ============================================================================
-- 3. action_item_drafts — action_item_id type TEXT, status CHECK, source_id nullable
-- ============================================================================
-- action_item_id must match action_items.id type (now TEXT)
ALTER TABLE action_item_drafts ALTER COLUMN action_item_id SET DATA TYPE TEXT USING action_item_id::text;

-- Make source_id nullable (V3 code doesn't supply it)
ALTER TABLE action_item_drafts ALTER COLUMN source_id DROP NOT NULL;

-- Relax status CHECK to include generating/done/failed
ALTER TABLE action_item_drafts DROP CONSTRAINT IF EXISTS action_item_drafts_status_check;
ALTER TABLE action_item_drafts ADD CONSTRAINT action_item_drafts_status_check
  CHECK (status IN ('generating', 'done', 'failed', 'pending', 'approved', 'rejected'));

-- ============================================================================
-- 4. soak_events / soak_metrics — F-233 schema drift
--    Code in routes/soak.ts and workers/soak-digest.ts references these
--    tables but no prior migration creates them.
-- ============================================================================
CREATE TABLE IF NOT EXISTS soak_events (
  id         BIGSERIAL PRIMARY KEY,
  kind       TEXT NOT NULL,
  url        TEXT,
  status     INT,
  duration_ms DOUBLE PRECISION,
  message    TEXT,
  api_version TEXT NOT NULL DEFAULT 'v3',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS soak_metrics (
  id          BIGSERIAL PRIMARY KEY,
  day         DATE NOT NULL,
  kind        TEXT NOT NULL,
  count       INT NOT NULL DEFAULT 0,
  p95_ms      DOUBLE PRECISION,
  api_version TEXT NOT NULL DEFAULT 'v3',
  UNIQUE (day, kind, api_version)
);

COMMIT;
