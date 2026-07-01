-- F-305: Opportunity Auto-Analysis on Open — cache table for 10-section briefs.
CREATE TABLE IF NOT EXISTS opportunity_analysis_briefs (
  opportunity_id BIGINT PRIMARY KEY REFERENCES opportunities(id) ON DELETE CASCADE,
  brief          JSONB     NOT NULL,
  sources_revision_hash TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analysis_briefs_created
  ON opportunity_analysis_briefs (created_at DESC);
