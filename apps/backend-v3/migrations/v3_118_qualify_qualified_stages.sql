-- v3_118: Qualify/Qualified pipeline stage split (#1010)
--
-- Pipeline stages: rename existing 'qualify' → 'qualified', add 'qualify' as staging.
--
-- After this migration:
--   qualify   = staging holding area, excluded from all metrics
--   qualified = normal pipeline stage (was previously 'qualify')

-- ── 1. Pipeline items: drop old constraint first, then rename ─────────────────

ALTER TABLE pipeline_items DROP CONSTRAINT IF EXISTS pipeline_items_stage_check;

UPDATE pipeline_items SET stage = 'qualified' WHERE stage = 'qualify';

-- Also update capture_stage_history if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'capture_stage_history') THEN
    EXECUTE 'UPDATE capture_stage_history SET from_stage = ''qualified'' WHERE from_stage = ''qualify''';
    EXECUTE 'UPDATE capture_stage_history SET to_stage = ''qualified'' WHERE to_stage = ''qualify''';
  END IF;
END $$;

-- ── 2. Add new constraint with both qualify (staging) and qualified (normal) ──

ALTER TABLE pipeline_items ADD CONSTRAINT pipeline_items_stage_check
  CHECK (stage IN (
    'interest', 'qualify', 'qualified', 'pursue', 'solicitation',
    'post_submittal', 'won', 'lost', 'no_bid', 'gov_cancelled'
  ));
