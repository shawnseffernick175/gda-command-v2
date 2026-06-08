-- F-453: Index to quickly find opps with LLM analysis present
CREATE INDEX IF NOT EXISTS idx_opportunities_llm_analysis
  ON opportunities ((analysis->>'llm_analysis' IS NOT NULL))
  WHERE deleted_at IS NULL;
