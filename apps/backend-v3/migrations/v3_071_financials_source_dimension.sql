-- v3_071: Add a source-series dimension to the financial tables.
--
-- BUG: there was no source dimension. Different uploads for the SAME period --
-- the official Income Statement P&L, the L1-ACTUAL project-revenue ledger, and
-- the L1-TARGET plan -- all collapsed onto one (period, fiscal_year, quarter)
-- row and clobbered each other. The Income Statement's correct 12.3% March
-- gross margin got overwritten by L1-ACTUAL's 0.83%.
--
-- FIX (additive, forward-only): add a `source` discriminator column to both
-- tables and widen the uniqueness grain to (source, period, fiscal_year,
-- quarter). `source` is ORTHOGONAL to kind (plan|actual): income_statement and
-- l1_actual are both kind=actual but distinct sources, so they now coexist as
-- two rows for the same month instead of overwriting each other.
--
-- source values:
--   income_statement -> official month-end Income Statement P&L (kind=actual);
--                       Trend Income Stmt monthly rows map here too.
--   l1_actual        -> L1-ACTUAL project-revenue ledger (kind=actual).
--   l1_target        -> L1-TARGET / Proj Revenue Summary plan (kind=plan).
--
-- Idempotent and safe on populated tables: existing actuals default to
-- income_statement and existing plan rows default to l1_target so nothing
-- breaks, then the old (period, fiscal_year, quarter) UNIQUE index from v3_070
-- is replaced by one that includes source.

-- 1) Add the source column. Sensible defaults so existing rows keep working:
--    actuals are income-statement actuals; plan rows are the L1-TARGET plan.
ALTER TABLE financial_actuals ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'income_statement';
ALTER TABLE financial_plan    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'l1_target';

-- 2) Collapse any pre-existing duplicate (source, period, fiscal_year, quarter)
--    tuples, keeping the lowest id, so the new UNIQUE index can be created.
DELETE FROM financial_actuals a
  USING financial_actuals b
  WHERE a.id > b.id
    AND a.source = b.source
    AND a.period = b.period
    AND a.fiscal_year = b.fiscal_year
    AND a.quarter IS NOT DISTINCT FROM b.quarter;

DELETE FROM financial_plan a
  USING financial_plan b
  WHERE a.id > b.id
    AND a.source = b.source
    AND a.period = b.period
    AND a.fiscal_year = b.fiscal_year
    AND a.quarter IS NOT DISTINCT FROM b.quarter;

-- 3) Drop the v3_070 (period, fiscal_year, quarter) UNIQUE indexes and replace
--    them with (source, period, fiscal_year, quarter). NULLS NOT DISTINCT keeps
--    rows with quarter NULL de-duplicated by (source, period, fiscal_year).
DROP INDEX IF EXISTS financial_actuals_period_fy_quarter_key;
DROP INDEX IF EXISTS financial_plan_period_fy_quarter_key;

CREATE UNIQUE INDEX IF NOT EXISTS financial_actuals_source_period_fy_quarter_key
  ON financial_actuals (source, period, fiscal_year, quarter) NULLS NOT DISTINCT;

CREATE UNIQUE INDEX IF NOT EXISTS financial_plan_source_period_fy_quarter_key
  ON financial_plan (source, period, fiscal_year, quarter) NULLS NOT DISTINCT;
