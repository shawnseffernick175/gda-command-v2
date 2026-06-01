-- V3 Migration 026: Unified Opportunities Model (F-401)
--
-- Creates 4 new tables backing the unified opportunity model:
--   1. opportunities          — canonical opportunity records (all lifecycle stages)
--   2. opportunity_links      — maps source-native IDs to internal_id
--   3. opportunity_field_overrides — per-field user/system overrides
--   4. opportunity_signals    — upstream signal associations
--
-- Existing per-source tables are NOT touched (backfill is F-404).

-- Up Migration

BEGIN;

-- ============================================================================
-- 26.1  ENUM types
-- ============================================================================

CREATE TYPE opportunity_lifecycle_stage AS ENUM (
  'signal',
  'forecast',
  'pre_sol',
  'solicitation',
  'awarded',
  'post_award',
  'closed'
);

CREATE TYPE opportunity_link_confidence AS ENUM (
  'HIGH',
  'MEDIUM',
  'LOW',
  'CONFIRMED',
  'REJECTED'
);

-- ============================================================================
-- 26.2  opportunities — canonical unified opportunity records
-- ============================================================================

CREATE TABLE opportunities (
  internal_id           UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  lifecycle_stage       opportunity_lifecycle_stage NOT NULL,
  primary_source        TEXT,
  title                 TEXT,
  agency                TEXT,
  office                TEXT,
  naics                 TEXT,
  psc                   TEXT,
  set_aside             TEXT,
  estimated_value_cents BIGINT,
  posted_at             TIMESTAMPTZ,
  response_due_at       TIMESTAMPTZ,
  award_at              TIMESTAMPTZ,
  pwin                  SMALLINT        CHECK (pwin IS NULL OR (pwin >= 0 AND pwin <= 100)),
  doctrine_status       TEXT            CHECK (doctrine_status IS NULL OR doctrine_status IN ('qualified', 'excluded', 'unknown')),
  created_at            TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_opportunities_stage_due
  ON opportunities (lifecycle_stage, response_due_at);

CREATE INDEX idx_opportunities_agency_naics
  ON opportunities (agency, naics);

-- ============================================================================
-- 26.3  opportunity_links — source-native ID → internal_id mapping
-- ============================================================================

CREATE TABLE opportunity_links (
  id                BIGSERIAL       PRIMARY KEY,
  internal_id       UUID            NOT NULL REFERENCES opportunities(internal_id) ON DELETE CASCADE,
  source            TEXT            NOT NULL,
  source_native_id  TEXT            NOT NULL,
  confidence        opportunity_link_confidence,
  match_method      TEXT,
  matched_at        TIMESTAMPTZ,
  confirmed_by      TEXT,
  confirmed_at      TIMESTAMPTZ,
  UNIQUE (source, source_native_id)
);

CREATE INDEX idx_opportunity_links_internal_id
  ON opportunity_links (internal_id);

CREATE INDEX idx_opportunity_links_review_queue
  ON opportunity_links (confidence)
  WHERE confidence IN ('MEDIUM', 'LOW');

-- ============================================================================
-- 26.4  opportunity_field_overrides — user/system per-field overrides
-- ============================================================================

CREATE TABLE opportunity_field_overrides (
  id              BIGSERIAL       PRIMARY KEY,
  internal_id     UUID            NOT NULL REFERENCES opportunities(internal_id) ON DELETE CASCADE,
  field_name      TEXT            NOT NULL,
  field_value_json JSONB          NOT NULL,
  set_by          TEXT            NOT NULL,
  set_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  reason          TEXT,
  UNIQUE (internal_id, field_name)
);

-- ============================================================================
-- 26.5  opportunity_signals — upstream signal associations
-- ============================================================================

CREATE TABLE opportunity_signals (
  id                  BIGSERIAL       PRIMARY KEY,
  internal_id         UUID            NOT NULL REFERENCES opportunities(internal_id) ON DELETE CASCADE,
  signal_type         TEXT            NOT NULL,
  signal_native_id    TEXT,
  signal_payload_json JSONB,
  signal_score        SMALLINT        CHECK (signal_score IS NULL OR (signal_score >= 0 AND signal_score <= 100)),
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_opportunity_signals_internal_id
  ON opportunity_signals (internal_id);

COMMIT;

-- Down Migration

BEGIN;

DROP TABLE IF EXISTS opportunity_signals;
DROP TABLE IF EXISTS opportunity_field_overrides;
DROP TABLE IF EXISTS opportunity_links;
DROP TABLE IF EXISTS opportunities;
DROP TYPE IF EXISTS opportunity_link_confidence;
DROP TYPE IF EXISTS opportunity_lifecycle_stage;

COMMIT;
