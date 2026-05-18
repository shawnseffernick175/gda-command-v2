-- W6: Shipley Capture Discipline
-- Adds formal Shipley phase tracking, Pwin, color-team gates,
-- capture discipline config, and manager load tracking.

-- 1. Shipley phase enum
DO $$ BEGIN
  CREATE TYPE shipley_phase AS ENUM (
    'identify','qualify','pursue','capture','proposal','submit','awarded','lost','no_bid'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add Shipley fields to opportunities table
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS shipley_phase shipley_phase DEFAULT 'identify';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS pwin NUMERIC(5,2);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS capture_manager_id TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS proposal_manager_id TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS preferred_vendor_analysis TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS expected_rfp_date DATE;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS expected_award_date DATE;

-- 3. Color team review table (Shipley Blue/Pink/Red/Green/Gold/White gates)
CREATE TABLE IF NOT EXISTS color_team_review (
  review_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id TEXT NOT NULL,
  team_color     TEXT NOT NULL CHECK (team_color IN ('blue','pink','red','green','gold','white')),
  scheduled_date DATE,
  completed_date DATE,
  score          NUMERIC(5,2),
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(opportunity_id, team_color)
);

-- 4. Capture discipline config (single-row admin-editable thresholds)
CREATE TABLE IF NOT EXISTS capture_discipline_config (
  id                          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  revenue_target_usd          NUMERIC(15,2) DEFAULT 40000000,
  pipeline_coverage_min       NUMERIC(4,2) DEFAULT 3.0,
  pipeline_coverage_target    NUMERIC(4,2) DEFAULT 5.0,
  pwin_floor_pursue           NUMERIC(5,2) DEFAULT 25,
  pwin_floor_capture          NUMERIC(5,2) DEFAULT 40,
  pwin_floor_bid_decision     NUMERIC(5,2) DEFAULT 50,
  captures_per_manager_max    INTEGER DEFAULT 5,
  proposals_per_manager_max   INTEGER DEFAULT 2,
  task_orders_per_manager_max INTEGER DEFAULT 4,
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO capture_discipline_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_opp_shipley_phase ON opportunities (shipley_phase);
CREATE INDEX IF NOT EXISTS idx_opp_capture_mgr ON opportunities (capture_manager_id);
CREATE INDEX IF NOT EXISTS idx_opp_proposal_mgr ON opportunities (proposal_manager_id);
CREATE INDEX IF NOT EXISTS idx_color_review_opp ON color_team_review (opportunity_id);

-- 6. Backfill: map existing capture_stage values to shipley_phase.
-- The column has DEFAULT 'identify', so existing rows already have that value (not NULL).
-- Use shipley_phase = 'identify' as the guard to only remap rows that haven't been touched.
UPDATE opportunities SET shipley_phase = 'identify'  WHERE capture_stage = 'interest'        AND shipley_phase = 'identify';
UPDATE opportunities SET shipley_phase = 'qualify'    WHERE capture_stage = 'qualify'         AND shipley_phase = 'identify';
UPDATE opportunities SET shipley_phase = 'pursue'     WHERE capture_stage = 'pursue'          AND shipley_phase = 'identify';
UPDATE opportunities SET shipley_phase = 'proposal'   WHERE capture_stage = 'solicitation'    AND shipley_phase = 'identify';
UPDATE opportunities SET shipley_phase = 'submit'     WHERE capture_stage = 'post_submittal'  AND shipley_phase = 'identify';
UPDATE opportunities SET shipley_phase = 'awarded'    WHERE capture_stage = 'won'             AND shipley_phase = 'identify';
UPDATE opportunities SET shipley_phase = 'lost'       WHERE capture_stage = 'lost'            AND shipley_phase = 'identify';
UPDATE opportunities SET shipley_phase = 'no_bid'     WHERE capture_stage = 'no_bid'          AND shipley_phase = 'identify';
