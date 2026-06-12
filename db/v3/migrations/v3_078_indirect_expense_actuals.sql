-- v3_078_indirect_expense_actuals.sql — Indirect Expense (SIE) table (F-815)

CREATE TABLE IF NOT EXISTS indirect_expense_actuals (
  id BIGSERIAL PRIMARY KEY,
  period TEXT NOT NULL,
  fiscal_year INT NOT NULL,
  quarter SMALLINT NOT NULL,
  pool TEXT NOT NULL,
  account_code TEXT,
  account_name TEXT NOT NULL,
  current_period_actual NUMERIC(15,2) NOT NULL DEFAULT 0,
  current_period_budget NUMERIC(15,2) NOT NULL DEFAULT 0,
  ytd_actual NUMERIC(15,2) NOT NULL DEFAULT 0,
  ytd_budget NUMERIC(15,2) NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'sie',
  source_doc_id BIGINT REFERENCES vault_documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS indirect_expense_actuals_upsert_key
  ON indirect_expense_actuals (source, period, pool, COALESCE(account_code, ''), account_name);
CREATE INDEX IF NOT EXISTS indirect_expense_actuals_period_idx ON indirect_expense_actuals (fiscal_year, quarter, period);
