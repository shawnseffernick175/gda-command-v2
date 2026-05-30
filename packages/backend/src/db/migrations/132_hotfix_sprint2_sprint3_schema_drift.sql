-- F-107 HOTFIX: Idempotent schema drift fix for Sprint 2 (129) + Sprint 3 (130)
--
-- Root cause: Migration 129 tried to RENAME the legacy opportunities table only
-- when sam_notice_id was absent. On databases where sam_notice_id already existed,
-- the rename was skipped and CREATE TABLE IF NOT EXISTS became a no-op — leaving
-- the old schema in place without ou_tag, grade, grade_evidence, and other Sprint 2
-- columns. This migration adds every missing column, enum, table, and index
-- defined by 129 + 130 using IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so it is
-- safe to re-run on any database state.
--
-- Preserves all existing data. No DROP, RENAME, or RECREATE.

BEGIN;

-- ============================================================
-- 0. Ensure prerequisite enum types exist
-- ============================================================

DO $$ BEGIN
  CREATE TYPE ou_tag AS ENUM ('envision','riverstone','pd_systems','teaming','gda_rollup');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE teaming_flag_reason AS ENUM (
    'hubzone','v3_veteran','ic_clearance','training_depth','scope_overflow','de_confliction'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE color_review_stage AS ENUM ('pink','red','gold','submitted');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE action_source AS ENUM ('email','manual','sentinel','launchpad');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE action_status AS ENUM ('open','done','blocked');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE draft_kind AS ENUM ('reply','research','milestone');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE draft_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- 1. opportunities — add every Sprint 2 column if missing
-- ============================================================

ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS ou_tag                      ou_tag NOT NULL DEFAULT 'envision';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS source                      TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS sam_notice_id               TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS naics                       TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS agency                      TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS sub_agency                  TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS title                       TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS description                 TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS set_aside                   TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS response_due_at             TIMESTAMPTZ;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS posted_at                   TIMESTAMPTZ;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS value_min                   NUMERIC(18,2);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS value_max                   NUMERIC(18,2);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS grade                       TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS grade_evidence              TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS qualified_at                TIMESTAMPTZ;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS qualified_by                TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS is_partner_teaming_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS teaming_partner             ou_tag;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Add CHECK constraint on grade if it doesn't already exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'opportunities_grade_check'
  ) THEN
    BEGIN
      ALTER TABLE opportunities ADD CONSTRAINT opportunities_grade_check CHECK (grade IN ('A','B','C'));
    EXCEPTION WHEN duplicate_object THEN null;
    END;
  END IF;
END $$;

-- Add UNIQUE constraint on sam_notice_id if not already present
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'opportunities'::regclass AND contype = 'u'
      AND conname = 'opportunities_sam_notice_id_key'
  ) THEN
    BEGIN
      ALTER TABLE opportunities ADD CONSTRAINT opportunities_sam_notice_id_key UNIQUE (sam_notice_id);
    EXCEPTION WHEN duplicate_object THEN null;
    END;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_opps_naics        ON opportunities(naics);
CREATE INDEX IF NOT EXISTS idx_opps_agency       ON opportunities(agency);
CREATE INDEX IF NOT EXISTS idx_opps_set_aside    ON opportunities(set_aside);
CREATE INDEX IF NOT EXISTS idx_opps_response_due ON opportunities(response_due_at);
CREATE INDEX IF NOT EXISTS idx_opps_grade        ON opportunities(grade);
CREATE INDEX IF NOT EXISTS idx_opps_qualified    ON opportunities(qualified_at) WHERE qualified_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opps_ou_tag       ON opportunities(ou_tag);

-- ============================================================
-- 2. pipeline_items — create if missing, then ensure columns
-- ============================================================

CREATE TABLE IF NOT EXISTS pipeline_items (
  id                  BIGSERIAL PRIMARY KEY,
  ou_tag              ou_tag NOT NULL DEFAULT 'envision',
  opportunity_id      BIGINT NOT NULL REFERENCES opportunities(id),
  capture_owner       TEXT NOT NULL,
  milestones          JSONB NOT NULL DEFAULT '[]',
  win_prob_pct        INT CHECK (win_prob_pct BETWEEN 0 AND 100),
  win_prob_evidence   TEXT NOT NULL,
  teaming_partners    ou_tag[] NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pipeline_items_qualified_opp CHECK (opportunity_id IS NOT NULL)
);

ALTER TABLE pipeline_items ADD COLUMN IF NOT EXISTS ou_tag            ou_tag NOT NULL DEFAULT 'envision';
ALTER TABLE pipeline_items ADD COLUMN IF NOT EXISTS opportunity_id    BIGINT;
ALTER TABLE pipeline_items ADD COLUMN IF NOT EXISTS capture_owner     TEXT;
ALTER TABLE pipeline_items ADD COLUMN IF NOT EXISTS milestones        JSONB NOT NULL DEFAULT '[]';
ALTER TABLE pipeline_items ADD COLUMN IF NOT EXISTS win_prob_pct      INT;
ALTER TABLE pipeline_items ADD COLUMN IF NOT EXISTS win_prob_evidence TEXT;
ALTER TABLE pipeline_items ADD COLUMN IF NOT EXISTS teaming_partners  ou_tag[] NOT NULL DEFAULT '{}';
ALTER TABLE pipeline_items ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE pipeline_items ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_pipeline_opp    ON pipeline_items(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_owner  ON pipeline_items(capture_owner);
CREATE INDEX IF NOT EXISTS idx_pipeline_ou_tag ON pipeline_items(ou_tag);

-- ============================================================
-- 3. partner_intel_profiles — create if missing, then columns
-- ============================================================

CREATE TABLE IF NOT EXISTS partner_intel_profiles (
  ou_tag          ou_tag PRIMARY KEY,
  last_synced_at  TIMESTAMPTZ,
  certs           JSONB NOT NULL DEFAULT '[]',
  vehicles        JSONB NOT NULL DEFAULT '[]',
  products        JSONB NOT NULL DEFAULT '[]',
  why_track       JSONB NOT NULL DEFAULT '{}'
);

ALTER TABLE partner_intel_profiles ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE partner_intel_profiles ADD COLUMN IF NOT EXISTS certs          JSONB NOT NULL DEFAULT '[]';
ALTER TABLE partner_intel_profiles ADD COLUMN IF NOT EXISTS vehicles       JSONB NOT NULL DEFAULT '[]';
ALTER TABLE partner_intel_profiles ADD COLUMN IF NOT EXISTS products       JSONB NOT NULL DEFAULT '[]';
ALTER TABLE partner_intel_profiles ADD COLUMN IF NOT EXISTS why_track      JSONB NOT NULL DEFAULT '{}';

-- Seed partner profiles (idempotent)
INSERT INTO partner_intel_profiles (ou_tag, last_synced_at, certs, vehicles, products, why_track) VALUES
(
  'riverstone',
  NOW(),
  '[
    {"name":"HUBZone","expiration":null,"status":"active"},
    {"name":"WOSB","expiration":null,"status":"active"},
    {"name":"SDB","expiration":null,"status":"active"},
    {"name":"ISO 9001:2015","expiration":null,"status":"active"},
    {"name":"CMMC RPO","expiration":null,"status":"active"},
    {"name":"CMMI-DEV ML3-aligned","expiration":null,"status":"active"}
  ]',
  '[
    {"name":"GSA MAS","contract_number":"47QTCA20D006F","ceiling":null,"notes":null},
    {"name":"MDA SHIELD IDIQ","contract_number":"HQ085926DF469","ceiling":null,"notes":"Prime. Won 12/2/2025."},
    {"name":"NASA CPSS","contract_number":null,"ceiling":null,"notes":null},
    {"name":"Air Force ABMS","contract_number":null,"ceiling":null,"notes":null},
    {"name":"Army FCoE Ft Sill","contract_number":null,"ceiling":null,"notes":null}
  ]',
  '[
    {"name":"Oxbow Security Platform","description":"TechSIGINT / cyber intelligence platform"},
    {"name":"SecurScale CaaS","description":"Scalable cloud-based security-as-a-service"}
  ]',
  '{"teaming_levers":["HUBZone set-aside unlock","MDA SHIELD IDIQ sub potential ($151B ceiling)","IC access / TechSIGINT depth","classified DevSecOps capacity"],"capacity_notes":"IC customer base: NSA, USCYBERCOM, NRO, IC components, NGA"}'
),
(
  'pd_systems',
  NOW(),
  '[
    {"name":"V3 Veteran","expiration":null,"status":"active"},
    {"name":"ISO 9001:2015","expiration":null,"status":"active"}
  ]',
  '[
    {"name":"Army RS3","contract_number":null,"ceiling":null,"notes":"Shared with Envision"},
    {"name":"EAGLE","contract_number":null,"ceiling":null,"notes":null},
    {"name":"SCOE II","contract_number":null,"ceiling":null,"notes":null},
    {"name":"TSS-E","contract_number":null,"ceiling":null,"notes":null},
    {"name":"63rd RD","contract_number":null,"ceiling":null,"notes":null},
    {"name":"SeaPort-NxG","contract_number":null,"ceiling":null,"notes":null},
    {"name":"GSA FSS","contract_number":null,"ceiling":null,"notes":null}
  ]',
  '[
    {"name":"XR/AR/VR Immersive Training Platform","description":"Digital twin and XR-based training systems"},
    {"name":"LVC Integration Suite","description":"Live, Virtual, Constructive integration for joint training centers"}
  ]',
  '{"teaming_levers":["V3 Veteran cert preference","300+ headcount surge capacity","training/simulation depth (XR/AR/VR, digital twin, LVC)","shared Army RS3 access"],"capacity_notes":"PEO STRI, TRADOC, CASCOM, Joint Training Centers, Special Operations"}'
)
ON CONFLICT (ou_tag) DO NOTHING;

-- ============================================================
-- 4. partner_awards — create if missing, then ensure columns
-- ============================================================

CREATE TABLE IF NOT EXISTS partner_awards (
  id             BIGSERIAL PRIMARY KEY,
  partner_ou_tag ou_tag NOT NULL REFERENCES partner_intel_profiles(ou_tag),
  contract_id    TEXT,
  customer       TEXT,
  value          NUMERIC(18,2),
  awarded_at     TIMESTAMPTZ,
  source         TEXT NOT NULL DEFAULT 'usaspending',
  ingested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE partner_awards ADD COLUMN IF NOT EXISTS partner_ou_tag ou_tag;
ALTER TABLE partner_awards ADD COLUMN IF NOT EXISTS contract_id    TEXT;
ALTER TABLE partner_awards ADD COLUMN IF NOT EXISTS customer       TEXT;
ALTER TABLE partner_awards ADD COLUMN IF NOT EXISTS value          NUMERIC(18,2);
ALTER TABLE partner_awards ADD COLUMN IF NOT EXISTS awarded_at     TIMESTAMPTZ;
ALTER TABLE partner_awards ADD COLUMN IF NOT EXISTS source         TEXT NOT NULL DEFAULT 'usaspending';
ALTER TABLE partner_awards ADD COLUMN IF NOT EXISTS ingested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_awards_dedup ON partner_awards(partner_ou_tag, contract_id) WHERE contract_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_partner_awards_ou   ON partner_awards(partner_ou_tag);
CREATE INDEX IF NOT EXISTS idx_partner_awards_date ON partner_awards(awarded_at DESC);

-- ============================================================
-- 5. partner_news_items — create if missing, then ensure columns
-- ============================================================

CREATE TABLE IF NOT EXISTS partner_news_items (
  id             BIGSERIAL PRIMARY KEY,
  partner_ou_tag ou_tag NOT NULL REFERENCES partner_intel_profiles(ou_tag),
  headline       TEXT NOT NULL,
  url            TEXT,
  source         TEXT,
  published_at   TIMESTAMPTZ,
  ingested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE partner_news_items ADD COLUMN IF NOT EXISTS partner_ou_tag ou_tag;
ALTER TABLE partner_news_items ADD COLUMN IF NOT EXISTS headline       TEXT;
ALTER TABLE partner_news_items ADD COLUMN IF NOT EXISTS url            TEXT;
ALTER TABLE partner_news_items ADD COLUMN IF NOT EXISTS source         TEXT;
ALTER TABLE partner_news_items ADD COLUMN IF NOT EXISTS published_at   TIMESTAMPTZ;
ALTER TABLE partner_news_items ADD COLUMN IF NOT EXISTS ingested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_news_dedup ON partner_news_items(partner_ou_tag, url) WHERE url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_partner_news_ou  ON partner_news_items(partner_ou_tag);
CREATE INDEX IF NOT EXISTS idx_partner_news_pub ON partner_news_items(published_at DESC);

-- ============================================================
-- 6. teaming_flags — create if missing, then ensure columns
-- ============================================================

CREATE TABLE IF NOT EXISTS teaming_flags (
  id                  BIGSERIAL PRIMARY KEY,
  opportunity_id      BIGINT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  suggested_partner   ou_tag NOT NULL REFERENCES partner_intel_profiles(ou_tag),
  reason              teaming_flag_reason NOT NULL,
  detail              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE teaming_flags ADD COLUMN IF NOT EXISTS opportunity_id    BIGINT;
ALTER TABLE teaming_flags ADD COLUMN IF NOT EXISTS suggested_partner ou_tag;
ALTER TABLE teaming_flags ADD COLUMN IF NOT EXISTS reason            teaming_flag_reason;
ALTER TABLE teaming_flags ADD COLUMN IF NOT EXISTS detail            TEXT;
ALTER TABLE teaming_flags ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_teaming_flags_opp     ON teaming_flags(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_teaming_flags_partner ON teaming_flags(suggested_partner);

-- ============================================================
-- 7. captures — create if missing, then ensure columns
-- ============================================================

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

ALTER TABLE captures ADD COLUMN IF NOT EXISTS ou_tag             ou_tag NOT NULL DEFAULT 'envision';
ALTER TABLE captures ADD COLUMN IF NOT EXISTS pipeline_item_id   BIGINT;
ALTER TABLE captures ADD COLUMN IF NOT EXISTS rfp_uploaded_at    TIMESTAMPTZ;
ALTER TABLE captures ADD COLUMN IF NOT EXISTS rfp_storage_url    TEXT;
ALTER TABLE captures ADD COLUMN IF NOT EXISTS compliance_matrix  JSONB NOT NULL DEFAULT '[]';
ALTER TABLE captures ADD COLUMN IF NOT EXISTS color_review_stage color_review_stage NOT NULL DEFAULT 'pink';
ALTER TABLE captures ADD COLUMN IF NOT EXISTS color_review_notes TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE captures ADD COLUMN IF NOT EXISTS pricing_assumptions JSONB NOT NULL DEFAULT '{}';
ALTER TABLE captures ADD COLUMN IF NOT EXISTS teaming_worksheet  JSONB NOT NULL DEFAULT '{}';
ALTER TABLE captures ADD COLUMN IF NOT EXISTS created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE captures ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_captures_pipeline ON captures(pipeline_item_id);
CREATE INDEX IF NOT EXISTS idx_captures_stage    ON captures(color_review_stage);
CREATE INDEX IF NOT EXISTS idx_captures_ou_tag   ON captures(ou_tag);

-- ============================================================
-- 8. compliance_items — create if missing, then ensure columns
-- ============================================================

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

ALTER TABLE compliance_items ADD COLUMN IF NOT EXISTS capture_id       BIGINT;
ALTER TABLE compliance_items ADD COLUMN IF NOT EXISTS section_number   TEXT;
ALTER TABLE compliance_items ADD COLUMN IF NOT EXISTS requirement_text TEXT;
ALTER TABLE compliance_items ADD COLUMN IF NOT EXISTS owner_team       TEXT;
ALTER TABLE compliance_items ADD COLUMN IF NOT EXISTS status           TEXT NOT NULL DEFAULT 'open';
ALTER TABLE compliance_items ADD COLUMN IF NOT EXISTS evidence_link    TEXT;
ALTER TABLE compliance_items ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE compliance_items ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_compliance_capture ON compliance_items(capture_id);
CREATE INDEX IF NOT EXISTS idx_compliance_status  ON compliance_items(status);

-- ============================================================
-- 9. action_items — create if missing, then ensure columns
-- ============================================================

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

ALTER TABLE action_items ADD COLUMN IF NOT EXISTS ou_tag             ou_tag NOT NULL DEFAULT 'envision';
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS title              TEXT;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS detail             TEXT;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS owner_email        TEXT NOT NULL DEFAULT 'shawn';
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS source             action_source NOT NULL DEFAULT 'manual';
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS source_id          TEXT;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS due_date           DATE;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS due_inferred_from  TEXT;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS status             action_status NOT NULL DEFAULT 'open';
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS completed_at       TIMESTAMPTZ;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS linked_record_type TEXT;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS linked_record_id   BIGINT;

CREATE INDEX IF NOT EXISTS idx_action_items_status ON action_items(status);
CREATE INDEX IF NOT EXISTS idx_action_items_owner  ON action_items(owner_email);
CREATE INDEX IF NOT EXISTS idx_action_items_due    ON action_items(due_date) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_action_items_ou_tag ON action_items(ou_tag);
CREATE INDEX IF NOT EXISTS idx_action_items_source ON action_items(source);

-- ============================================================
-- 10. action_item_drafts — create if missing, then columns
-- ============================================================

CREATE TABLE IF NOT EXISTS action_item_drafts (
  id              BIGSERIAL PRIMARY KEY,
  action_item_id  BIGINT NOT NULL REFERENCES action_items(id) ON DELETE CASCADE,
  kind            draft_kind NOT NULL,
  draft_text      TEXT NOT NULL,
  status          draft_status NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE action_item_drafts ADD COLUMN IF NOT EXISTS action_item_id BIGINT;
ALTER TABLE action_item_drafts ADD COLUMN IF NOT EXISTS kind           draft_kind;
ALTER TABLE action_item_drafts ADD COLUMN IF NOT EXISTS draft_text     TEXT;
ALTER TABLE action_item_drafts ADD COLUMN IF NOT EXISTS status         draft_status NOT NULL DEFAULT 'pending';
ALTER TABLE action_item_drafts ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_drafts_action_item ON action_item_drafts(action_item_id);
CREATE INDEX IF NOT EXISTS idx_drafts_status      ON action_item_drafts(status);

COMMIT;
