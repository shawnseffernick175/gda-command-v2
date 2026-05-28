-- Migration 125: Extend document_embeddings for Phase 2C (Pinecone → pgvector)
--
-- Adds collection + metadata columns to the existing document_embeddings table
-- so n8n writer workflows can store vectors with namespace/metadata via
-- POST /api/internal/vector-upsert. No new tables — unified vector store.
--
-- collection maps to Pinecone namespaces: 'knowledge' (default for backend
-- writes), 'gda-documents', 'general', 'financial', 'competitive_intel'.

ALTER TABLE document_embeddings
  ADD COLUMN IF NOT EXISTS collection TEXT NOT NULL DEFAULT 'knowledge';

ALTER TABLE document_embeddings
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS document_embeddings_collection_idx
  ON document_embeddings(collection);
