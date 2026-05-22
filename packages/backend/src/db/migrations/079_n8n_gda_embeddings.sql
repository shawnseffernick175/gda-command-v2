-- Migration 079: Create gda_embeddings table.
-- Part of F-023c: ADOPT shadow table from n8n-envision-postgres-1.
-- Vector embeddings — 821 rows, 14 MB. Requires pgvector extension
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS gda_embeddings (
  id SERIAL PRIMARY KEY,
  source_type VARCHAR(50) NOT NULL,
  source_id VARCHAR(255),
  source_title TEXT,
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  embedding vector(1536)
);

CREATE INDEX IF NOT EXISTS idx_gda_embeddings_source ON public.gda_embeddings USING btree (source_type, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gda_embeddings_unique ON public.gda_embeddings USING btree (source_type, source_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_gda_embeddings_vector ON public.gda_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists='27');
