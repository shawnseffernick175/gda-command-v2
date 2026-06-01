-- V3 Migration 020: RAG Knowledge Base — kb_documents + kb_chunks (F-301)
--
-- Creates the vector-search knowledge base for grounding agent analysis
-- in retrievable, citable, OU-tagged, evidence-graded chunks.
-- Uses pgvector when available; gracefully skips vector objects otherwise
-- (e.g. in integration-test containers that run plain Postgres).
-- Forward-only.

BEGIN;

-- ============================================================================
-- 17.0  Enable pgvector extension (skip gracefully if not installed)
-- ============================================================================
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector extension not available — vector columns and indexes will be skipped';
END $$;

-- ============================================================================
-- 17.1  kb_documents — source documents in the RAG corpus
-- ============================================================================
CREATE TABLE IF NOT EXISTS kb_documents (
  id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  source_filename     TEXT            NOT NULL,
  source_url          TEXT,
  doc_type            TEXT            NOT NULL,
  ou_tag              TEXT,
  evidence_grade      CHAR(1),
  title               TEXT,
  uploaded_at         TIMESTAMPTZ     NOT NULL DEFAULT now(),
  last_chunked_at     TIMESTAMPTZ,
  chunk_count         INT             DEFAULT 0,
  byte_size           INT,
  sha256              CHAR(64)        UNIQUE,
  embed_model_version TEXT            NOT NULL DEFAULT 'text-embedding-3-large',
  metadata            JSONB,

  CONSTRAINT kb_documents_doc_type_check CHECK (doc_type = ANY (ARRAY[
    'ceo_doctrine', 'business_plan', 'capabilities', 'past_performance',
    'cpar', 'workflow_spec', 'rfp', 'proposal_draft', 'capture_plan',
    'partner_intel', 'financial', 'news_article', 'meeting_transcript',
    'sow', 'awarded_contract', 'other'
  ])),
  CONSTRAINT kb_documents_ou_tag_check CHECK (ou_tag IS NULL OR ou_tag = ANY (ARRAY[
    'gda', 'envision', 'pds', 'riverstone'
  ])),
  CONSTRAINT kb_documents_evidence_grade_check CHECK (evidence_grade IS NULL OR evidence_grade = ANY (ARRAY[
    'A', 'B', 'C'
  ]))
);

CREATE INDEX IF NOT EXISTS kb_documents_type_ou ON kb_documents(doc_type, ou_tag);
CREATE INDEX IF NOT EXISTS kb_documents_sha256_idx ON kb_documents(sha256);

-- ============================================================================
-- 17.2  kb_chunks — embeddings for semantic search
--       Uses 2000 dimensions (text-embedding-3-large supports native dim
--       reduction via the `dimensions` API param; 2000 dims stays within
--       pgvector HNSW limit while preserving high retrieval quality).
-- ============================================================================
DO $$ BEGIN
  -- Only create the vector table if the extension loaded successfully
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    CREATE TABLE IF NOT EXISTS kb_chunks (
      id                UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id       UUID            NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
      chunk_index       INT             NOT NULL,
      chunk_text        TEXT            NOT NULL,
      embedding         vector(2000)    NOT NULL,
      token_count       INT,
      page_number       INT,
      section_title     TEXT,
      created_at        TIMESTAMPTZ     NOT NULL DEFAULT now(),
      UNIQUE (document_id, chunk_index)
    );

    CREATE INDEX IF NOT EXISTS kb_chunks_embedding_idx ON kb_chunks
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);

    CREATE INDEX IF NOT EXISTS kb_chunks_doc_idx ON kb_chunks(document_id);
  ELSE
    RAISE NOTICE 'pgvector not available — kb_chunks table (with vector column) not created';
  END IF;
END $$;

COMMIT;
