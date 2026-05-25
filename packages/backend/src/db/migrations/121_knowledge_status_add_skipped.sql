-- Migration 121: Add 'skipped' to knowledge_documents status check constraint.
-- Required by F-038 auto-vectorize: documents with empty extracted text are set to 'skipped'.

ALTER TABLE knowledge_documents
  DROP CONSTRAINT IF EXISTS knowledge_documents_status_check;

ALTER TABLE knowledge_documents
  ADD CONSTRAINT knowledge_documents_status_check
  CHECK (status = ANY (ARRAY['indexed', 'processing', 'failed', 'pending', 'skipped']));
