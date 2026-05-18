-- W8: LLM Gateway — call log table + AI columns on opportunities
-- Phase 1 of the Agentic AI architecture.

-- 1. LLM call log table
CREATE TABLE IF NOT EXISTS llm_call_log (
  call_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  called_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  purpose        TEXT NOT NULL,
  provider       TEXT NOT NULL,
  model          TEXT NOT NULL,
  classification TEXT,
  prompt_hash    TEXT,
  input_tokens   INTEGER,
  output_tokens  INTEGER,
  latency_ms     INTEGER,
  cost_usd_est   NUMERIC(8,4),
  status         TEXT,
  error_text     TEXT,
  record_table   TEXT,
  record_id      TEXT
);

CREATE INDEX IF NOT EXISTS idx_llm_log_called_at ON llm_call_log (called_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_log_purpose ON llm_call_log (purpose);
CREATE INDEX IF NOT EXISTS idx_llm_log_record ON llm_call_log (record_table, record_id);

-- 2. AI columns on opportunities
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS ai_summary_generated_at TIMESTAMPTZ;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS ai_recommendation JSONB;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS ai_recommendation_generated_at TIMESTAMPTZ;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS data_classification TEXT DEFAULT 'unclassified';
