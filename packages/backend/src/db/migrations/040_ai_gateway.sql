-- Migration 040: AI Gateway (W8)
-- Usage tracking for LLM calls and bid/no-bid recommendation history.

-- Track LLM usage per request
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  opportunity_id TEXT,
  action TEXT NOT NULL,
  model_tier TEXT NOT NULL CHECK (model_tier IN ('fast', 'deep')),
  prompt_tokens INT DEFAULT 0,
  completion_tokens INT DEFAULT 0,
  total_tokens INT DEFAULT 0,
  latency_ms INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bid/no-bid recommendation history
CREATE TABLE IF NOT EXISTS bid_recommendations (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  recommendation TEXT NOT NULL CHECK (recommendation IN ('bid', 'no_bid', 'conditional_bid')),
  confidence NUMERIC(5,2) NOT NULL DEFAULT 0,
  rationale TEXT,
  factors JSONB NOT NULL DEFAULT '[]',
  recommended_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_user ON ai_usage_log(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_action ON ai_usage_log(action);
CREATE INDEX IF NOT EXISTS idx_bid_recommendations_opp ON bid_recommendations(opportunity_id);
