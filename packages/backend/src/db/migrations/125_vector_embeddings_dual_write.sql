-- Migration 125: vector_embeddings + dual_write_errors (Phase 2C PR 1)
-- Creates the pgvector mirror of the Pinecone "ai-assistant" index for
-- dual-write scaffolding. Dimension = 1536 (text-embedding-ada-002 / text-embedding-3-small).
-- Also creates dual_write_errors for logging pgvector write failures.

-- Ensure pgvector extension is available
CREATE EXTENSION IF NOT EXISTS vector;

-- ═══════════════════════════════════════════════════════════════
-- vector_embeddings — pgvector mirror of Pinecone
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vector_embeddings (
  id TEXT PRIMARY KEY,
  collection TEXT NOT NULL,
  document_id TEXT,
  content TEXT,
  embedding vector(1536) NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX vector_embeddings_collection_idx ON vector_embeddings(collection);
CREATE INDEX vector_embeddings_document_id_idx ON vector_embeddings(document_id);
CREATE INDEX vector_embeddings_embedding_hnsw_idx ON vector_embeddings USING hnsw (embedding vector_cosine_ops);

-- ═══════════════════════════════════════════════════════════════
-- dual_write_errors — log pgvector write failures
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dual_write_errors (
  id SERIAL PRIMARY KEY,
  collection TEXT,
  document_id TEXT,
  error_message TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- Grants — gda_runtime (DML) + gda_app (ALL)
-- ═══════════════════════════════════════════════════════════════
-- Uses same conditional grant pattern as migration 123.

DO $$
DECLARE
  runtime TEXT;
  app_role TEXT;
  dbname TEXT := current_database();
BEGIN
  IF dbname IN ('gda', 'gda_command') THEN
    runtime := 'gda_runtime';
    app_role := 'gda_app';
  ELSIF dbname IN ('gda_staging', 'gda_command_staging') THEN
    runtime := 'gda_staging_rt';
    app_role := NULL; -- staging has no separate app role
  ELSE
    RAISE NOTICE 'M125: unrecognized database "%" — skipping role grants', dbname;
    RETURN;
  END IF;

  -- vector_embeddings grants
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON vector_embeddings TO %I', runtime);
    RAISE NOTICE 'M125: granted DML on vector_embeddings to %', runtime;
  END IF;

  IF app_role IS NOT NULL AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT ALL ON vector_embeddings TO %I', app_role);
    RAISE NOTICE 'M125: granted ALL on vector_embeddings to %', app_role;
  END IF;

  -- dual_write_errors grants
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON dual_write_errors TO %I', runtime);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE dual_write_errors_id_seq TO %I', runtime);
    RAISE NOTICE 'M125: granted DML + sequence on dual_write_errors to %', runtime;
  END IF;

  IF app_role IS NOT NULL AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT ALL ON dual_write_errors TO %I', app_role);
    EXECUTE format('GRANT ALL ON SEQUENCE dual_write_errors_id_seq TO %I', app_role);
    RAISE NOTICE 'M125: granted ALL on dual_write_errors to %', app_role;
  END IF;
END $$;
