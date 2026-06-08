-- v3_041_financials.sql — Financial Bible tables (F-530)

CREATE TABLE financial_plan (
  id BIGSERIAL PRIMARY KEY,
  period TEXT NOT NULL,
  fiscal_year INT NOT NULL,
  quarter SMALLINT,
  plan_orders NUMERIC(15,2) NOT NULL DEFAULT 0,
  plan_sales  NUMERIC(15,2) NOT NULL DEFAULT 0,
  plan_ebit   NUMERIC(15,2) NOT NULL DEFAULT 0,
  plan_gross_margin NUMERIC(6,3) NOT NULL DEFAULT 0,
  plan_ros    NUMERIC(6,3) NOT NULL DEFAULT 0,
  UNIQUE (fiscal_year, quarter)
);

CREATE TABLE financial_actuals (
  id BIGSERIAL PRIMARY KEY,
  period TEXT NOT NULL,
  fiscal_year INT NOT NULL,
  quarter SMALLINT,
  actual_orders NUMERIC(15,2) NOT NULL DEFAULT 0,
  actual_sales  NUMERIC(15,2) NOT NULL DEFAULT 0,
  actual_ebit   NUMERIC(15,2) NOT NULL DEFAULT 0,
  actual_gross_margin NUMERIC(6,3) NOT NULL DEFAULT 0,
  actual_ros    NUMERIC(6,3) NOT NULL DEFAULT 0,
  UNIQUE (fiscal_year, quarter)
);

-- Seed FY26 plan rows (4 quarters)
INSERT INTO financial_plan (period, fiscal_year, quarter, plan_orders, plan_sales, plan_ebit, plan_gross_margin, plan_ros) VALUES
  ('FY26 Q1', 2026, 1, 580000.00, 510000.00, 68000.00, 37.500, 13.300),
  ('FY26 Q2', 2026, 2, 620000.00, 540000.00, 72000.00, 38.200, 13.300),
  ('FY26 Q3', 2026, 3, 600000.00, 525000.00, 70000.00, 38.000, 13.300),
  ('FY26 Q4', 2026, 4, 600000.00, 525000.00, 70000.00, 38.300, 13.100);

-- Seed FY26 actuals for Q1-Q2 only (Q3-Q4 not yet closed)
INSERT INTO financial_actuals (period, fiscal_year, quarter, actual_orders, actual_sales, actual_ebit, actual_gross_margin, actual_ros) VALUES
  ('FY26 Q1', 2026, 1, 595000.00, 518000.00, 71200.00, 38.100, 13.700),
  ('FY26 Q2', 2026, 2, 640000.00, 555000.00, 75500.00, 38.900, 13.600);
