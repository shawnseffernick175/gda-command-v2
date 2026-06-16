-- F-858: Vault → Vehicles ingestion — extend contract_vehicles with extraction fields
-- and add document hash cache for idempotent re-runs.

-- Add vault-extraction columns to contract_vehicles
ALTER TABLE contract_vehicles
  ADD COLUMN IF NOT EXISTS sponsor_agency        TEXT,
  ADD COLUMN IF NOT EXISTS prime_or_sub          TEXT CHECK (prime_or_sub IS NULL OR prime_or_sub IN ('prime', 'sub')),
  ADD COLUMN IF NOT EXISTS prime_contractor      TEXT,
  ADD COLUMN IF NOT EXISTS period_of_performance_start DATE,
  ADD COLUMN IF NOT EXISTS period_of_performance_end   DATE,
  ADD COLUMN IF NOT EXISTS naics_codes           TEXT[],
  ADD COLUMN IF NOT EXISTS set_aside_type        TEXT,
  ADD COLUMN IF NOT EXISTS status                TEXT CHECK (status IS NULL OR status IN ('active', 'expired', 'pending')),
  ADD COLUMN IF NOT EXISTS source_doc_paths      TEXT[],
  ADD COLUMN IF NOT EXISTS extraction_confidence TEXT CHECK (extraction_confidence IS NULL OR extraction_confidence IN ('high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS needs_review          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS extracted_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_vault_doc_ids  INTEGER[],
  ADD COLUMN IF NOT EXISTS doc_content_hash      TEXT;

CREATE INDEX IF NOT EXISTS idx_cv_status ON contract_vehicles(status);
CREATE INDEX IF NOT EXISTS idx_cv_extraction_confidence ON contract_vehicles(extraction_confidence);
CREATE INDEX IF NOT EXISTS idx_cv_doc_hash ON contract_vehicles(doc_content_hash);

-- Cache table: track which vault docs have been processed for vehicle extraction
CREATE TABLE IF NOT EXISTS vault_vehicle_extraction_cache (
  id            SERIAL PRIMARY KEY,
  vault_doc_id  INTEGER NOT NULL REFERENCES vault_documents(id) ON DELETE CASCADE,
  content_hash  TEXT NOT NULL,
  vehicle_id    BIGINT REFERENCES contract_vehicles(id) ON DELETE SET NULL,
  extraction_status TEXT NOT NULL DEFAULT 'pending' CHECK (extraction_status IN ('pending', 'success', 'failed', 'skipped')),
  error_reason  TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vault_doc_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_vvec_vault_doc ON vault_vehicle_extraction_cache(vault_doc_id);
CREATE INDEX IF NOT EXISTS idx_vvec_hash ON vault_vehicle_extraction_cache(content_hash);
