-- F-101 Sprint 2: Opportunities + Pipeline + Partner Intel tables
-- Depends on: 127_ou_registry_launchpad_flags.sql (ou_tag enum)

-- Rename legacy opportunities table to avoid collision with Sprint 2 schema
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'opportunities' AND table_schema = 'public') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'opportunities' AND column_name = 'sam_notice_id') THEN
      ALTER TABLE opportunities RENAME TO opportunities_legacy;
    END IF;
  END IF;
END $$;

-- 1a. opportunities table (Sprint 2 schema)
CREATE TABLE IF NOT EXISTS opportunities (
  id                          BIGSERIAL PRIMARY KEY,
  ou_tag                      ou_tag NOT NULL DEFAULT 'envision',
  source                      TEXT NOT NULL,
  sam_notice_id               TEXT UNIQUE,
  naics                       TEXT,
  agency                      TEXT,
  sub_agency                  TEXT,
  title                       TEXT NOT NULL,
  description                 TEXT,
  set_aside                   TEXT,
  response_due_at             TIMESTAMPTZ,
  posted_at                   TIMESTAMPTZ,
  value_min                   NUMERIC(18,2),
  value_max                   NUMERIC(18,2),
  grade                       TEXT CHECK (grade IN ('A','B','C')),
  grade_evidence              TEXT,
  qualified_at                TIMESTAMPTZ,
  qualified_by                TEXT,
  is_partner_teaming_required BOOLEAN NOT NULL DEFAULT FALSE,
  teaming_partner             ou_tag,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opps_naics          ON opportunities(naics);
CREATE INDEX IF NOT EXISTS idx_opps_agency         ON opportunities(agency);
CREATE INDEX IF NOT EXISTS idx_opps_set_aside      ON opportunities(set_aside);
CREATE INDEX IF NOT EXISTS idx_opps_response_due   ON opportunities(response_due_at);
CREATE INDEX IF NOT EXISTS idx_opps_grade          ON opportunities(grade);
CREATE INDEX IF NOT EXISTS idx_opps_qualified      ON opportunities(qualified_at) WHERE qualified_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opps_ou_tag         ON opportunities(ou_tag);

-- 1b. pipeline_items table
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

CREATE INDEX IF NOT EXISTS idx_pipeline_opp        ON pipeline_items(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_owner      ON pipeline_items(capture_owner);
CREATE INDEX IF NOT EXISTS idx_pipeline_ou_tag     ON pipeline_items(ou_tag);

-- 1c. partner_intel_profiles table
CREATE TABLE IF NOT EXISTS partner_intel_profiles (
  ou_tag          ou_tag PRIMARY KEY,
  last_synced_at  TIMESTAMPTZ,
  certs           JSONB NOT NULL DEFAULT '[]',
  vehicles        JSONB NOT NULL DEFAULT '[]',
  products        JSONB NOT NULL DEFAULT '[]',
  why_track       JSONB NOT NULL DEFAULT '{}'
);

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

-- 1d. partner_awards table
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_awards_dedup ON partner_awards(partner_ou_tag, contract_id) WHERE contract_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_partner_awards_ou    ON partner_awards(partner_ou_tag);
CREATE INDEX IF NOT EXISTS idx_partner_awards_date  ON partner_awards(awarded_at DESC);

-- 1e. partner_news_items table
CREATE TABLE IF NOT EXISTS partner_news_items (
  id             BIGSERIAL PRIMARY KEY,
  partner_ou_tag ou_tag NOT NULL REFERENCES partner_intel_profiles(ou_tag),
  headline       TEXT NOT NULL,
  url            TEXT,
  source         TEXT,
  published_at   TIMESTAMPTZ,
  ingested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_news_dedup ON partner_news_items(partner_ou_tag, url) WHERE url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_partner_news_ou      ON partner_news_items(partner_ou_tag);
CREATE INDEX IF NOT EXISTS idx_partner_news_pub     ON partner_news_items(published_at DESC);

-- 1f. teaming_flags table
DO $$ BEGIN
  CREATE TYPE teaming_flag_reason AS ENUM (
    'hubzone',
    'v3_veteran',
    'ic_clearance',
    'training_depth',
    'scope_overflow',
    'de_confliction'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS teaming_flags (
  id                  BIGSERIAL PRIMARY KEY,
  opportunity_id      BIGINT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  suggested_partner   ou_tag NOT NULL REFERENCES partner_intel_profiles(ou_tag),
  reason              teaming_flag_reason NOT NULL,
  detail              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teaming_flags_opp    ON teaming_flags(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_teaming_flags_partner ON teaming_flags(suggested_partner);
