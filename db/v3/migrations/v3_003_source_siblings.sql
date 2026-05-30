-- V3 Migration 003: R1 source sibling join tables
-- Per-field source tracking for analysis-bearing fields (F-202 OpenAPI spec).
-- Each join table links a parent record + field to one or more sources.
-- Forward-only. No IF NOT EXISTS guards.

BEGIN;

-- ============================================================================
-- Opportunity analysis source siblings (Analysis schema fields)
-- ============================================================================

CREATE TABLE opportunity_analysis_pwin_sources (
  id                      BIGSERIAL   PRIMARY KEY,
  opportunity_analysis_id BIGINT      NOT NULL REFERENCES opportunity_analysis_cache(id) ON DELETE CASCADE,
  source_id               BIGINT      NOT NULL REFERENCES sources(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_analysis_id, source_id)
);
CREATE INDEX idx_oap_sources_analysis ON opportunity_analysis_pwin_sources (opportunity_analysis_id);

CREATE TABLE opportunity_analysis_incumbent_sources (
  id                      BIGSERIAL   PRIMARY KEY,
  opportunity_analysis_id BIGINT      NOT NULL REFERENCES opportunity_analysis_cache(id) ON DELETE CASCADE,
  source_id               BIGINT      NOT NULL REFERENCES sources(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_analysis_id, source_id)
);
CREATE INDEX idx_oai_sources_analysis ON opportunity_analysis_incumbent_sources (opportunity_analysis_id);

CREATE TABLE opportunity_analysis_competitors_sources (
  id                      BIGSERIAL   PRIMARY KEY,
  opportunity_analysis_id BIGINT      NOT NULL REFERENCES opportunity_analysis_cache(id) ON DELETE CASCADE,
  source_id               BIGINT      NOT NULL REFERENCES sources(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_analysis_id, source_id)
);
CREATE INDEX idx_oac_sources_analysis ON opportunity_analysis_competitors_sources (opportunity_analysis_id);

CREATE TABLE opportunity_analysis_blackhat_sources (
  id                      BIGSERIAL   PRIMARY KEY,
  opportunity_analysis_id BIGINT      NOT NULL REFERENCES opportunity_analysis_cache(id) ON DELETE CASCADE,
  source_id               BIGINT      NOT NULL REFERENCES sources(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_analysis_id, source_id)
);
CREATE INDEX idx_oab_sources_analysis ON opportunity_analysis_blackhat_sources (opportunity_analysis_id);

CREATE TABLE opportunity_analysis_wargame_sources (
  id                      BIGSERIAL   PRIMARY KEY,
  opportunity_analysis_id BIGINT      NOT NULL REFERENCES opportunity_analysis_cache(id) ON DELETE CASCADE,
  source_id               BIGINT      NOT NULL REFERENCES sources(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_analysis_id, source_id)
);
CREATE INDEX idx_oaw_sources_analysis ON opportunity_analysis_wargame_sources (opportunity_analysis_id);

CREATE TABLE opportunity_analysis_timeline_sources (
  id                      BIGSERIAL   PRIMARY KEY,
  opportunity_analysis_id BIGINT      NOT NULL REFERENCES opportunity_analysis_cache(id) ON DELETE CASCADE,
  source_id               BIGINT      NOT NULL REFERENCES sources(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_analysis_id, source_id)
);
CREATE INDEX idx_oat_sources_analysis ON opportunity_analysis_timeline_sources (opportunity_analysis_id);

-- ============================================================================
-- Capture analysis source siblings
-- ============================================================================

CREATE TABLE capture_analysis_pwin_sources (
  id                    BIGSERIAL   PRIMARY KEY,
  capture_analysis_id   BIGINT      NOT NULL REFERENCES capture_analysis_cache(id) ON DELETE CASCADE,
  source_id             BIGINT      NOT NULL REFERENCES sources(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (capture_analysis_id, source_id)
);
CREATE INDEX idx_cap_sources_analysis ON capture_analysis_pwin_sources (capture_analysis_id);

-- ============================================================================
-- Opportunity data field source siblings (per F-202 OpenAPI)
-- ============================================================================

CREATE TABLE opportunity_title_sources (
  id              BIGSERIAL   PRIMARY KEY,
  opportunity_id  BIGINT      NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  source_id       BIGINT      NOT NULL REFERENCES sources(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_id, source_id)
);
CREATE INDEX idx_ots_opp ON opportunity_title_sources (opportunity_id);

CREATE TABLE opportunity_agency_sources (
  id              BIGSERIAL   PRIMARY KEY,
  opportunity_id  BIGINT      NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  source_id       BIGINT      NOT NULL REFERENCES sources(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_id, source_id)
);
CREATE INDEX idx_oas_opp ON opportunity_agency_sources (opportunity_id);

CREATE TABLE opportunity_naics_sources (
  id              BIGSERIAL   PRIMARY KEY,
  opportunity_id  BIGINT      NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  source_id       BIGINT      NOT NULL REFERENCES sources(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_id, source_id)
);
CREATE INDEX idx_ons_opp ON opportunity_naics_sources (opportunity_id);

CREATE TABLE opportunity_set_aside_sources (
  id              BIGSERIAL   PRIMARY KEY,
  opportunity_id  BIGINT      NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  source_id       BIGINT      NOT NULL REFERENCES sources(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_id, source_id)
);
CREATE INDEX idx_osas_opp ON opportunity_set_aside_sources (opportunity_id);

CREATE TABLE opportunity_grade_sources (
  id              BIGSERIAL   PRIMARY KEY,
  opportunity_id  BIGINT      NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  source_id       BIGINT      NOT NULL REFERENCES sources(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_id, source_id)
);
CREATE INDEX idx_ogs_opp ON opportunity_grade_sources (opportunity_id);

CREATE TABLE opportunity_response_due_at_sources (
  id              BIGSERIAL   PRIMARY KEY,
  opportunity_id  BIGINT      NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  source_id       BIGINT      NOT NULL REFERENCES sources(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_id, source_id)
);
CREATE INDEX idx_ordas_opp ON opportunity_response_due_at_sources (opportunity_id);

CREATE TABLE opportunity_value_min_sources (
  id              BIGSERIAL   PRIMARY KEY,
  opportunity_id  BIGINT      NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  source_id       BIGINT      NOT NULL REFERENCES sources(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_id, source_id)
);
CREATE INDEX idx_ovmins_opp ON opportunity_value_min_sources (opportunity_id);

CREATE TABLE opportunity_value_max_sources (
  id              BIGSERIAL   PRIMARY KEY,
  opportunity_id  BIGINT      NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  source_id       BIGINT      NOT NULL REFERENCES sources(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_id, source_id)
);
CREATE INDEX idx_ovmaxs_opp ON opportunity_value_max_sources (opportunity_id);

CREATE TABLE opportunity_description_sources (
  id              BIGSERIAL   PRIMARY KEY,
  opportunity_id  BIGINT      NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  source_id       BIGINT      NOT NULL REFERENCES sources(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_id, source_id)
);
CREATE INDEX idx_ods_opp ON opportunity_description_sources (opportunity_id);

COMMIT;
