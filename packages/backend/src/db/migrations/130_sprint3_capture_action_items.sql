-- F-102 Sprint 3: Capture + Action Items tables
-- Depends on: 129_sprint2_opps_pipeline_partner_intel.sql (pipeline_items, partner_intel_profiles, teaming_flags)

-- 1a. color_review_stage enum + captures table
DO $$ BEGIN
  CREATE TYPE color_review_stage AS ENUM ('pink', 'red', 'gold', 'submitted');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS captures (
  id                      BIGSERIAL PRIMARY KEY,
  ou_tag                  ou_tag NOT NULL DEFAULT 'envision',
  pipeline_item_id        BIGINT NOT NULL REFERENCES pipeline_items(id),
  rfp_uploaded_at         TIMESTAMPTZ,
  rfp_storage_url         TEXT,
  compliance_matrix       JSONB NOT NULL DEFAULT '[]',
  color_review_stage      color_review_stage NOT NULL DEFAULT 'pink',
  color_review_notes      TEXT[] NOT NULL DEFAULT '{}',
  pricing_assumptions     JSONB NOT NULL DEFAULT '{}',
  teaming_worksheet       JSONB NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_captures_pipeline    ON captures(pipeline_item_id);
CREATE INDEX IF NOT EXISTS idx_captures_stage       ON captures(color_review_stage);
CREATE INDEX IF NOT EXISTS idx_captures_ou_tag      ON captures(ou_tag);

-- 1b. compliance_items table
CREATE TABLE IF NOT EXISTS compliance_items (
  id                BIGSERIAL PRIMARY KEY,
  capture_id        BIGINT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  section_number    TEXT,
  requirement_text  TEXT NOT NULL,
  owner_team        TEXT,
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','complete','waived')),
  evidence_link     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_capture   ON compliance_items(capture_id);
CREATE INDEX IF NOT EXISTS idx_compliance_status    ON compliance_items(status);

-- 1c. action_source + action_status enums + action_items table
DO $$ BEGIN
  CREATE TYPE action_source AS ENUM ('email', 'manual', 'sentinel', 'launchpad');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE action_status AS ENUM ('open', 'done', 'blocked');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS action_items (
  id                    BIGSERIAL PRIMARY KEY,
  ou_tag                ou_tag NOT NULL DEFAULT 'envision',
  title                 TEXT NOT NULL,
  detail                TEXT,
  owner_email           TEXT NOT NULL DEFAULT 'shawn',
  source                action_source NOT NULL DEFAULT 'manual',
  source_id             TEXT,
  due_date              DATE,
  due_inferred_from     TEXT,
  status                action_status NOT NULL DEFAULT 'open',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  linked_record_type    TEXT,
  linked_record_id      BIGINT
);

CREATE INDEX IF NOT EXISTS idx_action_items_status     ON action_items(status);
CREATE INDEX IF NOT EXISTS idx_action_items_owner      ON action_items(owner_email);
CREATE INDEX IF NOT EXISTS idx_action_items_due        ON action_items(due_date) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_action_items_ou_tag     ON action_items(ou_tag);
CREATE INDEX IF NOT EXISTS idx_action_items_source     ON action_items(source);

-- 1d. draft_kind + draft_status enums + action_item_drafts table
DO $$ BEGIN
  CREATE TYPE draft_kind AS ENUM ('reply', 'research', 'milestone');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE draft_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS action_item_drafts (
  id              BIGSERIAL PRIMARY KEY,
  action_item_id  BIGINT NOT NULL REFERENCES action_items(id) ON DELETE CASCADE,
  kind            draft_kind NOT NULL,
  draft_text      TEXT NOT NULL,
  status          draft_status NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drafts_action_item  ON action_item_drafts(action_item_id);
CREATE INDEX IF NOT EXISTS idx_drafts_status       ON action_item_drafts(status);
