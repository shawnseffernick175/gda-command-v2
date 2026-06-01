-- V3 Migration 014: SBIR/STTR awards + open topics ingest (F-244)
-- Creates sbir_awards (historical award records) and sbir_topics (open/pre-release
-- opportunities) tables, per-field source citation tables (R1 compliant), extends
-- sources_kind_check, and seeds the SBIR.gov source row.
-- Forward-only.

BEGIN;

-- ============================================================================
-- 14.1  sbir_awards — historical + recent SBIR/STTR awards
-- ============================================================================
CREATE TABLE sbir_awards (
  id                    BIGSERIAL       PRIMARY KEY,
  award_number          TEXT            NOT NULL UNIQUE,
  program               TEXT            NOT NULL,
  phase                 TEXT            NOT NULL,
  award_year            INT             NOT NULL,
  agency                TEXT            NOT NULL,
  branch                TEXT,
  awardee_name          TEXT            NOT NULL,
  awardee_uei           TEXT,
  awardee_duns          TEXT,
  awardee_city          TEXT,
  awardee_state         TEXT,
  awardee_zip           TEXT,
  pi_name               TEXT,
  research_institution  TEXT,
  title                 TEXT            NOT NULL,
  abstract              TEXT,
  award_amount          NUMERIC,
  contract_number       TEXT,
  proposal_number       TEXT,
  topic_code            TEXT,
  solicitation_number   TEXT,
  award_start_date      DATE,
  award_end_date        DATE,
  sbir_url              TEXT,
  data_source           TEXT            NOT NULL DEFAULT 'sbir.gov',
  source_id             BIGINT          NOT NULL REFERENCES sources(id),
  created_at            TIMESTAMPTZ     DEFAULT now(),
  updated_at            TIMESTAMPTZ     DEFAULT now()
);

CREATE INDEX sbir_awards_awardee_uei_idx ON sbir_awards(awardee_uei);
CREATE INDEX sbir_awards_phase_idx ON sbir_awards(phase);
CREATE INDEX sbir_awards_branch_idx ON sbir_awards(branch);
CREATE INDEX sbir_awards_topic_code_idx ON sbir_awards(topic_code);
CREATE INDEX sbir_awards_year_idx ON sbir_awards(award_year DESC);

-- ============================================================================
-- 14.2  sbir_topics — open / pre-release SBIR/STTR topics (opportunities)
-- ============================================================================
CREATE TABLE sbir_topics (
  id                    BIGSERIAL       PRIMARY KEY,
  topic_code            TEXT            NOT NULL,
  solicitation_number   TEXT            NOT NULL,
  program               TEXT            NOT NULL,
  phase                 TEXT            NOT NULL,
  agency                TEXT            NOT NULL,
  branch                TEXT,
  title                 TEXT            NOT NULL,
  description           TEXT,
  technology_areas      TEXT[],
  open_date             DATE,
  close_date            DATE,
  pre_release_date      DATE,
  topic_url             TEXT            NOT NULL,
  status                TEXT,
  data_source           TEXT            NOT NULL DEFAULT 'sbir.gov',
  source_id             BIGINT          NOT NULL REFERENCES sources(id),
  created_at            TIMESTAMPTZ     DEFAULT now(),
  updated_at            TIMESTAMPTZ     DEFAULT now(),
  UNIQUE(topic_code, solicitation_number)
);

CREATE INDEX sbir_topics_status_idx ON sbir_topics(status);
CREATE INDEX sbir_topics_close_date_idx ON sbir_topics(close_date) WHERE close_date IS NOT NULL;
CREATE INDEX sbir_topics_branch_idx ON sbir_topics(branch);

-- ============================================================================
-- 14.3  Per-field source tables — R1 compliant citations
-- ============================================================================

-- sbir_award_awardee_sources
CREATE TABLE sbir_award_awardee_sources (
  id          BIGSERIAL     PRIMARY KEY,
  sbir_award_id BIGINT      NOT NULL REFERENCES sbir_awards(id) ON DELETE CASCADE,
  source_id   BIGINT        NOT NULL REFERENCES sources(id),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (sbir_award_id, source_id)
);
CREATE INDEX idx_saas_award ON sbir_award_awardee_sources (sbir_award_id);

-- sbir_award_amount_sources
CREATE TABLE sbir_award_amount_sources (
  id          BIGSERIAL     PRIMARY KEY,
  sbir_award_id BIGINT      NOT NULL REFERENCES sbir_awards(id) ON DELETE CASCADE,
  source_id   BIGINT        NOT NULL REFERENCES sources(id),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (sbir_award_id, source_id)
);
CREATE INDEX idx_sams_award ON sbir_award_amount_sources (sbir_award_id);

-- sbir_award_topic_sources
CREATE TABLE sbir_award_topic_sources (
  id          BIGSERIAL     PRIMARY KEY,
  sbir_award_id BIGINT      NOT NULL REFERENCES sbir_awards(id) ON DELETE CASCADE,
  source_id   BIGINT        NOT NULL REFERENCES sources(id),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (sbir_award_id, source_id)
);
CREATE INDEX idx_sats_award ON sbir_award_topic_sources (sbir_award_id);

-- sbir_topic_title_sources
CREATE TABLE sbir_topic_title_sources (
  id          BIGSERIAL     PRIMARY KEY,
  sbir_topic_id BIGINT      NOT NULL REFERENCES sbir_topics(id) ON DELETE CASCADE,
  source_id   BIGINT        NOT NULL REFERENCES sources(id),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (sbir_topic_id, source_id)
);
CREATE INDEX idx_stts_topic ON sbir_topic_title_sources (sbir_topic_id);

-- sbir_topic_close_date_sources
CREATE TABLE sbir_topic_close_date_sources (
  id          BIGSERIAL     PRIMARY KEY,
  sbir_topic_id BIGINT      NOT NULL REFERENCES sbir_topics(id) ON DELETE CASCADE,
  source_id   BIGINT        NOT NULL REFERENCES sources(id),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (sbir_topic_id, source_id)
);
CREATE INDEX idx_stcds_topic ON sbir_topic_close_date_sources (sbir_topic_id);

-- ============================================================================
-- 14.4  Extend sources.kind CHECK to include 'sbir'
-- ============================================================================
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_kind_check;
ALTER TABLE sources ADD CONSTRAINT sources_kind_check CHECK (kind IN (
  'sam_gov', 'fpds', 'usaspending', 'govwin',
  'govtribe', 'news', 'doctrine', 'partner_site',
  'internal', 'manual', 'n8n_workflow',
  'dibbs', 'neco', 'sbir'
));

COMMIT;
