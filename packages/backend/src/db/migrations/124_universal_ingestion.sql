-- Migration 124: Universal Document Ingestion (F-038 Phase 2B PR 1)
-- Adds columns for parent/child document tracking, extraction method tracking,
-- and human-readable status reasons.

ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS parent_document_id TEXT NULL
    REFERENCES knowledge_documents(id) ON DELETE SET NULL;

ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS extraction_method TEXT NULL;
  -- Values: 'native', 'ocr', 'archive_member'

ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS status_reason TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_parent
  ON knowledge_documents(parent_document_id)
  WHERE parent_document_id IS NOT NULL;

-- Update the status check constraint to include 'error' (alias for 'failed')
-- The existing constraint allows: indexed, processing, failed, pending, skipped
-- No change needed — 'error' maps to 'failed' in application code.
