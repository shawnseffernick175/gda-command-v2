-- Per-contract descriptive attributes carried by the "Revenue Summary by Cost
-- Pool" book: the contract/program label, prime-vs-sub posture, contract type,
-- division, org and period of performance for each row. Which of these a given
-- monthly sheet actually states varies by layout -- the JUN-26 book, for one,
-- states only contract type, org and active-flag -- so each is stored only when
-- the sheet states it. They were dropped at ingest entirely, so the Financial
-- Bible could show cost-pool dollars but could not group or filter them the way
-- Finance reads the book (by contract/vehicle, prime vs sub, contract type).
--
-- Columns are nullable with NO default so a row sourced from an older layout
-- (which omits these columns) reads as "not available" (R1) rather than a
-- fabricated blank/false.
--
-- Contract Value / Total Funded / ITD Revenue are NOT added here: those concepts
-- already have canonical columns (itd_value / itd_funding / actual_itd_revenue)
-- fed by the "Full Proj Revenue Summary" book. The cost-pool ingest fills them
-- only when that book has not, so each figure keeps exactly one column.

ALTER TABLE project_revenue_actuals
  ADD COLUMN IF NOT EXISTS division       TEXT,
  -- "Contract" in the book: the contract/vehicle/program a task order sits under
  -- (e.g. "RS3 - STEP", "OASIS - PM MC"), NOT the contract number.
  ADD COLUMN IF NOT EXISTS contract_label TEXT,
  -- "Prime or Sub": "PRIME", or the prime's name when Envision is the sub.
  ADD COLUMN IF NOT EXISTS prime_or_sub   TEXT,
  -- "Proj Type": T&M / CPFF / FIXED PRICE.
  ADD COLUMN IF NOT EXISTS proj_type      TEXT,
  ADD COLUMN IF NOT EXISTS org_id         TEXT,
  -- Period of performance, as stated per row in the book.
  ADD COLUMN IF NOT EXISTS pop_start      DATE,
  ADD COLUMN IF NOT EXISTS pop_end        DATE,
  -- "Active (Y/N)" as stated in the book; NULL when the column is absent.
  ADD COLUMN IF NOT EXISTS is_active      BOOLEAN;

-- The cost-pool tab filters and groups on these attributes across all periods.
CREATE INDEX IF NOT EXISTS idx_project_revenue_contract_label
  ON project_revenue_actuals (contract_label);
