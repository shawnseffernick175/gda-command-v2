-- v3_079_workshop.sql — Workshop: document teardown + targeted output generation (#873)

CREATE TABLE IF NOT EXISTS document_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by UUID,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  classification TEXT,
  teardown_analysis JSONB,
  teardown_run_at TIMESTAMPTZ,
  teardown_model TEXT,
  status TEXT DEFAULT 'uploaded' CHECK (status IN ('uploaded','analyzing','analyzed','failed'))
);

CREATE INDEX IF NOT EXISTS idx_document_uploads_status ON document_uploads(status);
CREATE INDEX IF NOT EXISTS idx_document_uploads_uploaded_at ON document_uploads(uploaded_at DESC);

CREATE TABLE IF NOT EXISTS workshop_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_upload_id UUID REFERENCES document_uploads(id) ON DELETE CASCADE,
  output_type TEXT NOT NULL,
  output_format TEXT NOT NULL CHECK (output_format IN ('docx','pptx','xlsx','txt')),
  vault_doc_id BIGINT REFERENCES vault_documents(id),
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  generated_by UUID,
  config JSONB,
  rendered_text TEXT
);

CREATE INDEX IF NOT EXISTS idx_workshop_outputs_source ON workshop_outputs(source_upload_id);
