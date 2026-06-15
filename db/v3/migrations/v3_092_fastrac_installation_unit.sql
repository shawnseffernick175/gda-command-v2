-- v3_080: FasTrac — add installation and unit columns to fast_track_signals
-- Supports Tier 1 Army installation & unit innovation signal ingestion (#843).

ALTER TABLE fast_track_signals
  ADD COLUMN IF NOT EXISTS installation TEXT,
  ADD COLUMN IF NOT EXISTS unit TEXT;

CREATE INDEX IF NOT EXISTS idx_fastrac_signals_installation ON fast_track_signals(installation);
CREATE INDEX IF NOT EXISTS idx_fastrac_signals_unit ON fast_track_signals(unit);
