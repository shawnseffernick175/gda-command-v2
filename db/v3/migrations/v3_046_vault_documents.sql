-- F-614: Vault — document upload, AI parse on ingest, sitewide linkage, audit trail

CREATE TABLE IF NOT EXISTS vault_documents (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('contract','proposal','invoice','certificate','teaming_agreement','rfp','other')),
  file_size_bytes BIGINT,
  file_path TEXT,
  extracted_text TEXT,
  ai_summary TEXT,
  ai_tags JSONB,
  ai_entities JSONB,
  linked_opportunity_id INTEGER REFERENCES opportunities(id),
  linked_capture_id INTEGER REFERENCES captures(id),
  linked_award_id INTEGER REFERENCES awards(id),
  uploaded_by TEXT NOT NULL DEFAULT 'admin',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS vault_audit_trail (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES vault_documents(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'admin',
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_doc_type ON vault_documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_vault_opp ON vault_documents(linked_opportunity_id);
CREATE INDEX IF NOT EXISTS idx_vault_capture ON vault_documents(linked_capture_id);
CREATE INDEX IF NOT EXISTS idx_vault_deleted ON vault_documents(deleted_at);
