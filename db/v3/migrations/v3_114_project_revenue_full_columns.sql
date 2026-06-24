-- v3_114_project_revenue_full_columns.sql — Extend project_revenue_actuals with
-- the full 29-column layout from the Full Proj Revenue Summary workbook (F-628).
-- These columns enable the per-project financial drill-down page.

-- Project identifier (e.g. "1010.003")
ALTER TABLE project_revenue_actuals
  ADD COLUMN IF NOT EXISTS project_id TEXT;

-- ITD (Inception-to-Date) headline figures
ALTER TABLE project_revenue_actuals
  ADD COLUMN IF NOT EXISTS itd_value        NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS itd_funding      NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS itd_billed_amount NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS open_ar          NUMERIC(15,2) DEFAULT 0;

-- Prior Year breakdown
ALTER TABLE project_revenue_actuals
  ADD COLUMN IF NOT EXISTS prior_year_costs   NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prior_year_profit  NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prior_year_revenue NUMERIC(15,2) DEFAULT 0;

-- Actual — Period / YTD / ITD
ALTER TABLE project_revenue_actuals
  ADD COLUMN IF NOT EXISTS actual_period_costs   NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_period_profit  NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_period_revenue NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_ytd_costs      NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_ytd_profit     NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_ytd_revenue    NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_itd_costs      NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_itd_profit     NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_itd_revenue    NUMERIC(15,2) DEFAULT 0;

-- Target — Period / YTD / ITD
ALTER TABLE project_revenue_actuals
  ADD COLUMN IF NOT EXISTS target_period_costs   NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_period_profit  NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_period_revenue NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_ytd_costs      NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_ytd_profit     NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_ytd_revenue    NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_itd_costs      NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_itd_profit     NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_itd_revenue    NUMERIC(15,2) DEFAULT 0;

-- Index for fast project-level lookups used by the drill-down page
CREATE INDEX IF NOT EXISTS project_revenue_actuals_project_idx
  ON project_revenue_actuals (COALESCE(project_id, project_name), period);
