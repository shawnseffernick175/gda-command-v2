-- V3 Migration 011: Awards table + per-field source tables (F-241)
-- Creates the awards table for FPDS contract award records,
-- per-field source citation tables (R1 compliant), and
-- seeds the FPDS source row.
-- Forward-only. No IF NOT EXISTS guards.

BEGIN;

-- ============================================================================
-- 11.1  awards — FPDS contract award records
-- ============================================================================
CREATE TABLE awards (
  id                            BIGSERIAL       PRIMARY KEY,
  piid                          TEXT            NOT NULL,
  agency_id                     TEXT,
  agency_name                   TEXT,
  contracting_office            TEXT,
  awardee_name                  TEXT,
  awardee_uei                   TEXT,
  awardee_duns                  TEXT,
  value_obligated               NUMERIC,
  value_base_and_all_options    NUMERIC,
  naics                         TEXT,
  psc                           TEXT,
  set_aside                     TEXT,
  place_of_performance_state    TEXT,
  place_of_performance_country  TEXT,
  award_date                    DATE,
  last_mod_date                 DATE,
  contract_type                 TEXT,
  parent_award_id               TEXT,
  sam_notice_id                 TEXT,
  data_source                   TEXT            NOT NULL DEFAULT 'fpds.gov',
  source_id                     BIGINT          NOT NULL REFERENCES sources(id),
  fpds_url                      TEXT,
  created_at                    TIMESTAMPTZ     DEFAULT now(),
  updated_at                    TIMESTAMPTZ     DEFAULT now()
);

CREATE UNIQUE INDEX awards_piid_modnum_unique ON awards(piid, last_mod_date) NULLS NOT DISTINCT;
CREATE INDEX awards_awardee_uei_idx ON awards(awardee_uei);
CREATE INDEX awards_naics_idx ON awards(naics);
CREATE INDEX awards_award_date_idx ON awards(award_date DESC);
CREATE INDEX awards_sam_notice_idx ON awards(sam_notice_id) WHERE sam_notice_id IS NOT NULL;

-- ============================================================================
-- 11.2  Per-field source tables — R1 compliant citations for awards
-- ============================================================================

-- award_awardee_sources
CREATE TABLE award_awardee_sources (
  id          BIGSERIAL     PRIMARY KEY,
  award_id    BIGINT        NOT NULL REFERENCES awards(id) ON DELETE CASCADE,
  source_id   BIGINT        NOT NULL REFERENCES sources(id),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (award_id, source_id)
);
CREATE INDEX idx_aas_award ON award_awardee_sources (award_id);

-- award_value_sources
CREATE TABLE award_value_sources (
  id          BIGSERIAL     PRIMARY KEY,
  award_id    BIGINT        NOT NULL REFERENCES awards(id) ON DELETE CASCADE,
  source_id   BIGINT        NOT NULL REFERENCES sources(id),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (award_id, source_id)
);
CREATE INDEX idx_avs_award ON award_value_sources (award_id);

-- award_naics_sources
CREATE TABLE award_naics_sources (
  id          BIGSERIAL     PRIMARY KEY,
  award_id    BIGINT        NOT NULL REFERENCES awards(id) ON DELETE CASCADE,
  source_id   BIGINT        NOT NULL REFERENCES sources(id),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (award_id, source_id)
);
CREATE INDEX idx_ans_award ON award_naics_sources (award_id);

-- award_award_date_sources
CREATE TABLE award_award_date_sources (
  id          BIGSERIAL     PRIMARY KEY,
  award_id    BIGINT        NOT NULL REFERENCES awards(id) ON DELETE CASCADE,
  source_id   BIGINT        NOT NULL REFERENCES sources(id),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (award_id, source_id)
);
CREATE INDEX idx_aads_award ON award_award_date_sources (award_id);

-- award_agency_sources
CREATE TABLE award_agency_sources (
  id          BIGSERIAL     PRIMARY KEY,
  award_id    BIGINT        NOT NULL REFERENCES awards(id) ON DELETE CASCADE,
  source_id   BIGINT        NOT NULL REFERENCES sources(id),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (award_id, source_id)
);
CREATE INDEX idx_aags_award ON award_agency_sources (award_id);

COMMIT;
