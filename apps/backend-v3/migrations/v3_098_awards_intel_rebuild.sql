-- V3 Migration 079: Awards & Intel rebuild — wheelhouse filter + priority scoring (#870)
-- Creates envision_wheelhouse_naics table, adds priority_score + not_interested columns,
-- creates award_dismissals table for learning loop.

BEGIN;

-- ============================================================================
-- 79.1  envision_wheelhouse_naics — CEO-editable NAICS allowlist
-- ============================================================================
CREATE TABLE IF NOT EXISTS envision_wheelhouse_naics (
  naics   TEXT PRIMARY KEY,
  label   TEXT,
  reason  TEXT,
  active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO envision_wheelhouse_naics (naics, label, reason) VALUES
  ('541330', 'Engineering Services', 'RS3 + OASIS+ Tech/Eng + SHIELD'),
  ('541611', 'Admin Mgmt & Gen Mgmt Consulting', 'OASIS+ SB & UR Mgmt'),
  ('541612', 'HR Consulting', 'OASIS+'),
  ('541613', 'Marketing Consulting', 'OASIS+'),
  ('541618', 'Other Mgmt Consulting', 'OASIS+ + Intel'),
  ('541620', 'Environmental Consulting', 'OASIS+'),
  ('541690', 'Other Sci & Tech Consulting', 'OASIS+ Tech + Intel'),
  ('541713', 'R&D Nanotechnology', 'OASIS+ R&D'),
  ('541714', 'R&D Biotech', 'OASIS+ R&D'),
  ('541715', 'R&D Phys/Eng/Life Sci', 'OASIS+ R&D'),
  ('541720', 'R&D Social Sciences', 'OASIS+ R&D'),
  ('541990', 'All Other Prof/Sci/Tech', 'OASIS+'),
  ('561499', 'All Other Business Support', 'OASIS+ Intel'),
  ('561611', 'Investigation & Background Check', 'OASIS+ Intel'),
  ('611512', 'Flight Training', 'OASIS+ Tech/Eng')
ON CONFLICT (naics) DO NOTHING;

-- ============================================================================
-- 79.2  awards — add priority_score + not_interested columns
-- ============================================================================
ALTER TABLE awards ADD COLUMN IF NOT EXISTS priority_score INTEGER;
ALTER TABLE awards ADD COLUMN IF NOT EXISTS not_interested BOOLEAN DEFAULT FALSE;
ALTER TABLE awards ADD COLUMN IF NOT EXISTS not_interested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_awards_priority_score ON awards (priority_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_awards_not_interested ON awards (not_interested) WHERE not_interested = TRUE;
CREATE INDEX IF NOT EXISTS idx_awards_wheelhouse ON awards (naics, value_obligated, agency_name, period_of_performance_end);

-- ============================================================================
-- 79.3  award_dismissals — "Not Interested" learning loop
-- ============================================================================
CREATE TABLE IF NOT EXISTS award_dismissals (
  id         BIGSERIAL   PRIMARY KEY,
  award_id   BIGINT      NOT NULL REFERENCES awards(id) ON DELETE CASCADE,
  reason     TEXT        NOT NULL,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (award_id)
);

CREATE INDEX IF NOT EXISTS idx_award_dismissals_reason ON award_dismissals (reason);

COMMIT;
