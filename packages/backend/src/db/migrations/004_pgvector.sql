-- ============================================================================
-- 004: pgvector — Vector Embeddings for Semantic Search & RAG
-- Enables the vector extension, adds document_embeddings table for storing
-- OpenAI text-embedding-3-small vectors (1536 dimensions), and creates
-- HNSW index for fast cosine similarity search.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- Store embeddings for document chunks
CREATE TABLE IF NOT EXISTS document_embeddings (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL DEFAULT 0,
  chunk_text TEXT NOT NULL,
  page_number INT,
  section_title TEXT,
  embedding vector(1536) NOT NULL,
  token_count INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_embeddings_document ON document_embeddings(document_id);

-- HNSW index for fast approximate nearest-neighbor search (cosine distance)
CREATE INDEX idx_embeddings_hnsw ON document_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Track embedding status on knowledge_documents
ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS embedding_status TEXT DEFAULT 'pending'
    CHECK (embedding_status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  ADD COLUMN IF NOT EXISTS embedding_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMPTZ;
