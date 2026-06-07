-- Expand opportunities.grade CHECK constraint to allow D and F grades
-- Required by C2 scoreToGrade() which maps pWin scores below 50 to D/F
ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_grade_check;
ALTER TABLE opportunities ADD CONSTRAINT opportunities_grade_check CHECK (grade IN ('A', 'B', 'C', 'D', 'F'));

-- Also expand fast_track_assessments.grade to match
ALTER TABLE fast_track_assessments DROP CONSTRAINT IF EXISTS fast_track_assessments_grade_check;
ALTER TABLE fast_track_assessments ADD CONSTRAINT fast_track_assessments_grade_check CHECK (grade IN ('A', 'B', 'C', 'D', 'F'));
