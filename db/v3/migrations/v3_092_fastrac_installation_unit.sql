-- v3_080: FasTrac — add installation and unit columns to fast_track_signals
-- Supports Tier 1 Army installation & unit innovation signal ingestion (#843).

ALTER TABLE fast_track_signals
  ADD COLUMN IF NOT EXISTS installation TEXT,
  ADD COLUMN IF NOT EXISTS unit TEXT;

CREATE INDEX IF NOT EXISTS idx_fastrac_signals_installation ON fast_track_signals(installation);
CREATE INDEX IF NOT EXISTS idx_fastrac_signals_unit ON fast_track_signals(unit);

-- Unique index on source_url for ON CONFLICT dedup.
-- Partial index excludes NULLs (existing seed rows may have NULL source_url).
CREATE UNIQUE INDEX IF NOT EXISTS idx_fts_source_url_unique
  ON fast_track_signals(source_url)
  WHERE source_url IS NOT NULL;
