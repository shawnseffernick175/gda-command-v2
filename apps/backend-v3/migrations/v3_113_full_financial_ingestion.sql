-- v3_113_full_financial_ingestion.sql — New tables for AP, AR, Trial Balance, Project Revenue (F-625)
-- Completes full financial ingestion coverage for all 9 monthly doc types.

-- 1. Accounts Payable (Open AP Report)
CREATE TABLE IF NOT EXISTS ap_actuals (
  id BIGSERIAL PRIMARY KEY,
  period TEXT NOT NULL,
  fiscal_year INT NOT NULL,
  quarter SMALLINT,
  vendor_name TEXT NOT NULL,
  invoice_number TEXT,
  invoice_date DATE,
  due_date DATE,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  age_bucket TEXT,
  source TEXT NOT NULL DEFAULT 'open_ap',
  source_doc_id BIGINT REFERENCES vault_documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ap_actuals_upsert_key
  ON ap_actuals (source, period, vendor_name, COALESCE(invoice_number, ''));
CREATE INDEX IF NOT EXISTS ap_actuals_period_idx ON ap_actuals (fiscal_year, quarter, period);

-- 2. Accounts Receivable (Aged AR Report)
CREATE TABLE IF NOT EXISTS ar_actuals (
  id BIGSERIAL PRIMARY KEY,
  period TEXT NOT NULL,
  fiscal_year INT NOT NULL,
  quarter SMALLINT,
  customer_name TEXT NOT NULL,
  invoice_number TEXT,
  invoice_date DATE,
  due_date DATE,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  age_bucket TEXT,
  source TEXT NOT NULL DEFAULT 'aged_ar',
  source_doc_id BIGINT REFERENCES vault_documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ar_actuals_upsert_key
  ON ar_actuals (source, period, customer_name, COALESCE(invoice_number, ''));
CREATE INDEX IF NOT EXISTS ar_actuals_period_idx ON ar_actuals (fiscal_year, quarter, period);

-- 3. Trial Balance
CREATE TABLE IF NOT EXISTS trial_balance (
  id BIGSERIAL PRIMARY KEY,
  period TEXT NOT NULL,
  fiscal_year INT NOT NULL,
  quarter SMALLINT,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  debit NUMERIC(15,2) NOT NULL DEFAULT 0,
  credit NUMERIC(15,2) NOT NULL DEFAULT 0,
  net_balance NUMERIC(15,2) GENERATED ALWAYS AS (debit - credit) STORED,
  source TEXT NOT NULL DEFAULT 'trial_balance',
  source_doc_id BIGINT REFERENCES vault_documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS trial_balance_upsert_key
  ON trial_balance (source, period, account_code);
CREATE INDEX IF NOT EXISTS trial_balance_period_idx ON trial_balance (fiscal_year, quarter, period);

-- 4. Project Revenue Summary
CREATE TABLE IF NOT EXISTS project_revenue_actuals (
  id BIGSERIAL PRIMARY KEY,
  period TEXT NOT NULL,
  fiscal_year INT NOT NULL,
  quarter SMALLINT,
  project_name TEXT NOT NULL,
  contract_number TEXT,
  revenue NUMERIC(15,2) NOT NULL DEFAULT 0,
  cost NUMERIC(15,2) NOT NULL DEFAULT 0,
  profit NUMERIC(15,2) GENERATED ALWAYS AS (revenue - cost) STORED,
  margin_pct NUMERIC(7,2),
  source TEXT NOT NULL DEFAULT 'proj_revenue',
  source_doc_id BIGINT REFERENCES vault_documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS project_revenue_actuals_upsert_key
  ON project_revenue_actuals (source, period, project_name);
CREATE INDEX IF NOT EXISTS project_revenue_actuals_period_idx ON project_revenue_actuals (fiscal_year, quarter, period);
