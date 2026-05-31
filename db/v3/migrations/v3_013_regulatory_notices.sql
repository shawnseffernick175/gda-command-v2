-- V3 Migration 013: Regulatory notices table + per-field source tables (F-242)
-- Creates the regulatory_notices table for Federal Register ingest,
-- per-field source citation tables (R1 compliant), seeds the
-- federalregister.gov source row, and extends the sources.kind CHECK.
-- Forward-only.

BEGIN;

-- ============================================================================
-- 13.1  regulatory_notices — Federal Register regulatory/acquisition records
-- ============================================================================
CREATE TABLE regulatory_notices (
  id                              BIGSERIAL       PRIMARY KEY,
  document_number                 TEXT            NOT NULL UNIQUE,
  title                           TEXT            NOT NULL,
  abstract                        TEXT,
  document_type                   TEXT,
  agency_names                    TEXT[],
  publication_date                DATE            NOT NULL,
  effective_date                  DATE,
  comments_close_date             DATE,
  cfr_references                  TEXT[],
  topics                          TEXT[],
  html_url                        TEXT            NOT NULL,
  pdf_url                         TEXT,
  regulations_dot_gov_docket_id   TEXT,
  significant                     BOOLEAN         DEFAULT false,
  data_source                     TEXT            NOT NULL DEFAULT 'federalregister.gov',
  source_id                       BIGINT          NOT NULL REFERENCES sources(id),
  created_at                      TIMESTAMPTZ     DEFAULT now(),
  updated_at                      TIMESTAMPTZ     DEFAULT now()
);

CREATE INDEX regulatory_notices_pub_date_idx ON regulatory_notices(publication_date DESC);
CREATE INDEX regulatory_notices_effective_date_idx ON regulatory_notices(effective_date) WHERE effective_date IS NOT NULL;
CREATE INDEX regulatory_notices_comments_close_idx ON regulatory_notices(comments_close_date) WHERE comments_close_date IS NOT NULL;
CREATE INDEX regulatory_notices_agencies_idx ON regulatory_notices USING GIN(agency_names);
CREATE INDEX regulatory_notices_topics_idx ON regulatory_notices USING GIN(topics);
CREATE INDEX regulatory_notices_cfr_idx ON regulatory_notices USING GIN(cfr_references);

-- ============================================================================
-- 13.2  Per-field source tables — R1 compliant citations for regulatory notices
-- ============================================================================

-- regulatory_notice_title_sources
CREATE TABLE regulatory_notice_title_sources (
  id                    BIGSERIAL     PRIMARY KEY,
  regulatory_notice_id  BIGINT        NOT NULL REFERENCES regulatory_notices(id) ON DELETE CASCADE,
  source_id             BIGINT        NOT NULL REFERENCES sources(id),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (regulatory_notice_id, source_id)
);
CREATE INDEX idx_rnts_notice ON regulatory_notice_title_sources (regulatory_notice_id);

-- regulatory_notice_agency_sources
CREATE TABLE regulatory_notice_agency_sources (
  id                    BIGSERIAL     PRIMARY KEY,
  regulatory_notice_id  BIGINT        NOT NULL REFERENCES regulatory_notices(id) ON DELETE CASCADE,
  source_id             BIGINT        NOT NULL REFERENCES sources(id),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (regulatory_notice_id, source_id)
);
CREATE INDEX idx_rnas_notice ON regulatory_notice_agency_sources (regulatory_notice_id);

-- regulatory_notice_effective_date_sources
CREATE TABLE regulatory_notice_effective_date_sources (
  id                    BIGSERIAL     PRIMARY KEY,
  regulatory_notice_id  BIGINT        NOT NULL REFERENCES regulatory_notices(id) ON DELETE CASCADE,
  source_id             BIGINT        NOT NULL REFERENCES sources(id),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (regulatory_notice_id, source_id)
);
CREATE INDEX idx_rneds_notice ON regulatory_notice_effective_date_sources (regulatory_notice_id);

-- regulatory_notice_comments_close_sources
CREATE TABLE regulatory_notice_comments_close_sources (
  id                    BIGSERIAL     PRIMARY KEY,
  regulatory_notice_id  BIGINT        NOT NULL REFERENCES regulatory_notices(id) ON DELETE CASCADE,
  source_id             BIGINT        NOT NULL REFERENCES sources(id),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (regulatory_notice_id, source_id)
);
CREATE INDEX idx_rnccs_notice ON regulatory_notice_comments_close_sources (regulatory_notice_id);

-- ============================================================================
-- 13.3  Extend sources.kind CHECK to include federal_register
-- ============================================================================
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_kind_check;
ALTER TABLE sources ADD CONSTRAINT sources_kind_check CHECK (kind IN (
  'sam_gov', 'fpds', 'usaspending', 'govwin',
  'govtribe', 'news', 'doctrine', 'partner_site',
  'internal', 'manual', 'n8n_workflow',
  'dibbs', 'neco', 'federal_register'
));

COMMIT;
