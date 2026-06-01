-- V3 Migration 026: Unified Opportunities Model (F-401)
--
-- Creates 4 new tables backing the unified opportunity model:
--   1. unified_opportunities          — canonical opportunity records (all lifecycle stages)
--   2. unified_opportunity_links      — maps source-native IDs to internal_id
--   3. unified_opportunity_field_overrides — per-field user/system overrides
--   4. unified_opportunity_signals    — upstream signal associations
--
-- Named "unified_*" to coexist with the legacy per-source `opportunities` table
-- (created in v3_001). Existing per-source tables are NOT touched (backfill is F-404).

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
-- 26.2  unified_opportunities — canonical unified opportunity records
-- ============================================================================

CREATE TABLE unified_opportunities (
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

CREATE INDEX idx_unified_opps_stage_due
  ON unified_opportunities (lifecycle_stage, response_due_at);

CREATE INDEX idx_unified_opps_agency_naics
  ON unified_opportunities (agency, naics);

-- ============================================================================
-- 26.3  unified_opportunity_links — source-native ID → internal_id mapping
-- ============================================================================

CREATE TABLE unified_opportunity_links (
  id                BIGSERIAL       PRIMARY KEY,
  internal_id       UUID            NOT NULL REFERENCES unified_opportunities(internal_id) ON DELETE CASCADE,
  source            TEXT            NOT NULL,
  source_native_id  TEXT            NOT NULL,
  confidence        opportunity_link_confidence,
  match_method      TEXT,
  matched_at        TIMESTAMPTZ,
  confirmed_by      TEXT,
  confirmed_at      TIMESTAMPTZ,
  UNIQUE (source, source_native_id)
);

CREATE INDEX idx_unified_opp_links_internal_id
  ON unified_opportunity_links (internal_id);

CREATE INDEX idx_unified_opp_links_review_queue
  ON unified_opportunity_links (confidence)
  WHERE confidence IN ('MEDIUM', 'LOW');

-- ============================================================================
-- 26.4  unified_opportunity_field_overrides — user/system per-field overrides
-- ============================================================================

CREATE TABLE unified_opportunity_field_overrides (
  id              BIGSERIAL       PRIMARY KEY,
  internal_id     UUID            NOT NULL REFERENCES unified_opportunities(internal_id) ON DELETE CASCADE,
  field_name      TEXT            NOT NULL,
  field_value_json JSONB          NOT NULL,
  set_by          TEXT            NOT NULL,
  set_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  reason          TEXT,
  UNIQUE (internal_id, field_name)
);

-- ============================================================================
-- 26.5  unified_opportunity_signals — upstream signal associations
-- ============================================================================

CREATE TABLE unified_opportunity_signals (
  id                  BIGSERIAL       PRIMARY KEY,
  internal_id         UUID            NOT NULL REFERENCES unified_opportunities(internal_id) ON DELETE CASCADE,
  signal_type         TEXT            NOT NULL,
  signal_native_id    TEXT,
  signal_payload_json JSONB,
  signal_score        SMALLINT        CHECK (signal_score IS NULL OR (signal_score >= 0 AND signal_score <= 100)),
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_unified_opp_signals_internal_id
  ON unified_opportunity_signals (internal_id);

COMMIT;

-- Down Migration

BEGIN;

DROP TABLE IF EXISTS unified_opportunity_signals;
DROP TABLE IF EXISTS unified_opportunity_field_overrides;
DROP TABLE IF EXISTS unified_opportunity_links;
DROP TABLE IF EXISTS unified_opportunities;
DROP TYPE IF EXISTS opportunity_link_confidence;
DROP TYPE IF EXISTS opportunity_lifecycle_stage;

COMMIT;
