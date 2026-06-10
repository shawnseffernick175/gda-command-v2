-- v3_070: Allow distinct periods to coexist in the financial tables.
--
-- BUG: the upsert ON CONFLICT target was (fiscal_year, quarter), matching the
-- inline UNIQUE (fiscal_year, quarter) constraint from v3_041. The Trend Income
-- Stmt emits three monthly rows (FY26 Jan/Feb/Mar) that all map to FY26 Q1, so
-- they collapsed onto a single row and clobbered each other; later files also
-- overwrote earlier good values for the same fiscal_year+quarter.
--
-- FIX (Option A, forward-only/additive): widen the uniqueness grain to include
-- period so monthly rows (e.g. "FY26 Mar") and the quarterly row ("FY26 Q1")
-- are distinct. Drop the old (fiscal_year, quarter) UNIQUE constraint and add a
-- matching UNIQUE index on (period, fiscal_year, quarter). The ingest upsert is
-- updated in the same change to ON CONFLICT (period, fiscal_year, quarter).
--
-- Idempotent and safe to run on a populated table: any pre-existing duplicate
-- (period, fiscal_year, quarter) tuples are collapsed to a single row first.

-- 1) Collapse any duplicate (period, fiscal_year, quarter) tuples, keeping the
--    lowest id. Required so the new UNIQUE index can be created on live data.
DELETE FROM financial_plan a
  USING financial_plan b
  WHERE a.id > b.id
    AND a.period = b.period
    AND a.fiscal_year = b.fiscal_year
    AND a.quarter IS NOT DISTINCT FROM b.quarter;

DELETE FROM financial_actuals a
  USING financial_actuals b
  WHERE a.id > b.id
    AND a.period = b.period
    AND a.fiscal_year = b.fiscal_year
    AND a.quarter IS NOT DISTINCT FROM b.quarter;

-- 2) Drop the old (fiscal_year, quarter) UNIQUE constraints from v3_041. The
--    inline UNIQUE got the auto-generated name <table>_fiscal_year_quarter_key.
ALTER TABLE financial_plan    DROP CONSTRAINT IF EXISTS financial_plan_fiscal_year_quarter_key;
ALTER TABLE financial_actuals DROP CONSTRAINT IF EXISTS financial_actuals_fiscal_year_quarter_key;

-- 3) Add the new (period, fiscal_year, quarter) UNIQUE indexes that back the
--    upsert ON CONFLICT target. Use NULLS NOT DISTINCT so rows with quarter NULL
--    are still de-duplicated by (period, fiscal_year). Requires Postgres 15+.
CREATE UNIQUE INDEX IF NOT EXISTS financial_plan_period_fy_quarter_key
  ON financial_plan (period, fiscal_year, quarter) NULLS NOT DISTINCT;

CREATE UNIQUE INDEX IF NOT EXISTS financial_actuals_period_fy_quarter_key
  ON financial_actuals (period, fiscal_year, quarter) NULLS NOT DISTINCT;
