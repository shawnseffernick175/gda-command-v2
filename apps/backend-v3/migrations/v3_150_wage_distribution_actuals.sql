-- v3_150_wage_distribution_actuals.sql — Labor Distribution tab (Financial Bible).
--
-- Payroll's monthly wage distribution book ("<MON>-<YY> Wages.xlsx"): one sheet
-- per fiscal period, one row per employee, wages split across the cost pools the
-- hours were charged to. This is the labor side of the same books the Income
-- Statement and Cost Service Centers tabs read, at employee granularity, and is
-- the base that drives every indirect rate.
--
-- One row per (fiscal period, employee). Column names mirror the source header
-- exactly so every figure traces back to a cell in payroll's book (R1):
--
--   direct_co / direct_cl  — direct labor charged to a contract (CO / CL side)
--   fringe_excl_vhps       — fringe labor excluding vacation/holiday/PTO/sick
--   ind_oh / ind_mhx / ind_ga — indirect labor by pool (Overhead / MHx / G&A)
--   vhps                   — V-H-P-S leave taken (vacation/holiday/personal/sick)
--   ucot                   — uncompensated overtime (a credit; normally negative)
--   unallow_unbill         — unallowable or unbillable wages
--   total_wages            — the book's own row total (stored, never recomputed)
--
-- No derived figures are stored: direct/indirect rollups and ratios are computed
-- on read from these stated columns.

CREATE TABLE IF NOT EXISTS wage_distribution_actuals (
  id                 BIGSERIAL PRIMARY KEY,
  period             TEXT        NOT NULL,             -- e.g. 'FY26 Jul'
  fiscal_year        INTEGER     NOT NULL,
  quarter            INTEGER,
  month_num          INTEGER     NOT NULL,             -- payroll PD, 1..12
  employee_id        TEXT        NOT NULL,             -- payroll ID, e.g. '000417'
  employee_name      TEXT,
  direct_co          NUMERIC(15,2) NOT NULL DEFAULT 0,
  direct_cl          NUMERIC(15,2) NOT NULL DEFAULT 0,
  fringe_excl_vhps   NUMERIC(15,2) NOT NULL DEFAULT 0,
  ind_oh             NUMERIC(15,2) NOT NULL DEFAULT 0,
  ind_mhx            NUMERIC(15,2) NOT NULL DEFAULT 0,
  ind_ga             NUMERIC(15,2) NOT NULL DEFAULT 0,
  vhps               NUMERIC(15,2) NOT NULL DEFAULT 0,
  ucot               NUMERIC(15,2) NOT NULL DEFAULT 0,
  unallow_unbill     NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_wages        NUMERIC(15,2) NOT NULL DEFAULT 0,
  source             TEXT        NOT NULL DEFAULT 'payroll_wages',
  source_doc_id      BIGINT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wage_distribution_actuals_key_idx
  ON wage_distribution_actuals (source, fiscal_year, month_num, employee_id);
CREATE INDEX IF NOT EXISTS wage_distribution_actuals_fy_month_idx
  ON wage_distribution_actuals (fiscal_year, month_num);
CREATE INDEX IF NOT EXISTS wage_distribution_actuals_employee_idx
  ON wage_distribution_actuals (fiscal_year, employee_id);

COMMENT ON TABLE wage_distribution_actuals IS
  'Per-employee monthly wage distribution across direct/indirect/fringe/leave cost pools, from payroll''s Wages workbook. Source-linked via source_doc_id (R1).';
