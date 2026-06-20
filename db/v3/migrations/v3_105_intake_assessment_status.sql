-- v3_105: Intake → AI Assessment → Pass / Ops Tracker status on opportunities
--
-- Owner rule (binding): AI does ASSESSMENT ONLY. Nothing enters the Pipeline
-- unless the user personally promotes it. This migration adds the assessment
-- column that records where each opportunity sits in the intake funnel:
--   'intake'      — default, not yet assessed
--   'pass'        — auto-declined by the assessment job (reason in assessment_reason)
--   'ops_tracker' — survived assessment, awaiting the user's promote decision
--
-- We use a dedicated `assessment_status` column rather than reusing
-- `relevance_status` because relevance_status carries a different, established
-- vocabulary (relevant/off_profile/unknown_naics/auto_pass) consumed by ingest
-- and analysis sweeps. Keeping assessment separate avoids overloading that
-- column and lets the two concepts evolve independently.
--
-- assessment_score stores the AI pWin/fit (0–100) for survivors so the Ops
-- Tracker can rank best-first. NULL for passed / unassessed rows.
--
-- Idempotent: safe to re-run.

-- 1. Columns
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS assessment_status TEXT NOT NULL DEFAULT 'intake';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS assessment_reason TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS assessment_score NUMERIC;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS assessed_at TIMESTAMPTZ;

-- 2. Guard rail: only the three known states are allowed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'opportunities_assessment_status_chk'
  ) THEN
    ALTER TABLE opportunities
      ADD CONSTRAINT opportunities_assessment_status_chk
      CHECK (assessment_status IN ('intake', 'pass', 'ops_tracker'));
  END IF;
END
$$;

-- 3. Indexes for the Ops Tracker (ranked survivors) and Pass list scans.
CREATE INDEX IF NOT EXISTS idx_opps_assessment_status
  ON opportunities (assessment_status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_opps_assessment_ops_rank
  ON opportunities (assessment_score DESC)
  WHERE deleted_at IS NULL AND assessment_status = 'ops_tracker';

-- 4. Stamp any pre-existing rows that are missing a status as 'intake'.
-- (The column default covers new rows; this covers rows created before the
-- column existed where the default was not applied retroactively.)
UPDATE opportunities SET assessment_status = 'intake' WHERE assessment_status IS NULL;
