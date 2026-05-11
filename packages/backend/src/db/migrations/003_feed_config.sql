-- ============================================================================
-- 003: Feed Configuration
-- Stores SAM.gov/FPDS feed sync settings (NAICS filters, keywords, interval).
-- ============================================================================

CREATE TABLE IF NOT EXISTS feed_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  naics_codes TEXT[] DEFAULT '{}',
  keywords TEXT[] DEFAULT '{}',
  sync_interval_hours INT NOT NULL DEFAULT 6,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add updated_at to fpds_awards if missing (ingest code references it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fpds_awards' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE fpds_awards ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;
