-- F-215 D4: LLM Router call logging table
-- Every route() call writes exactly one row. Fallback calls write a second row.

CREATE TABLE llm_calls (
  id BIGSERIAL PRIMARY KEY,
  trace_id UUID NOT NULL,
  task TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  operator_id UUID,
  object_ref TEXT,
  latency_ms INT NOT NULL,
  tokens_input INT,
  tokens_output INT,
  cost_estimate_usd NUMERIC(10,6),
  fallback_used BOOLEAN DEFAULT FALSE,
  error_kind TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_llm_calls_trace ON llm_calls(trace_id);
CREATE INDEX idx_llm_calls_task_created ON llm_calls(task, created_at DESC);
CREATE INDEX idx_llm_calls_object ON llm_calls(object_ref) WHERE object_ref IS NOT NULL;
