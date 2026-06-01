-- V3 Migration 002: R2 analysis cache tables (Addendum A)
-- Dedicated cache tables for opportunity and capture analysis results.
-- Forward-only. No IF NOT EXISTS guards.

BEGIN;

-- ============================================================================
-- opportunity_analysis_cache — R2 cached analysis per opportunity
-- ============================================================================
CREATE TABLE opportunity_analysis_cache (
  id              BIGSERIAL     PRIMARY KEY,
  opportunity_id  BIGINT        NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  version         TEXT          NOT NULL,
  generated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  pwin            NUMERIC       CHECK (pwin >= 0 AND pwin <= 1),
  incumbent       TEXT,
  competitors     JSONB         NOT NULL DEFAULT '[]',
  blackhat        JSONB,
  wargame         JSONB,
  timeline        JSONB,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_id, version)
);

CREATE INDEX idx_opp_analysis_opp        ON opportunity_analysis_cache (opportunity_id);
CREATE INDEX idx_opp_analysis_generated  ON opportunity_analysis_cache (generated_at DESC);
CREATE INDEX idx_opp_analysis_ai_at      ON opportunity_analysis_cache (generated_at)
  WHERE generated_at IS NOT NULL;

-- ============================================================================
-- capture_analysis_cache — R2 cached analysis per capture
-- ============================================================================
CREATE TABLE capture_analysis_cache (
  id              BIGSERIAL     PRIMARY KEY,
  capture_id      BIGINT        NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  version         TEXT          NOT NULL,
  generated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  pwin            NUMERIC       CHECK (pwin >= 0 AND pwin <= 1),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (capture_id, version)
);

CREATE INDEX idx_cap_analysis_capture    ON capture_analysis_cache (capture_id);
CREATE INDEX idx_cap_analysis_generated  ON capture_analysis_cache (generated_at DESC);
CREATE INDEX idx_cap_analysis_ai_at      ON capture_analysis_cache (generated_at)
  WHERE generated_at IS NOT NULL;

COMMIT;
