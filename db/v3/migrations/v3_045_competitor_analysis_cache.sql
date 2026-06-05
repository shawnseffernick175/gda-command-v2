-- F-607: Competitor drill-in AI analysis cache
CREATE TABLE IF NOT EXISTS competitor_analysis_cache (
  id                         SERIAL PRIMARY KEY,
  competitor_name            TEXT NOT NULL UNIQUE,
  awardee_uei               TEXT,
  competitor_analysis        JSONB,
  competitor_analysis_run_at TIMESTAMPTZ,
  expires_at                 TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);
CREATE INDEX IF NOT EXISTS idx_comp_analysis_name ON competitor_analysis_cache (competitor_name);
CREATE INDEX IF NOT EXISTS idx_comp_analysis_expires ON competitor_analysis_cache (expires_at);
