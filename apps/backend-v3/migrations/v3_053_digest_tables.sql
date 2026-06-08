-- v3_053_digest_tables.sql
-- Market Intelligence Digest — GAO decisions + digest cache

CREATE TABLE IF NOT EXISTS gao_decisions (
  id SERIAL PRIMARY KEY,
  decision_number TEXT NOT NULL UNIQUE,
  title TEXT,
  agency TEXT,
  incumbent TEXT,
  protestor TEXT,
  outcome TEXT CHECK (outcome IN ('sustained','denied','dismissed','withdrawn')),
  decision_date DATE,
  source_url TEXT,
  ai_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS digest_cache (
  id SERIAL PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  content JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gao_agency ON gao_decisions(agency);
CREATE INDEX IF NOT EXISTS idx_gao_decision_date ON gao_decisions(decision_date DESC);
CREATE INDEX IF NOT EXISTS idx_digest_cache_key ON digest_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_digest_cache_expires ON digest_cache(expires_at);
