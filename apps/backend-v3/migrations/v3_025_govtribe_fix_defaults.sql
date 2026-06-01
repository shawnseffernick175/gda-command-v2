-- V3 Migration 025: GovTribe Fix Defaults (F-Govtribe-Fix #563)
--
-- Corrects credit_budget default from 5000 to 1200 (Shawn's actual plan).
-- Adds 'skipped_cycle_cap' to the decision CHECK constraint.
-- Does NOT delete existing data — only modifies column defaults and constraints.
-- Forward-only.

BEGIN;

-- 1. Fix credits_budget default from 5000 → 1200
ALTER TABLE govtribe_credit_monthly
  ALTER COLUMN credits_budget SET DEFAULT 1200;

-- 2. Add 'skipped_cycle_cap' to decision CHECK on govtribe_credit_ledger
--    Drop old constraint and re-create with expanded enum.
ALTER TABLE govtribe_credit_ledger
  DROP CONSTRAINT IF EXISTS govtribe_credit_ledger_decision_check;

ALTER TABLE govtribe_credit_ledger
  ADD CONSTRAINT govtribe_credit_ledger_decision_check
  CHECK (decision IN ('called', 'skipped_low_budget', 'skipped_halted', 'skipped_cycle_cap', 'cached'));

-- 3. Update existing rows with credits_budget = 5000 to 1200 (retroactive correction).
--    Only updates rows that still have the wrong default (5000).
UPDATE govtribe_credit_monthly
  SET credits_budget = 1200
  WHERE credits_budget = 5000;

COMMIT;
