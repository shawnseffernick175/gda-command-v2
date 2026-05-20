-- Migration 053: GovTribe MCP Credit Ledger
-- Persistent credit tracking for budget guardrails.
-- Per-cycle and per-month credit caps with alert/stop thresholds.

CREATE TABLE IF NOT EXISTS govtribe_credit_ledger (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cycle_id      TEXT NOT NULL,               -- poll cycle identifier
  month_key     TEXT NOT NULL,               -- 'YYYY-MM' for monthly aggregation
  search_name   TEXT NOT NULL,
  tool_name     TEXT NOT NULL,
  credits_used  INTEGER NOT NULL DEFAULT 0,
  results_count INTEGER NOT NULL DEFAULT 0,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_month ON govtribe_credit_ledger (month_key);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_cycle ON govtribe_credit_ledger (cycle_id);

-- Monthly summary view for Source Health panel
CREATE OR REPLACE VIEW govtribe_credit_monthly AS
  SELECT
    month_key,
    SUM(credits_used) AS total_credits,
    COUNT(DISTINCT cycle_id) AS poll_cycles,
    SUM(results_count) AS total_results,
    MIN(recorded_at) AS first_poll,
    MAX(recorded_at) AS last_poll
  FROM govtribe_credit_ledger
  GROUP BY month_key
  ORDER BY month_key DESC;
