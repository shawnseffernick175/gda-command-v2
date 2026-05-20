-- Fix incumbent_source CHECK constraint: rename usaspending_exact → usaspending_fuzzy_strong
-- and usaspending_fuzzy → usaspending_fuzzy_weak. No PIID-based exact matching exists yet,
-- so the prior "exact" label was misleading for keyword+agency+NAICS fuzzy matches.

-- Drop old constraint and re-create with corrected values
ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_incumbent_source_check;
ALTER TABLE opportunities ADD CONSTRAINT opportunities_incumbent_source_check
  CHECK (incumbent_source IN ('sam_award', 'usaspending_fuzzy_strong', 'usaspending_fuzzy_weak', 'govtribe_mcp', 'manual'));

-- Migrate any existing records with old values
UPDATE opportunities SET incumbent_source = 'usaspending_fuzzy_weak' WHERE incumbent_source = 'usaspending_fuzzy';
UPDATE opportunities SET incumbent_source = 'usaspending_fuzzy_strong' WHERE incumbent_source = 'usaspending_exact';
