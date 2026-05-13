-- Migration 022: Create deep_research_reports table for persisting AI research
CREATE TABLE IF NOT EXISTS deep_research_reports (
  id            TEXT PRIMARY KEY,
  query         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'completed',
  summary       TEXT,
  findings      TEXT,
  sources       JSONB DEFAULT '[]',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  requested_by  TEXT DEFAULT 'user'
);

CREATE INDEX IF NOT EXISTS idx_deep_research_created ON deep_research_reports (created_at DESC);
