-- V3 Migration 023: Color Team Reviews (F-Color-Team-Reviews)
-- Creates documents (stub for F-Universal-Ingestion), color_team_runs,
-- color_team_findings, and extends sources.kind for color_team.

BEGIN;

-- ============================================================================
-- Extend sources.kind CHECK to include color_team
-- ============================================================================
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_kind_check;
ALTER TABLE sources ADD CONSTRAINT sources_kind_check
  CHECK (kind = ANY (ARRAY[
    'sam_gov',
    'fpds',
    'usaspending',
    'govwin',
    'govtribe',
    'news',
    'doctrine',
    'partner_site',
    'internal',
    'manual',
    'n8n_workflow',
    'dibbs',
    'neco',
    'sbir',
    'federal_register',
    'color_team'
  ]));

-- ============================================================================
-- documents — Stub table for F-Universal-Ingestion.
-- Stores uploaded docs (RFP drafts, capture plans, white papers, proposals).
-- Will be replaced/extended when F-Universal-Ingestion ships.
-- ============================================================================
CREATE TABLE documents (
  id              BIGSERIAL     PRIMARY KEY,
  filename        TEXT          NOT NULL,
  mime_type       TEXT          NOT NULL DEFAULT 'application/pdf',
  file_size_bytes BIGINT,
  doc_type        TEXT          NOT NULL DEFAULT 'unknown'
                                CHECK (doc_type IN (
                                  'rfp_draft', 'capture_plan', 'white_paper',
                                  'proposal_section', 'proposal_full', 'unknown'
                                )),
  storage_path    TEXT          NOT NULL,
  uploaded_by     TEXT          NOT NULL,
  opportunity_id  BIGINT        REFERENCES opportunities(id),
  metadata        JSONB         NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_uploaded_by   ON documents (uploaded_by);
CREATE INDEX idx_documents_opportunity   ON documents (opportunity_id) WHERE opportunity_id IS NOT NULL;
CREATE INDEX idx_documents_doc_type      ON documents (doc_type);

-- ============================================================================
-- color_team_runs — A single "Run Color Team" invocation
-- ============================================================================
CREATE TABLE color_team_runs (
  id              BIGSERIAL     PRIMARY KEY,
  document_id     BIGINT        NOT NULL REFERENCES documents(id),
  linked_rfp_id   BIGINT        REFERENCES opportunities(id),
  colors          TEXT[]        NOT NULL,
  status          TEXT          NOT NULL DEFAULT 'queued'
                                CHECK (status IN ('queued', 'running', 'complete', 'error')),
  triggered_by    TEXT          NOT NULL,
  started_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  error_message   TEXT,
  source_id       BIGINT        REFERENCES sources(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_color_team_runs_doc      ON color_team_runs (document_id);
CREATE INDEX idx_color_team_runs_status   ON color_team_runs (status);
CREATE INDEX idx_color_team_runs_trigger  ON color_team_runs (triggered_by);

-- ============================================================================
-- color_team_findings — Per-color findings inside a run
-- ============================================================================
CREATE TABLE color_team_findings (
  id              BIGSERIAL     PRIMARY KEY,
  run_id          BIGINT        NOT NULL REFERENCES color_team_runs(id) ON DELETE CASCADE,
  color           TEXT          NOT NULL
                                CHECK (color IN ('pink', 'red', 'black', 'blue', 'white', 'green')),
  severity        TEXT          NOT NULL
                                CHECK (severity IN ('info', 'warning', 'critical', 'blocker')),
  section_ref     TEXT,
  finding         TEXT          NOT NULL,
  recommended_fix TEXT,
  citations       JSONB         NOT NULL DEFAULT '[]',
  doctrine_score  JSONB,
  exclusion_hits  TEXT[],
  margin_check    JSONB,
  action_item_id  BIGINT        REFERENCES action_items(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_color_team_findings_run_color ON color_team_findings (run_id, color);
CREATE INDEX idx_color_team_findings_severity  ON color_team_findings (severity);

-- ============================================================================
-- feature_flags — Simple feature flag store
-- ============================================================================
CREATE TABLE IF NOT EXISTS feature_flags (
  id              BIGSERIAL     PRIMARY KEY,
  flag_name       TEXT          NOT NULL UNIQUE,
  enabled         BOOLEAN       NOT NULL DEFAULT FALSE,
  description     TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

INSERT INTO feature_flags (flag_name, enabled, description)
VALUES ('color_team_reviews_v1', TRUE, 'F-Color-Team-Reviews: Multi-color review on any uploaded doc')
ON CONFLICT (flag_name) DO NOTHING;

COMMIT;
