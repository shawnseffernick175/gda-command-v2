-- v3_118: Qualify/Qualified lifecycle & pipeline stage split (#1010)
--
-- Pipeline stages: rename existing 'qualify' → 'qualified', add 'qualify' as staging.
-- Lifecycle stages: add 'qualify' and 'qualified' to the opportunity_lifecycle_stage enum.
--
-- After this migration:
--   qualify   = staging holding area, excluded from all metrics
--   qualified = normal pipeline stage (was previously 'qualify')

-- ── 1. Pipeline items: rename existing qualify → qualified ──────────────────

UPDATE pipeline_items SET stage = 'qualified' WHERE stage = 'qualify';

-- Also update capture_stage_history if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'capture_stage_history') THEN
    EXECUTE 'UPDATE capture_stage_history SET from_stage = ''qualified'' WHERE from_stage = ''qualify''';
    EXECUTE 'UPDATE capture_stage_history SET to_stage = ''qualified'' WHERE to_stage = ''qualify''';
  END IF;
END $$;

-- Drop old constraint, add new one with both qualify and qualified
ALTER TABLE pipeline_items DROP CONSTRAINT IF EXISTS pipeline_items_stage_check;

ALTER TABLE pipeline_items ADD CONSTRAINT pipeline_items_stage_check
  CHECK (stage IN (
    'interest', 'qualify', 'qualified', 'pursue', 'solicitation',
    'post_submittal', 'won', 'lost', 'no_bid', 'gov_cancelled'
  ));

-- ── 2. Lifecycle stage enum: add qualify and qualified ──────────────────────

ALTER TYPE opportunity_lifecycle_stage ADD VALUE IF NOT EXISTS 'qualify';
ALTER TYPE opportunity_lifecycle_stage ADD VALUE IF NOT EXISTS 'qualified';
