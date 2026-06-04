-- F-460b: Daily Commander Briefing cache
-- Stores one row per day, generated at 6 AM ET by cron or on-demand.

CREATE TABLE daily_briefing_cache (
  id BIGSERIAL PRIMARY KEY,
  briefing_date DATE NOT NULL UNIQUE,
  headline TEXT NOT NULL,
  priority_actions JSONB NOT NULL DEFAULT '[]',
  risk_flags JSONB NOT NULL DEFAULT '[]',
  market_intel_summary TEXT NOT NULL DEFAULT '',
  cert_expiration_warnings JSONB NOT NULL DEFAULT '[]',
  model_used TEXT,
  quality_flag TEXT,
  trace_id TEXT,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_daily_briefing_date ON daily_briefing_cache(briefing_date DESC);
