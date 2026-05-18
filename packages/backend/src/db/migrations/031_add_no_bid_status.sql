-- Migration 031: Add 'no_bid' to opportunities status CHECK constraint
-- and add description column for opportunity scope of work

ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_status_check;
ALTER TABLE opportunities ADD CONSTRAINT opportunities_status_check
  CHECK (status IN ('discovery', 'qualified', 'pipeline', 'won', 'lost', 'no_bid'));

ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS description TEXT;
