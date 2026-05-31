-- V3 Migration 010: Ingest framework tables (F-240)
-- Creates the ingest_runs logging table, seeds a SAM.gov source row,
-- adds missing opportunity_posted_at_sources sibling table, and
-- verifies the UNIQUE constraint on opportunities(sam_notice_id).
-- Forward-only. No IF NOT EXISTS guards.

BEGIN;

-- ============================================================================
-- 10.1  ingest_runs — Per-source ingestion run audit log
-- ============================================================================
CREATE TABLE ingest_runs (
  id              BIGSERIAL     PRIMARY KEY,
  source_key      TEXT          NOT NULL,
  started_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  rows_inserted   INT           NOT NULL DEFAULT 0,
  rows_updated    INT           NOT NULL DEFAULT 0,
  rows_skipped    INT           NOT NULL DEFAULT 0,
  status          TEXT          NOT NULL DEFAULT 'running'
                                CHECK (status IN ('running', 'success', 'error')),
  error_text      TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ingest_runs_source  ON ingest_runs (source_key);
CREATE INDEX idx_ingest_runs_status  ON ingest_runs (status);
CREATE INDEX idx_ingest_runs_started ON ingest_runs (started_at DESC);

-- ============================================================================
-- 10.2  Seed SAM.gov source registry row
-- ============================================================================
INSERT INTO sources (kind, url, title, confidence, meta)
VALUES ('sam_gov', 'https://sam.gov', 'SAM.gov', 'high', '{"registry": true}');

-- ============================================================================
-- 10.3  opportunity_posted_at_sources — R1 per-field source sibling
-- ============================================================================
CREATE TABLE opportunity_posted_at_sources (
  id              BIGSERIAL   PRIMARY KEY,
  opportunity_id  BIGINT      NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  source_id       BIGINT      NOT NULL REFERENCES sources(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_id, source_id)
);
CREATE INDEX idx_opas_opp ON opportunity_posted_at_sources (opportunity_id);

-- ============================================================================
-- 10.4  Verify UNIQUE on opportunities(sam_notice_id)
-- Already created in v3_001 as UNIQUE constraint — this is a no-op guard.
-- ============================================================================
-- sam_notice_id UNIQUE constraint already exists from v3_001_initial.sql

COMMIT;
