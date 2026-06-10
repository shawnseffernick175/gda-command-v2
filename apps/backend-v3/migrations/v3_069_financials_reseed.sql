-- v3_069: Re-seed FY26 financial placeholder rows if the tables are empty.
-- A real upload that returned 0 KPI rows previously cleared the v3_041 seed rows
-- and inserted nothing, leaving the Financials tab blank. The ingest service is
-- now guarded so an empty extract no longer clears seed data, but the seed that
-- was already wiped must be restored. This migration re-inserts the same FY26
-- seed values as v3_041 with is_seed=true, but ONLY when BOTH financial tables
-- are currently empty. Idempotent: if any rows exist (seed or real) it is a no-op
-- and will not overwrite real ingested data.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM financial_plan)
     AND NOT EXISTS (SELECT 1 FROM financial_actuals) THEN

    INSERT INTO financial_plan (period, fiscal_year, quarter, plan_orders, plan_sales, plan_ebit, plan_gross_margin, plan_ros, is_seed) VALUES
      ('FY26 Q1', 2026, 1, 580000.00, 510000.00, 68000.00, 37.500, 13.300, true),
      ('FY26 Q2', 2026, 2, 620000.00, 540000.00, 72000.00, 38.200, 13.300, true),
      ('FY26 Q3', 2026, 3, 600000.00, 525000.00, 70000.00, 38.000, 13.300, true),
      ('FY26 Q4', 2026, 4, 600000.00, 525000.00, 70000.00, 38.300, 13.100, true);

    INSERT INTO financial_actuals (period, fiscal_year, quarter, actual_orders, actual_sales, actual_ebit, actual_gross_margin, actual_ros, is_seed) VALUES
      ('FY26 Q1', 2026, 1, 595000.00, 518000.00, 71200.00, 38.100, 13.700, true),
      ('FY26 Q2', 2026, 2, 640000.00, 555000.00, 75500.00, 38.900, 13.600, true);

  END IF;
END $$;
