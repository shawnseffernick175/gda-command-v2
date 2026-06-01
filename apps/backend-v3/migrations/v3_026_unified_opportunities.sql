-- V3 Migration 026: Unified Opportunity Model (F-401 schema)
--
-- Creates four new tables backing the unified opportunity lifecycle:
--   opportunities_unified — single canonical record per opportunity
--   opportunity_links     — maps internal_id ↔ (source, source_native_id)
--   opportunity_field_overrides — human-edited field precedence
--   opportunity_signals   — low-confidence early-stage signals
--
-- Does NOT touch existing per-source opportunities table.
-- Forward-only.

BEGIN;

-- ============================================================================
-- 26.1  lifecycle_stage enum
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE lifecycle_stage AS ENUM (
    'signal', 'forecast', 'pre_sol', 'solicitation',
    'awarded', 'post_award', 'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 26.2  link_confidence enum
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE link_confidence AS ENUM (
    'HIGH', 'MEDIUM', 'LOW', 'CONFIRMED', 'REJECTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 26.3  opportunities_unified — one row per logical opportunity
-- ============================================================================
CREATE TABLE IF NOT EXISTS opportunities_unified (
  internal_id         UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  lifecycle_stage     lifecycle_stage NOT NULL DEFAULT 'solicitation',
  primary_source      TEXT,
  title               TEXT,
  agency              TEXT,
  office              TEXT,
  naics               TEXT,
  psc                 TEXT,
  set_aside           TEXT,
  estimated_value_cents BIGINT,
  posted_at           TIMESTAMPTZ,
  response_due_at     TIMESTAMPTZ,
  award_at            TIMESTAMPTZ,
  pwin                SMALLINT        CHECK (pwin IS NULL OR (pwin >= 0 AND pwin <= 100)),
  doctrine_status     TEXT            DEFAULT 'unknown'
                                      CHECK (doctrine_status IN ('qualified', 'excluded', 'unknown')),
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unified_stage_due
  ON opportunities_unified (lifecycle_stage, response_due_at);
CREATE INDEX IF NOT EXISTS idx_unified_agency_naics
  ON opportunities_unified (agency, naics);

-- ============================================================================
-- 26.4  opportunity_links — cross-source linkage
-- ============================================================================
CREATE TABLE IF NOT EXISTS opportunity_links (
  id                  BIGSERIAL       PRIMARY KEY,
  internal_id         UUID            NOT NULL REFERENCES opportunities_unified(internal_id) ON DELETE CASCADE,
  source              TEXT            NOT NULL,
  source_native_id    TEXT            NOT NULL,
  confidence          link_confidence NOT NULL DEFAULT 'HIGH',
  match_method        TEXT,
  matched_at          TIMESTAMPTZ     DEFAULT NOW(),
  confirmed_by        TEXT,
  confirmed_at        TIMESTAMPTZ,
  UNIQUE (source, source_native_id)
);

CREATE INDEX IF NOT EXISTS idx_links_internal_id
  ON opportunity_links (internal_id);
CREATE INDEX IF NOT EXISTS idx_links_source_native
  ON opportunity_links (source, source_native_id);
CREATE INDEX IF NOT EXISTS idx_links_review_queue
  ON opportunity_links (confidence) WHERE confidence IN ('MEDIUM', 'LOW');

-- ============================================================================
-- 26.5  opportunity_field_overrides — human precedence
-- ============================================================================
CREATE TABLE IF NOT EXISTS opportunity_field_overrides (
  id                  BIGSERIAL       PRIMARY KEY,
  internal_id         UUID            NOT NULL REFERENCES opportunities_unified(internal_id) ON DELETE CASCADE,
  field_name          TEXT            NOT NULL,
  field_value_json    JSONB           NOT NULL,
  set_by              TEXT            NOT NULL,
  set_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  reason              TEXT,
  UNIQUE (internal_id, field_name)
);

-- ============================================================================
-- 26.6  opportunity_signals — early-stage signal linkage
-- ============================================================================
CREATE TABLE IF NOT EXISTS opportunity_signals (
  id                  BIGSERIAL       PRIMARY KEY,
  internal_id         UUID            NOT NULL REFERENCES opportunities_unified(internal_id) ON DELETE CASCADE,
  signal_type         TEXT,
  signal_native_id    TEXT,
  signal_payload_json JSONB,
  signal_score        SMALLINT        CHECK (signal_score IS NULL OR (signal_score >= 0 AND signal_score <= 100)),
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signals_internal_id
  ON opportunity_signals (internal_id);

-- ============================================================================
-- 26.7  backfill tracking — resumable cursor
-- ============================================================================
CREATE TABLE IF NOT EXISTS backfill_cursors (
  id                  TEXT            PRIMARY KEY,
  last_processed_id   BIGINT          NOT NULL DEFAULT 0,
  total_processed     INTEGER         NOT NULL DEFAULT 0,
  status              TEXT            NOT NULL DEFAULT 'running'
                                      CHECK (status IN ('running', 'completed', 'paused')),
  started_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMIT;
