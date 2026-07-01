-- F-304: Universal Ingestion — ingest_jobs table + supporting types.
-- Tracks every uploaded/emailed document through the extract → classify → route pipeline.

-- Status enum for ingest jobs
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ingest_job_status') THEN
    CREATE TYPE ingest_job_status AS ENUM (
      'pending', 'extracting', 'classifying', 'routing', 'routed', 'failed'
    );
  END IF;
END
$do$;

-- Ingestion source enum
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ingest_source') THEN
    CREATE TYPE ingest_source AS ENUM (
      'drag_drop', 'email_webhook', 'api_upload', 'backfill'
    );
  END IF;
END
$do$;

-- Target surface enum (where the doc gets routed)
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ingest_target_surface') THEN
    CREATE TYPE ingest_target_surface AS ENUM (
      'opportunities', 'pipeline', 'capture', 'partner_intel', 'action_items',
      'daily_news', 'sentinel', 'vault', 'financials', 'regulatory',
      'fastrac', 'vehicles', 'digest', 'inbox'
    );
  END IF;
END
$do$;

-- Classified entity type
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ingest_entity_type') THEN
    CREATE TYPE ingest_entity_type AS ENUM (
      'opportunity', 'capture_doc', 'partner_doc', 'action_item',
      'regulatory_notice', 'news_item', 'financial_doc', 'cpar',
      'doctrine_doc', 'vehicle_doc', 'other'
    );
  END IF;
END
$do$;

CREATE TABLE IF NOT EXISTS ingest_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- file metadata
  filename        TEXT NOT NULL,
  file_path       TEXT,
  file_size_bytes BIGINT,
  mime_type       TEXT,
  -- source / origin
  source          ingest_source NOT NULL DEFAULT 'drag_drop',
  source_surface  TEXT,                       -- which door the upload came from
  email_from      TEXT,                       -- for email-webhook
  email_subject   TEXT,                       -- for email-webhook
  email_message_id TEXT,                      -- for email-webhook dedup
  -- extraction
  extracted_text  TEXT,
  extraction_meta JSONB DEFAULT '{}',         -- page count, cell count, etc.
  -- classification
  status          ingest_job_status NOT NULL DEFAULT 'pending',
  target_surface  ingest_target_surface,
  entity_type     ingest_entity_type,
  classification_confidence NUMERIC(4,3),     -- 0.000–1.000
  classification_rationale  TEXT,
  doctrine_flag   TEXT,                       -- OU1/OU2 tag for teaming context
  evidence_grade  TEXT CHECK (evidence_grade IN ('A', 'B', 'C')),
  -- routing
  target_entity_id TEXT,                      -- polymorphic FK to routed entity
  action_item_id   INTEGER REFERENCES action_items(id),
  vault_document_id INTEGER,                  -- link back to vault_documents
  -- PII
  pii_detected    BOOLEAN DEFAULT FALSE,
  pii_redacted    BOOLEAN DEFAULT FALSE,
  -- error tracking
  error_message   TEXT,
  error_step      TEXT,                       -- which step failed
  -- ownership
  owner           TEXT DEFAULT 'system',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ingest_jobs_status ON ingest_jobs (status);
CREATE INDEX IF NOT EXISTS idx_ingest_jobs_target_surface ON ingest_jobs (target_surface);
CREATE INDEX IF NOT EXISTS idx_ingest_jobs_source ON ingest_jobs (source);
CREATE INDEX IF NOT EXISTS idx_ingest_jobs_created_at ON ingest_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingest_jobs_owner ON ingest_jobs (owner);
CREATE INDEX IF NOT EXISTS idx_ingest_jobs_email_message_id ON ingest_jobs (email_message_id) WHERE email_message_id IS NOT NULL;

-- Classification corrections feed decision memory (F-302)
CREATE TABLE IF NOT EXISTS ingest_classification_corrections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingest_job_id     UUID NOT NULL REFERENCES ingest_jobs(id),
  original_surface  ingest_target_surface,
  original_entity_type ingest_entity_type,
  corrected_surface ingest_target_surface NOT NULL,
  corrected_entity_type ingest_entity_type NOT NULL,
  corrected_by      TEXT NOT NULL DEFAULT 'user',
  rationale         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingest_corrections_job ON ingest_classification_corrections (ingest_job_id);
