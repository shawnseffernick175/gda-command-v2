-- v3_079: Add is_idiq boolean to opportunities table
-- Implements the CEO $1 = IDIQ rule: when contract value is $1, the opportunity
-- is an IDIQ with unknown ceiling. The $1 placeholder must not roll into totals.
-- Also adds is_idiq to pipeline_items for explicit tracking.

-- 1. Add is_idiq column to opportunities
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS is_idiq BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Backfill: any opportunity where value_max = 1 is IDIQ
UPDATE opportunities
  SET is_idiq = TRUE,
      value_max = NULL,
      value_min = NULL
  WHERE (value_max = 1 OR value_min = 1)
    AND is_idiq = FALSE;

-- 3. Index for filtering
CREATE INDEX IF NOT EXISTS idx_opps_is_idiq ON opportunities (is_idiq) WHERE is_idiq = TRUE;
