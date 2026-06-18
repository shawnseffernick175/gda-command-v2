-- v3_080: Add FasTrac ingestion columns for Tier 1 innovation org signals
-- Supports: institution_type classification, signal_type (need/solution),
-- funding_mechanism tracking, and unique-index dedup on source_url.

ALTER TABLE fast_track_signals
  ADD COLUMN IF NOT EXISTS funding_mechanism TEXT,
  ADD COLUMN IF NOT EXISTS institution_type TEXT,
  ADD COLUMN IF NOT EXISTS signal_type TEXT CHECK (signal_type IN ('need', 'solution'));

-- Unique index for dedup-by-URL (idempotent ingestion)
CREATE UNIQUE INDEX IF NOT EXISTS idx_fastrac_signals_source_url
  ON fast_track_signals(source_url)
  WHERE source_url IS NOT NULL;
