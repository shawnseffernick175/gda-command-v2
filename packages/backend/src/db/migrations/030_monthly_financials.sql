-- Monthly financial data for trend charts and breakdown tables
CREATE TABLE IF NOT EXISTS monthly_financials (
  id SERIAL PRIMARY KEY,
  fiscal_year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  month_label TEXT NOT NULL,           -- e.g. 'Jan-26', 'Feb-26', 'Mar-26'
  revenue NUMERIC(15,2) NOT NULL DEFAULT 0,
  direct_costs NUMERIC(15,2) NOT NULL DEFAULT 0,
  indirect_costs NUMERIC(15,2) NOT NULL DEFAULT 0,
  gross_profit NUMERIC(15,2) NOT NULL DEFAULT 0,
  ebit NUMERIC(15,2) NOT NULL DEFAULT 0,
  orders NUMERIC(15,2) NOT NULL DEFAULT 0,
  funded_backlog NUMERIC(15,2) NOT NULL DEFAULT 0,
  headcount INTEGER NOT NULL DEFAULT 0,
  revenue_target NUMERIC(15,2) NOT NULL DEFAULT 0,
  gross_profit_target NUMERIC(15,2) NOT NULL DEFAULT 0,
  ebit_target NUMERIC(15,2) NOT NULL DEFAULT 0,
  orders_target NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fiscal_year, month)
);

-- Seed Q1 FY2026 monthly data from 2026 Trend Income Statement
-- January 2026
INSERT INTO monthly_financials (fiscal_year, month, month_label, revenue, direct_costs, indirect_costs, gross_profit, ebit, orders, funded_backlog, headcount, revenue_target, gross_profit_target, ebit_target, orders_target)
VALUES (2026, 1, 'Jan-26', 2893558.87, 2373157.37, 482275.85, 38125.65, 36815.42, 2666457.57, 4800000, 45,
        3285096.30, 41322.63, 32913.93, 3285096.30)
ON CONFLICT (fiscal_year, month) DO UPDATE SET
  revenue = EXCLUDED.revenue, direct_costs = EXCLUDED.direct_costs, indirect_costs = EXCLUDED.indirect_costs,
  gross_profit = EXCLUDED.gross_profit, ebit = EXCLUDED.ebit, orders = EXCLUDED.orders,
  funded_backlog = EXCLUDED.funded_backlog, headcount = EXCLUDED.headcount,
  revenue_target = EXCLUDED.revenue_target, gross_profit_target = EXCLUDED.gross_profit_target,
  ebit_target = EXCLUDED.ebit_target, orders_target = EXCLUDED.orders_target;

-- February 2026
INSERT INTO monthly_financials (fiscal_year, month, month_label, revenue, direct_costs, indirect_costs, gross_profit, ebit, orders, funded_backlog, headcount, revenue_target, gross_profit_target, ebit_target, orders_target)
VALUES (2026, 2, 'Feb-26', 2772963.30, 2249701.82, 481292.18, 41969.30, 37440.50, 2541687.46, 5000000, 47,
        3285096.30, 41322.63, 32913.93, 3285096.30)
ON CONFLICT (fiscal_year, month) DO UPDATE SET
  revenue = EXCLUDED.revenue, direct_costs = EXCLUDED.direct_costs, indirect_costs = EXCLUDED.indirect_costs,
  gross_profit = EXCLUDED.gross_profit, ebit = EXCLUDED.ebit, orders = EXCLUDED.orders,
  funded_backlog = EXCLUDED.funded_backlog, headcount = EXCLUDED.headcount,
  revenue_target = EXCLUDED.revenue_target, gross_profit_target = EXCLUDED.gross_profit_target,
  ebit_target = EXCLUDED.ebit_target, orders_target = EXCLUDED.orders_target;

-- March 2026
INSERT INTO monthly_financials (fiscal_year, month, month_label, revenue, direct_costs, indirect_costs, gross_profit, ebit, orders, funded_backlog, headcount, revenue_target, gross_profit_target, ebit_target, orders_target)
VALUES (2026, 3, 'Mar-26', 4188766.47, 3673672.19, 471315.26, 43779.02, 24447.02, 4597142.43, 5186745, 48,
        3285096.30, 41322.63, 32913.93, 3285096.30)
ON CONFLICT (fiscal_year, month) DO UPDATE SET
  revenue = EXCLUDED.revenue, direct_costs = EXCLUDED.direct_costs, indirect_costs = EXCLUDED.indirect_costs,
  gross_profit = EXCLUDED.gross_profit, ebit = EXCLUDED.ebit, orders = EXCLUDED.orders,
  funded_backlog = EXCLUDED.funded_backlog, headcount = EXCLUDED.headcount,
  revenue_target = EXCLUDED.revenue_target, gross_profit_target = EXCLUDED.gross_profit_target,
  ebit_target = EXCLUDED.ebit_target, orders_target = EXCLUDED.orders_target;
