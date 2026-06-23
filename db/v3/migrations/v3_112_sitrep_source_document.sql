-- F-612: Add source_document_id + source_document_url to sitrep_items
-- so a Vault doc can be linked when "Send to SITREP" is used.

ALTER TABLE sitrep_items
  ADD COLUMN IF NOT EXISTS source_document_id INTEGER REFERENCES vault_documents(id) ON DELETE SET NULL;

ALTER TABLE sitrep_items
  ADD COLUMN IF NOT EXISTS source_document_url TEXT;

CREATE INDEX IF NOT EXISTS idx_sitrep_items_source_doc
  ON sitrep_items (source_document_id)
  WHERE source_document_id IS NOT NULL;
