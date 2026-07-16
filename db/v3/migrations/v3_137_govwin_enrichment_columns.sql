-- v3_137: GovWin full-enrichment columns (#1134)
--
-- GovWin's unique value is incumbent + competitors + forecast/solicitation
-- lifecycle stage. The govwin ingest already writes incumbent / value_min /
-- value_max, but had nowhere to store the competitor list, and every row
-- landed with the pipeline status 'discovery' (CHECK-constrained), so
-- forecast-vs-solicitation could not be distinguished on the row.
--
-- Adds:
--   competitors     — JSONB array of competitor names from the detail endpoint
--   lifecycle_stage — 'forecast' | 'solicitation' derived from GovWin status
--                     (the pipeline `status` column stays the CHECK-constrained
--                      capture stage; lifecycle_stage carries source lifecycle)
-- Idempotent: safe to re-run.

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS competitors JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT;

-- Index for filtering forecast vs solicitation rows.
CREATE INDEX IF NOT EXISTS idx_opps_lifecycle_stage
  ON opportunities (lifecycle_stage) WHERE deleted_at IS NULL;
