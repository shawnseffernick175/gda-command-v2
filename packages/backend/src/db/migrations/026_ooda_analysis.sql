-- 026_ooda_analysis.sql
-- Add OODA analysis storage to opportunities for AI-generated analysis.

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS ooda JSONB,
  ADD COLUMN IF NOT EXISTS analysis JSONB,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_opps_ai_analyzed ON opportunities(ai_analyzed_at);
