-- Remove the A/B/C/D/F letter-grade system from the database.
-- Pwin (continuous percentage) is now the sole fit metric.
-- The "Hot" threshold (Pwin >= 70%) is evaluated at read time.

-- 1. Drop CHECK constraints that enforced valid grade letters
ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_grade_check;
ALTER TABLE fast_track_assessments DROP CONSTRAINT IF EXISTS fast_track_assessments_grade_check;

-- 2. Drop grade + grade_evidence columns from opportunities
ALTER TABLE opportunities DROP COLUMN IF EXISTS grade;
ALTER TABLE opportunities DROP COLUMN IF EXISTS grade_evidence;

-- 3. Drop the grade-source junction table (no longer needed)
DROP TABLE IF EXISTS opportunity_grade_sources;
