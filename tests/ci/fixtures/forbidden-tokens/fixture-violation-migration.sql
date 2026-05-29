-- Fixture: simulates a migration that adds a forbidden column.
-- The gate MUST flag this as a violation.

ALTER TABLE opportunities
  ADD COLUMN stale boolean DEFAULT false;

-- Adding the stale: true default is an R2 violation
UPDATE opportunities SET stale = true WHERE analysis IS NULL;
