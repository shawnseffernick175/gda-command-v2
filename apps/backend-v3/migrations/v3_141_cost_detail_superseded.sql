-- V3 Migration 141: Single-source cost_detail via soft supersede (#1142)
--
-- cost_detail_actuals accumulated the same direct-cost dollars under multiple
-- rows for one period: (a) pre-canonical raw account labels (e.g. "Subcontractor
-- Labor" alongside the canonical "Subcontractor") left behind by older ingests,
-- and (b) year-to-date CUMULATIVE tgt_vs_act / GL rows. Reads that re-bucket raw
-- labels to the eight canonical lines then summed the same figure twice.
--
-- The deterministic Trended Income Statement (source income_statement) is the one
-- authoritative, reconcilable MONTHLY source, and the write path now (i) collapses
-- every direct line to the canonical eight and (ii) gives each period a single
-- owning quarter-end snapshot. This migration soft-supersedes the non-authoritative
-- FY26 rows so reads return exactly one figure per (period, canonical line).
--
-- Soft and reversible: a reingest revives an authoritative row by resetting
-- superseded_at to NULL in the upsert (ingestCostDetailRows). No rows are deleted.
-- Forward-only and idempotent — safe to re-run.

BEGIN;

ALTER TABLE cost_detail_actuals
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_reason text;

CREATE INDEX IF NOT EXISTS idx_cost_detail_actuals_live
  ON cost_detail_actuals (fiscal_year, period)
  WHERE superseded_at IS NULL;

UPDATE cost_detail_actuals
   SET superseded_at = now(),
       superseded_reason = 'single-source cost_detail (#1142): not income_statement canonical direct line'
 WHERE fiscal_year = 2026
   AND superseded_at IS NULL
   AND NOT (
     source = 'income_statement'
     AND cost_element = ANY (ARRAY[
       'DL Onsite', 'DL Offsite', 'Subcontractor', 'Consultant',
       'Dir Travel', 'Sub Material', 'Direct Material', 'ODC'
     ])
   );

COMMIT;
