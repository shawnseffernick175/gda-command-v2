-- V3 Migration 005: Add qualified_at and qualified_by to opportunities
-- Supports F-207 qualify endpoint.
-- Forward-only.

BEGIN;

ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS qualified_at TIMESTAMPTZ;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS qualified_by TEXT;

CREATE INDEX IF NOT EXISTS idx_opps_qualified ON opportunities (qualified_at)
  WHERE qualified_at IS NOT NULL AND deleted_at IS NULL;

COMMIT;
