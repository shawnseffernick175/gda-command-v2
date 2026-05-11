-- ============================================================================
-- 002: File Storage
-- Adds uploaded_files table and file_id references on knowledge_documents
-- and shred_jobs so uploaded documents can be linked to their records.
-- ============================================================================

CREATE TABLE IF NOT EXISTS uploaded_files (
  id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_uploaded_files_uploaded_by ON uploaded_files(uploaded_by);

-- Link knowledge documents to their uploaded source file
ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS file_id TEXT REFERENCES uploaded_files(id) ON DELETE SET NULL;

-- Link shred jobs to their uploaded RFP document
ALTER TABLE shred_jobs
  ADD COLUMN IF NOT EXISTS file_id TEXT REFERENCES uploaded_files(id) ON DELETE SET NULL;
