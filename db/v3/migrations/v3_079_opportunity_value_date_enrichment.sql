-- v3_079: Add value/date source and confidence columns for GovWin/GovTribe enrichment fallback.

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS value_source TEXT,
  ADD COLUMN IF NOT EXISTS value_confidence TEXT CHECK (value_confidence IN ('confirmed', 'estimated', 'forecasted')),
  ADD COLUMN IF NOT EXISTS date_source TEXT,
  ADD COLUMN IF NOT EXISTS date_confidence TEXT CHECK (date_confidence IN ('confirmed', 'estimated', 'forecasted'));

-- Backfill existing SAM-sourced data
UPDATE opportunities
  SET value_source = 'sam', value_confidence = 'confirmed'
  WHERE (value_min IS NOT NULL OR value_max IS NOT NULL) AND value_source IS NULL;

UPDATE opportunities
  SET date_source = 'sam', date_confidence = 'confirmed'
  WHERE response_due_at IS NOT NULL AND date_source IS NULL;

-- Index for the enrichment worker query: find rows needing enrichment
CREATE INDEX IF NOT EXISTS idx_opps_needs_value_enrichment
  ON opportunities (id)
  WHERE deleted_at IS NULL
    AND value_min IS NULL
    AND value_max IS NULL;

CREATE INDEX IF NOT EXISTS idx_opps_needs_date_enrichment
  ON opportunities (id)
  WHERE deleted_at IS NULL
    AND response_due_at IS NULL;
