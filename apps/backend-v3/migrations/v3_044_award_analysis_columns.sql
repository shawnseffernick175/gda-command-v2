-- V3 Migration 044: Award analysis columns + re-compete tracking (F-608)
-- Adds AI analysis cache, period of performance end date, and re-compete
-- candidate flag. Backfills is_recompete_candidate for existing rows.

BEGIN;

-- 44.1 Add period_of_performance_end (needed for re-compete computation)
ALTER TABLE awards ADD COLUMN IF NOT EXISTS period_of_performance_end DATE;

-- 44.2 AI analysis cache columns
ALTER TABLE awards ADD COLUMN IF NOT EXISTS award_analysis JSONB;
ALTER TABLE awards ADD COLUMN IF NOT EXISTS award_analysis_run_at TIMESTAMPTZ;

-- 44.3 Re-compete candidate flag
ALTER TABLE awards ADD COLUMN IF NOT EXISTS is_recompete_candidate BOOLEAN DEFAULT FALSE;

-- 44.4 Partial index for fast re-compete queries
CREATE INDEX IF NOT EXISTS idx_awards_recompete
  ON awards (is_recompete_candidate)
  WHERE is_recompete_candidate = TRUE;

-- 44.5 Backfill: flag existing awards expiring within 18 months as re-compete candidates
UPDATE awards
SET is_recompete_candidate = TRUE
WHERE period_of_performance_end IS NOT NULL
  AND period_of_performance_end <= (CURRENT_DATE + INTERVAL '18 months')
  AND period_of_performance_end >= CURRENT_DATE;

COMMIT;
