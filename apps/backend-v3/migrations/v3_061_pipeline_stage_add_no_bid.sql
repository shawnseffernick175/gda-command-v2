-- v3_061: Add 'no_bid' to pipeline_items stage constraint
-- Idempotent: drops then recreates the CHECK constraint.

ALTER TABLE pipeline_items DROP CONSTRAINT IF EXISTS pipeline_items_stage_check;

ALTER TABLE pipeline_items ADD CONSTRAINT pipeline_items_stage_check
  CHECK (stage IN (
    'qualifying', 'pursuit', 'proposal', 'submitted',
    'evaluation', 'won', 'lost', 'no_bid'
  ));
