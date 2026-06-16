-- F-861: Vault .msg parser — add extraction_status column + backfill
-- Tracks whether text extraction succeeded, failed, or is unsupported.

ALTER TABLE vault_documents
  ADD COLUMN IF NOT EXISTS extraction_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending', 'success', 'failed', 'unsupported'));

-- Backfill existing rows: if extracted_text is non-empty, mark success; otherwise pending
UPDATE vault_documents
  SET extraction_status = 'success'
  WHERE extracted_text IS NOT NULL AND extracted_text != '';

UPDATE vault_documents
  SET extraction_status = 'failed'
  WHERE (extracted_text IS NULL OR extracted_text = '')
    AND file_size_bytes > 0;

CREATE INDEX IF NOT EXISTS idx_vault_extraction_status ON vault_documents(extraction_status);
