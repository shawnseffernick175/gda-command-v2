-- V3 Migration 001: Initial schema
-- Creates all core tables from phase-1-architecture-and-schema.md §2
-- Forward-only. No IF NOT EXISTS guards. No destructive ops on legacy tables.

BEGIN;

-- ============================================================================
-- 2.1  sources — Canonical source registry (R1 backbone)
-- ============================================================================
CREATE TABLE sources (
  id            BIGSERIAL     PRIMARY KEY,
  kind          TEXT          NOT NULL
                              CHECK (kind IN (
                                'sam_gov', 'fpds', 'usaspending', 'govwin',
                                'govtribe', 'news', 'doctrine', 'partner_site',
                                'internal', 'manual', 'n8n_workflow'
                              )),
  url           TEXT,
  title         TEXT,
  retrieved_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  confidence    TEXT          NOT NULL DEFAULT 'high'
                              CHECK (confidence IN ('high', 'medium', 'low')),
  meta          JSONB         NOT NULL DEFAULT '{}',
  legacy_id     TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sources_kind      ON sources (kind);
CREATE INDEX idx_sources_url       ON sources (url) WHERE url IS NOT NULL;
CREATE INDEX idx_sources_retrieved  ON sources (retrieved_at DESC);
CREATE UNIQUE INDEX sources_legacy_id_uniq ON sources(legacy_id) WHERE legacy_id IS NOT NULL;

-- ============================================================================
-- 2.2  users — Operators
-- ============================================================================
CREATE TABLE users (
  id            BIGSERIAL     PRIMARY KEY,
  email         TEXT          NOT NULL UNIQUE,
  display_name  TEXT          NOT NULL,
  role          TEXT          NOT NULL DEFAULT 'operator'
                              CHECK (role IN ('admin', 'operator', 'viewer')),
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  password_hash TEXT,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2.3  opportunities — Envision pursuits
-- ============================================================================
CREATE TABLE opportunities (
  id                  BIGSERIAL     PRIMARY KEY,
  title               TEXT          NOT NULL,
  agency              TEXT,
  sub_agency          TEXT,
  department          TEXT,
  solicitation_number TEXT,
  sam_notice_id       TEXT          UNIQUE,
  status              TEXT          NOT NULL DEFAULT 'discovery'
                                    CHECK (status IN (
                                      'discovery', 'tracking', 'qualifying',
                                      'qualified', 'no_bid', 'closed', 'awarded'
                                    )),
  grade               TEXT          CHECK (grade IN ('A', 'B', 'C')),
  grade_evidence      TEXT,
  value_min           NUMERIC,
  value_max           NUMERIC,
  naics               TEXT,
  psc                 TEXT,
  set_aside           TEXT,
  place_of_performance TEXT,
  response_due_at     TIMESTAMPTZ,
  posted_at           TIMESTAMPTZ,
  incumbent           TEXT,
  incumbent_confidence TEXT CHECK (incumbent_confidence IN ('high', 'medium', 'low')),
  incumbent_source    TEXT,
  description         TEXT,
  tags                TEXT[]        NOT NULL DEFAULT '{}',
  data_source         TEXT          NOT NULL DEFAULT 'manual',
  analysis            JSONB,
  analysis_version    TEXT,
  ai_analyzed_at      TIMESTAMPTZ,
  is_teaming_required BOOLEAN       NOT NULL DEFAULT FALSE,
  source_id           BIGINT        NOT NULL REFERENCES sources(id),
  created_by          BIGINT        REFERENCES users(id),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_opps_status         ON opportunities (status) WHERE deleted_at IS NULL;
CREATE INDEX idx_opps_agency         ON opportunities (agency) WHERE deleted_at IS NULL;
CREATE INDEX idx_opps_naics          ON opportunities (naics) WHERE deleted_at IS NULL;
CREATE INDEX idx_opps_set_aside      ON opportunities (set_aside) WHERE deleted_at IS NULL;
CREATE INDEX idx_opps_response_due   ON opportunities (response_due_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_opps_grade          ON opportunities (grade) WHERE deleted_at IS NULL;
CREATE INDEX idx_opps_sam_notice     ON opportunities (sam_notice_id) WHERE sam_notice_id IS NOT NULL;
CREATE INDEX idx_opps_source         ON opportunities (source_id);
CREATE INDEX idx_opps_deleted        ON opportunities (deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- 2.4  pipeline_items — Qualified opportunities in active capture
-- ============================================================================
CREATE TABLE pipeline_items (
  id                BIGSERIAL     PRIMARY KEY,
  opportunity_id    BIGINT        NOT NULL REFERENCES opportunities(id),
  capture_owner     TEXT          NOT NULL,
  win_probability   NUMERIC       CHECK (win_probability >= 0 AND win_probability <= 100),
  win_prob_evidence TEXT,
  milestone_90day   TEXT,
  estimated_value   NUMERIC,
  stage             TEXT          NOT NULL DEFAULT 'qualifying'
                                  CHECK (stage IN (
                                    'qualifying', 'pursuit', 'proposal', 'submitted',
                                    'evaluation', 'won', 'lost'
                                  )),
  source_id         BIGINT        NOT NULL REFERENCES sources(id),
  created_by        BIGINT        REFERENCES users(id),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pipeline_opp        ON pipeline_items (opportunity_id);
CREATE INDEX idx_pipeline_owner      ON pipeline_items (capture_owner);
CREATE INDEX idx_pipeline_stage      ON pipeline_items (stage);
CREATE INDEX idx_pipeline_source     ON pipeline_items (source_id);

-- ============================================================================
-- 2.5  captures — Capture plans with color review state
-- ============================================================================
CREATE TABLE captures (
  id                BIGSERIAL     PRIMARY KEY,
  pipeline_item_id  BIGINT        NOT NULL REFERENCES pipeline_items(id),
  color_stage       TEXT          NOT NULL DEFAULT 'pink'
                                  CHECK (color_stage IN ('pink', 'red', 'gold', 'submitted')),
  capture_plan      JSONB         NOT NULL DEFAULT '{}',
  pricing_notes     TEXT,
  compliance_status TEXT          NOT NULL DEFAULT 'incomplete'
                                  CHECK (compliance_status IN ('incomplete', 'partial', 'complete')),
  win_themes        TEXT[],
  ghost_team        JSONB,
  source_id         BIGINT        NOT NULL REFERENCES sources(id),
  created_by        BIGINT        REFERENCES users(id),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_captures_pipeline   ON captures (pipeline_item_id);
CREATE INDEX idx_captures_color      ON captures (color_stage);
CREATE INDEX idx_captures_source     ON captures (source_id);

-- ============================================================================
-- 2.6  compliance_items — RFP requirement breakdown per capture
-- ============================================================================
CREATE TABLE compliance_items (
  id              BIGSERIAL     PRIMARY KEY,
  capture_id      BIGINT        NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  requirement     TEXT          NOT NULL,
  section_ref     TEXT,
  status          TEXT          NOT NULL DEFAULT 'open'
                                CHECK (status IN ('open', 'addressed', 'non_compliant', 'waived')),
  response_notes  TEXT,
  assigned_to     TEXT,
  source_id       BIGINT        NOT NULL REFERENCES sources(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_compliance_capture  ON compliance_items (capture_id);
CREATE INDEX idx_compliance_status   ON compliance_items (status);
CREATE INDEX idx_compliance_source   ON compliance_items (source_id);

-- ============================================================================
-- 2.7  action_items — Drag-from-email or manual to-dos
-- ============================================================================
CREATE TABLE action_items (
  id              BIGSERIAL     PRIMARY KEY,
  title           TEXT          NOT NULL,
  body            TEXT,
  owner_email     TEXT          NOT NULL,
  status          TEXT          NOT NULL DEFAULT 'open'
                                CHECK (status IN ('open', 'done', 'blocked')),
  priority        TEXT          NOT NULL DEFAULT 'normal'
                                CHECK (priority IN ('critical', 'high', 'normal', 'low')),
  due_date        TIMESTAMPTZ,
  origin          TEXT          NOT NULL DEFAULT 'manual'
                                CHECK (origin IN ('email', 'manual', 'sentinel', 'launchpad', 'n8n')),
  origin_ref      TEXT,
  opportunity_id  BIGINT        REFERENCES opportunities(id),
  partner_context TEXT,
  source_id       BIGINT        NOT NULL REFERENCES sources(id),
  created_by      BIGINT        REFERENCES users(id),
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_actions_status      ON action_items (status) WHERE status != 'done';
CREATE INDEX idx_actions_owner       ON action_items (owner_email);
CREATE INDEX idx_actions_due         ON action_items (due_date) WHERE status != 'done';
CREATE INDEX idx_actions_opp         ON action_items (opportunity_id) WHERE opportunity_id IS NOT NULL;
CREATE INDEX idx_actions_source      ON action_items (source_id);

-- ============================================================================
-- 2.8  action_item_drafts — LLM-drafted replies/research/milestones
-- ============================================================================
CREATE TABLE action_item_drafts (
  id              BIGSERIAL     PRIMARY KEY,
  action_item_id  BIGINT        NOT NULL REFERENCES action_items(id) ON DELETE CASCADE,
  kind            TEXT          NOT NULL
                                CHECK (kind IN ('reply', 'research', 'milestone')),
  status          TEXT          NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'approved', 'rejected')),
  content         TEXT          NOT NULL,
  model_used      TEXT,
  approved_by     BIGINT        REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  source_id       BIGINT        NOT NULL REFERENCES sources(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_drafts_action       ON action_item_drafts (action_item_id);
CREATE INDEX idx_drafts_status       ON action_item_drafts (status) WHERE status = 'pending';
CREATE INDEX idx_drafts_source       ON action_item_drafts (source_id);

-- ============================================================================
-- 2.9  partners — Lookup-only teaming partner reference
-- ============================================================================
CREATE TABLE partners (
  id              BIGSERIAL     PRIMARY KEY,
  name            TEXT          NOT NULL UNIQUE,
  anchor_company  TEXT          NOT NULL,
  ceo             TEXT,
  hq_location     TEXT,
  founded_year    INTEGER,
  uei             TEXT,
  cage            TEXT,
  duns            TEXT,
  naics_codes     TEXT[]        NOT NULL DEFAULT '{}',
  certifications  JSONB         NOT NULL DEFAULT '[]',
  vehicles        JSONB         NOT NULL DEFAULT '[]',
  capabilities    TEXT[],
  contact_info    JSONB         NOT NULL DEFAULT '{}',
  notes           TEXT,
  source_id       BIGINT        NOT NULL REFERENCES sources(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2.10  teaming_attachments — Join: opportunity ↔ partner ↔ reason
-- ============================================================================
CREATE TABLE teaming_attachments (
  id              BIGSERIAL     PRIMARY KEY,
  opportunity_id  BIGINT        NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  partner_id      BIGINT        NOT NULL REFERENCES partners(id),
  reason          TEXT          NOT NULL,
  role            TEXT          NOT NULL DEFAULT 'subcontractor'
                                CHECK (role IN ('subcontractor', 'prime', 'mentor', 'joint_venture')),
  status          TEXT          NOT NULL DEFAULT 'proposed'
                                CHECK (status IN ('proposed', 'confirmed', 'declined')),
  source_id       BIGINT        NOT NULL REFERENCES sources(id),
  created_by      BIGINT        REFERENCES users(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (opportunity_id, partner_id)
);

CREATE INDEX idx_teaming_opp         ON teaming_attachments (opportunity_id);
CREATE INDEX idx_teaming_partner     ON teaming_attachments (partner_id);
CREATE INDEX idx_teaming_source      ON teaming_attachments (source_id);

-- ============================================================================
-- 2.11  launchpad_flags — Today-actionable items
-- ============================================================================
CREATE TABLE launchpad_flags (
  id              BIGSERIAL     PRIMARY KEY,
  flag_type       TEXT          NOT NULL
                                CHECK (flag_type IN ('cert_expiry', 'deadline', 'action_overdue', 'teaming_alert', 'system_alert')),
  severity        TEXT          NOT NULL
                                CHECK (severity IN ('critical', 'warning', 'info')),
  title           TEXT          NOT NULL,
  body            TEXT,
  entity_type     TEXT,
  entity_id       BIGINT,
  doctrine_anchor TEXT,
  source_id       BIGINT        NOT NULL REFERENCES sources(id),
  source_url      TEXT,
  dismissed_at    TIMESTAMPTZ,
  dismissed_by    BIGINT        REFERENCES users(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_flags_active        ON launchpad_flags (severity, created_at DESC) WHERE dismissed_at IS NULL;
CREATE INDEX idx_flags_type          ON launchpad_flags (flag_type) WHERE dismissed_at IS NULL;
CREATE INDEX idx_flags_entity        ON launchpad_flags (entity_type, entity_id) WHERE dismissed_at IS NULL;
CREATE INDEX idx_flags_source        ON launchpad_flags (source_id);

-- ============================================================================
-- 2.12  audit_log — Every write captured
-- ============================================================================
CREATE TABLE audit_log (
  id              BIGSERIAL     PRIMARY KEY,
  user_id         BIGINT        REFERENCES users(id),
  action          TEXT          NOT NULL,
  table_name      TEXT          NOT NULL,
  record_id       BIGINT,
  old_values      JSONB,
  new_values      JSONB,
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user          ON audit_log (user_id);
CREATE INDEX idx_audit_table         ON audit_log (table_name, created_at DESC);
CREATE INDEX idx_audit_record        ON audit_log (table_name, record_id) WHERE record_id IS NOT NULL;
CREATE INDEX idx_audit_created       ON audit_log (created_at DESC);

COMMIT;
