-- v3_119: Add 'qualified' as a counted pipeline stage.
-- qualify (staging, pre-pipeline) and qualified (counted) coexist.
-- Legacy qualify rows (from v3_063 migration, before PR #1012) are
-- renamed to qualified so they count in pipeline metrics.

-- 1. Drop old CHECK constraint
ALTER TABLE pipeline_items DROP CONSTRAINT IF EXISTS pipeline_items_stage_check;

-- 2. Rename legacy qualify records to qualified.
-- All existing qualify rows predate the staging semantics introduced
-- in PR #1012 and should be treated as counted pipeline items.
UPDATE pipeline_items SET stage = 'qualified' WHERE stage = 'qualify';

-- 3. Add new CHECK constraint with both qualify and qualified
ALTER TABLE pipeline_items ADD CONSTRAINT pipeline_items_stage_check
  CHECK (stage IN (
    'interest', 'qualify', 'qualified', 'pursue', 'solicitation',
    'post_submittal', 'won', 'lost', 'no_bid', 'gov_cancelled'
  ));
