-- Gap 2: per-contract cost composition & rate variance from the authoritative
-- "Revenue Summary by Cost Pool" book. The parser already reads these columns;
-- previously they were collapsed into direct/indirect and discarded. Columns are
-- nullable with NO default so a row not sourced from the cost-pool book reads as
-- "not available" (R1) rather than a fabricated $0, while a real $0 element from
-- the book is stored as 0.

ALTER TABLE project_revenue_actuals
  -- fully-burdened split (previously computed but not persisted)
  ADD COLUMN IF NOT EXISTS direct_cost           NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS indirect_cost         NUMERIC(15,2),
  -- direct-cost composition
  ADD COLUMN IF NOT EXISTS dc_dl_offsite         NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS dc_dl_onsite          NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS dc_direct_travel      NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS dc_subk_labor         NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS dc_subk_travel        NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS dc_subk_material      NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS dc_consultant_labor   NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS dc_consultant_travel  NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS dc_direct_material    NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS dc_direct_odc         NUMERIC(15,2),
  -- per-contract indirect split
  ADD COLUMN IF NOT EXISTS ind_oh_offsite        NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS ind_oh_onsite         NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS ind_mhx               NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS ind_gna               NUMERIC(15,2),
  -- gross profit (distinct from Op Income) + indirect rate variance
  ADD COLUMN IF NOT EXISTS gross_profit          NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS gross_profit_pct      NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS total_indirect_tgt    NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS rate_variance         NUMERIC(15,2);
