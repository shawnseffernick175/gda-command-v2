-- Fix migration 051 ordering: UPDATEs must run before ADD CONSTRAINT.
-- If any rows have old values (usaspending_fuzzy, usaspending_exact),
-- the CHECK constraint would reject them before UPDATEs could fix them.
-- This migration is idempotent — safe to run even if 051 succeeded.

-- 1. Drop constraint (may or may not exist depending on 051 outcome)
ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_incumbent_source_check;

-- 2. Migrate old values FIRST
UPDATE opportunities SET incumbent_source = 'usaspending_fuzzy_weak' WHERE incumbent_source = 'usaspending_fuzzy';
UPDATE opportunities SET incumbent_source = 'usaspending_fuzzy_strong' WHERE incumbent_source = 'usaspending_exact';

-- 3. Now safe to add constraint — all rows have valid values
ALTER TABLE opportunities ADD CONSTRAINT opportunities_incumbent_source_check
  CHECK (incumbent_source IN ('sam_award', 'usaspending_fuzzy_strong', 'usaspending_fuzzy_weak', 'govtribe_mcp', 'manual'));
