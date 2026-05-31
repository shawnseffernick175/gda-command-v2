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

CREATE INDEX IF NOT EXISTS idx_opps_agency_subtype ON opportunities(agency_subtype) WHERE agency_subtype IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opps_part_number ON opportunities(part_number) WHERE part_number IS NOT NULL;

-- ============================================================================
-- 12.2  UNIQUE constraint on (data_source, external_id) for multi-source idempotency
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_opps_ext_id
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

COMMIT;
