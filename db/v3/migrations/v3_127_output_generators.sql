-- F-313: Output Generators — generated PDFs (briefing, capture plan, win themes)
-- Generated documents are first-class docs that can be re-uploaded for color review.

CREATE TABLE IF NOT EXISTS generated_documents (
  id              BIGSERIAL PRIMARY KEY,
  doc_type        TEXT NOT NULL CHECK (doc_type IN ('briefing', 'capture_plan', 'win_themes')),
  opportunity_id  BIGINT REFERENCES opportunities(id),
  capture_id      BIGINT REFERENCES captures(id),
  title           TEXT NOT NULL,
  html_content    TEXT NOT NULL,
  citations       JSONB NOT NULL DEFAULT '[]',
  doctrine_refs   JSONB NOT NULL DEFAULT '[]',
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generated_documents_opportunity ON generated_documents(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_generated_documents_capture ON generated_documents(capture_id);
CREATE INDEX IF NOT EXISTS idx_generated_documents_doc_type ON generated_documents(doc_type);
