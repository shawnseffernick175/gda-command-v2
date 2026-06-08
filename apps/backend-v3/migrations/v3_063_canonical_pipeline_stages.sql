-- v3_063: Canonical pipeline stage taxonomy
-- Replaces the old stage vocabulary (qualifying, pursuit, proposal, submitted, evaluation)
-- with the canonical 9-stage enum:
--   interest, qualify, pursue, solicitation, post_submittal, won, lost, no_bid, gov_cancelled
-- Idempotent: safe to re-run.

-- 1. Drop the old CHECK constraint
ALTER TABLE pipeline_items DROP CONSTRAINT IF EXISTS pipeline_items_stage_check;

-- 2. Migrate existing data values to canonical keys
UPDATE pipeline_items SET stage = 'interest'       WHERE stage = 'qualifying';
UPDATE pipeline_items SET stage = 'qualify'         WHERE stage = 'pursuit';
UPDATE pipeline_items SET stage = 'pursue'          WHERE stage = 'proposal';
UPDATE pipeline_items SET stage = 'post_submittal'  WHERE stage = 'submitted';
UPDATE pipeline_items SET stage = 'post_submittal'  WHERE stage = 'evaluation';
-- won, lost, no_bid already match canonical keys; no update needed.

-- 3. Set the column DEFAULT to 'interest'
ALTER TABLE pipeline_items ALTER COLUMN stage SET DEFAULT 'interest';

-- 4. Add the new CHECK constraint with all 9 canonical keys
ALTER TABLE pipeline_items ADD CONSTRAINT pipeline_items_stage_check
  CHECK (stage IN (
    'interest', 'qualify', 'pursue', 'solicitation',
    'post_submittal', 'won', 'lost', 'no_bid', 'gov_cancelled'
  ));
