-- Migration 038: Fix intel_items schema + add SAM.gov enrichment fields.
--
-- (a) Ensure intel_items.summary exists — Morning Commander writes to this column.
-- (b) Add solicitation_number, value_estimated, due_date, data_source for richer
--     intel feed cards and SAM.gov deep links.

ALTER TABLE intel_items ADD COLUMN IF NOT EXISTS summary TEXT NOT NULL DEFAULT '';
ALTER TABLE intel_items ADD COLUMN IF NOT EXISTS solicitation_number TEXT;
ALTER TABLE intel_items ADD COLUMN IF NOT EXISTS notice_id TEXT;
ALTER TABLE intel_items ADD COLUMN IF NOT EXISTS value_estimated NUMERIC;
ALTER TABLE intel_items ADD COLUMN IF NOT EXISTS due_date TEXT;
ALTER TABLE intel_items ADD COLUMN IF NOT EXISTS data_source TEXT;
