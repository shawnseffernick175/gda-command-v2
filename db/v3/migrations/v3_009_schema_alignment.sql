-- V3 Migration 009: Schema alignment — F-232
--
-- Aligns DB schema with backend-v3 service code for tables that drifted:
--   1. captures — code expects V3-era columns; v3_001 has legacy schema
--   2. action_items — code uses UUID id, 'detail', 'owner', 'source'
--   3. action_item_drafts — code uses UUID id, 'draft_text', 'sources' JSONB
--   4. pipeline_items — code expects capture_kickoff_at
--   5. soak_events / soak_metrics — code references but no migration creates them (F-233)
--
-- Known schema-drift bugs: F-230 (captures), F-231 (action_item_drafts), F-233 (soak).
-- This migration is the durable fix; the integration test harness (F-232)
-- requires it so migrations can reproduce a working schema from scratch.
--
-- Idempotent: all statements use IF NOT EXISTS / IF EXISTS guards.
-- Forward-only.

BEGIN;

-- ============================================================================
-- 1. pipeline_items — add capture_kickoff_at
-- ============================================================================
ALTER TABLE pipeline_items ADD COLUMN IF NOT EXISTS capture_kickoff_at TIMESTAMPTZ;

-- ============================================================================
-- 2. captures — add columns the V3 capture routes expect
-- ============================================================================
ALTER TABLE captures ADD COLUMN IF NOT EXISTS opportunity_id BIGINT;
ALTER TABLE captures ADD COLUMN IF NOT EXISTS color_review_stage TEXT DEFAULT 'white';
ALTER TABLE captures ADD COLUMN IF NOT EXISTS color_review_notes TEXT;
ALTER TABLE captures ADD COLUMN IF NOT EXISTS color_review_audit JSONB NOT NULL DEFAULT '[]';
ALTER TABLE captures ADD COLUMN IF NOT EXISTS compliance_items JSONB NOT NULL DEFAULT '[]';
ALTER TABLE captures ADD COLUMN IF NOT EXISTS compliance_items_sources JSONB NOT NULL DEFAULT '[]';
ALTER TABLE captures ADD COLUMN IF NOT EXISTS pricing_assumptions JSONB;
ALTER TABLE captures ADD COLUMN IF NOT EXISTS pricing_assumptions_sources JSONB NOT NULL DEFAULT '[]';
ALTER TABLE captures ADD COLUMN IF NOT EXISTS teaming_worksheet JSONB;
ALTER TABLE captures ADD COLUMN IF NOT EXISTS teaming_worksheet_sources JSONB NOT NULL DEFAULT '[]';
ALTER TABLE captures ADD COLUMN IF NOT EXISTS analysis JSONB;
ALTER TABLE captures ADD COLUMN IF NOT EXISTS analysis_version TEXT;
ALTER TABLE captures ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ;

-- Make source_id nullable (V3 code does not supply it on INSERT)
ALTER TABLE captures ALTER COLUMN source_id DROP NOT NULL;

-- ============================================================================
-- 3. action_items — id type TEXT, add detail/owner/source/linked columns
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
-- 4. action_item_drafts — id TEXT, add draft_text/sources/updated_at
-- ============================================================================
ALTER TABLE action_item_drafts ALTER COLUMN id DROP DEFAULT;
ALTER TABLE action_item_drafts ALTER COLUMN id SET DATA TYPE TEXT USING id::text;
ALTER TABLE action_item_drafts ALTER COLUMN action_item_id SET DATA TYPE TEXT USING action_item_id::text;

ALTER TABLE action_item_drafts ADD COLUMN IF NOT EXISTS draft_text TEXT;
ALTER TABLE action_item_drafts ADD COLUMN IF NOT EXISTS sources JSONB;
ALTER TABLE action_item_drafts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Make content nullable (V3 code uses draft_text instead)
ALTER TABLE action_item_drafts ALTER COLUMN content DROP NOT NULL;

-- Make source_id nullable (V3 code doesn't supply it)
ALTER TABLE action_item_drafts ALTER COLUMN source_id DROP NOT NULL;

-- Relax status CHECK to include generating/done/failed
ALTER TABLE action_item_drafts DROP CONSTRAINT IF EXISTS action_item_drafts_status_check;
ALTER TABLE action_item_drafts ADD CONSTRAINT action_item_drafts_status_check
  CHECK (status IN ('generating', 'done', 'failed', 'pending', 'approved', 'rejected'));

-- ============================================================================
-- 5. soak_events / soak_metrics — F-233 schema drift
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
