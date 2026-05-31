-- V3 Migration 012: DIBBS + NECO defense small-buy ingest (F-243)
-- Adds columns for defense small-buy tracking, seeds DIBBS/NECO source rows,
-- adds external_id for multi-source idempotency, and extends source kind enum.
-- Forward-only. Uses IF NOT EXISTS guards for additive DDL.

BEGIN;

-- ============================================================================
-- 12.1  New opportunity columns for defense small-buy tracking
-- ============================================================================
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS agency_subtype TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS opportunity_type TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS part_number TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS quantity NUMERIC;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE INDEX IF NOT EXISTS opportunities_agency_subtype_idx ON opportunities(agency_subtype);
CREATE INDEX IF NOT EXISTS opportunities_part_number_idx ON opportunities(part_number);

-- ============================================================================
-- 12.2  UNIQUE constraint on (data_source, external_id) for multi-source idempotency
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS opportunities_data_source_external_id_uniq
  ON opportunities (data_source, external_id)
  WHERE external_id IS NOT NULL;

-- ============================================================================
-- 12.3  Extend sources.kind CHECK to include dibbs + neco
-- ============================================================================
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_kind_check;
ALTER TABLE sources ADD CONSTRAINT sources_kind_check CHECK (kind IN (
  'sam_gov', 'fpds', 'usaspending', 'govwin',
  'govtribe', 'news', 'doctrine', 'partner_site',
  'internal', 'manual', 'n8n_workflow',
  'dibbs', 'neco'
));

-- ============================================================================
-- 12.4  Extend ingest_runs.status CHECK to include 'degraded'
-- ============================================================================
ALTER TABLE ingest_runs DROP CONSTRAINT IF EXISTS ingest_runs_status_check;
ALTER TABLE ingest_runs ADD CONSTRAINT ingest_runs_status_check
  CHECK (status IN ('running', 'success', 'error', 'degraded'));

-- ============================================================================
-- 12.5  Seed source rows for DIBBS and NECO
-- ============================================================================
INSERT INTO sources (kind, url, title, confidence, meta)
VALUES ('dibbs', 'https://www.dibbs.bsm.dla.mil', 'DIBBS', 'high', '{}')
ON CONFLICT DO NOTHING;

INSERT INTO sources (kind, url, title, confidence, meta)
VALUES ('neco', 'https://www.neco.navy.mil', 'NECO', 'high', '{}')
ON CONFLICT DO NOTHING;

COMMIT;
