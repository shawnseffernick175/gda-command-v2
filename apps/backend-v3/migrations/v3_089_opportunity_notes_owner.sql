-- V3 Migration 079: Add owner_id to opportunities + opportunity_notes table
-- Supports row-action menu: Assign owner, Add Note features.

BEGIN;

-- Add owner_id column to opportunities (references users)
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS owner_id BIGINT REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_opps_owner ON opportunities (owner_id) WHERE owner_id IS NOT NULL AND deleted_at IS NULL;

-- Opportunity notes table
CREATE TABLE IF NOT EXISTS opportunity_notes (
  id            BIGSERIAL     PRIMARY KEY,
  opportunity_id BIGINT       NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  body          TEXT          NOT NULL,
  created_by    TEXT          NOT NULL DEFAULT 'system',
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opp_notes_opp ON opportunity_notes (opportunity_id);

COMMIT;
