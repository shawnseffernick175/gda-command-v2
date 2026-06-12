-- v3_076_balance_sheet_actuals.sql — Balance Sheet actuals table (F-813)

CREATE TABLE IF NOT EXISTS balance_sheet_actuals (
  id BIGSERIAL PRIMARY KEY,
  period TEXT NOT NULL,
  fiscal_year INT NOT NULL,
  quarter SMALLINT,
  cash NUMERIC(15,2) NOT NULL DEFAULT 0,
  accounts_receivable NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_current_assets NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_assets NUMERIC(15,2) NOT NULL DEFAULT 0,
  accounts_payable NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_current_liabilities NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_liabilities NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_equity NUMERIC(15,2) NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'balance_sheet',
  UNIQUE (source, period, fiscal_year, quarter)
);
