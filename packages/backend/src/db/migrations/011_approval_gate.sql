-- Add approval gate columns to opportunities
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS approved_by TEXT;

CREATE INDEX IF NOT EXISTS idx_opportunities_approved ON opportunities(approved_at) WHERE approved_at IS NOT NULL;
