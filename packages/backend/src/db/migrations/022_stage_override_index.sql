-- Partial index for stage-override queries used by Ops Tracker list and
-- Launchpad funnel.  Covers only rows that have been explicitly moved out
-- of the default "discovery" status and are not QuickEntry-created (opp-%).
CREATE INDEX IF NOT EXISTS idx_opportunities_stage_overrides
  ON opportunities (status)
  WHERE status != 'discovery' AND id::text NOT LIKE 'opp-%';
