-- Migration 033: Feature flags table
-- Allows toggling features per environment (staging vs production).
-- Sprint v3 non-negotiable: every new feature behind a flag.

CREATE TABLE IF NOT EXISTS feature_flags (
  flag_key     TEXT PRIMARY KEY,
  enabled      BOOLEAN NOT NULL DEFAULT false,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default flags for v3 sprint workstreams (all off by default)
INSERT INTO feature_flags (flag_key, enabled, description) VALUES
  ('vehicle_classification', false, 'W1: Procurement vehicle type classification and sub-pages'),
  ('expanded_sources',       false, 'W2: Expanded opportunity source ingestion framework'),
  ('versioning',             false, 'W3: Record versioning, soft-delete, and autosave'),
  ('merger_context',         false, 'W4: Company entities and merger-aware scoring'),
  ('opp_detail_upgrade',     false, 'W5: Opportunity detail page tabs and analytics'),
  ('capture_discipline',     false, 'W6: Shipley capture discipline dashboard and guardrails'),
  ('count_reconciliation',   false, 'W7: Launchpad/Ops Tracker count reconciliation'),
  ('ai_gateway',             false, 'W8: LLM gateway, summarizer, and bid/no-bid recommender'),
  ('staging_banner',         true,  'Show staging environment banner')
ON CONFLICT (flag_key) DO NOTHING;
