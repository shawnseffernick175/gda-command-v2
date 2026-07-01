-- F-313: Output Generators — Briefing / Capture Plan / Win Theme PDFs
-- Stores generated document metadata. Actual PDFs are saved to disk and
-- linked back via vault_documents for the Vault door.

BEGIN;

CREATE TABLE IF NOT EXISTS generated_documents (
  id              BIGSERIAL     PRIMARY KEY,
  doc_kind        TEXT          NOT NULL
                                CHECK (doc_kind IN ('briefing', 'capture_plan', 'win_themes')),
  opportunity_id  BIGINT        REFERENCES opportunities(id),
  capture_id      BIGINT        REFERENCES captures(id),
  vault_doc_id    INTEGER       REFERENCES vault_documents(id),
  file_path       TEXT          NOT NULL,
  file_size_bytes BIGINT,
  generation_model TEXT,
  generation_input JSONB        NOT NULL DEFAULT '{}',
  citations       JSONB         NOT NULL DEFAULT '[]',
  doctrine_refs   JSONB         NOT NULL DEFAULT '[]',
  superseded      BOOLEAN       NOT NULL DEFAULT FALSE,
  created_by      TEXT          NOT NULL DEFAULT 'system',
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generated_docs_opp
  ON generated_documents (opportunity_id) WHERE opportunity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_generated_docs_capture
  ON generated_documents (capture_id) WHERE capture_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_generated_docs_kind
  ON generated_documents (doc_kind);
CREATE INDEX IF NOT EXISTS idx_generated_docs_vault
  ON generated_documents (vault_doc_id) WHERE vault_doc_id IS NOT NULL;

COMMIT;
