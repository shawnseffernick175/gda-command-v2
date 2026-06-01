-- V3 Migration 017: GovTribe Connector (F-Govtribe)
--
-- Creates govtribe_cache, govtribe_credit_ledger, govtribe_credit_monthly
-- tables per V3 schema spec. Adds source_uri + govtribe_id columns to
-- opportunities for deep-link and dedup support.
-- Forward-only.

BEGIN;

-- ============================================================================
-- govtribe_cache — raw API response cache, keyed by endpoint + entity id
-- ============================================================================
CREATE TABLE IF NOT EXISTS govtribe_cache (
  id              BIGSERIAL     PRIMARY KEY,
  endpoint        TEXT          NOT NULL,
  entity_id       TEXT          NOT NULL,
  response_body   JSONB         NOT NULL DEFAULT '{}',
  evidence_grade  TEXT          DEFAULT 'B',
  last_error      TEXT,
  fetched_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ   NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS govtribe_cache_endpoint_entity
  ON govtribe_cache (endpoint, entity_id);
CREATE INDEX IF NOT EXISTS idx_govtribe_cache_expires
  ON govtribe_cache (expires_at);

-- ============================================================================
-- govtribe_credit_ledger — per-call credit cost log
-- ============================================================================
CREATE TABLE IF NOT EXISTS govtribe_credit_ledger (
  id              BIGSERIAL     PRIMARY KEY,
  request_id      UUID          DEFAULT gen_random_uuid(),
  endpoint        TEXT          NOT NULL,
  cost_credits    INTEGER       NOT NULL DEFAULT 1,
  decision        TEXT          NOT NULL DEFAULT 'called'
                                CHECK (decision IN ('called', 'skipped_low_budget', 'skipped_halted', 'cached')),
  response_status INTEGER,
  error_text      TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_govtribe_ledger_created
  ON govtribe_credit_ledger (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_govtribe_ledger_endpoint
  ON govtribe_credit_ledger (endpoint);

-- ============================================================================
-- govtribe_credit_monthly — aggregated monthly credit burn
-- ============================================================================
CREATE TABLE IF NOT EXISTS govtribe_credit_monthly (
  id              BIGSERIAL     PRIMARY KEY,
  month           TEXT          NOT NULL UNIQUE,
  credits_used    INTEGER       NOT NULL DEFAULT 0,
  credits_budget  INTEGER       NOT NULL DEFAULT 5000,
  last_call_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- opportunities — add source_uri + govtribe_id for GovTribe deep-links & dedup
-- ============================================================================
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS source_uri TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS govtribe_id TEXT;

CREATE INDEX IF NOT EXISTS idx_opps_govtribe_id
  ON opportunities (govtribe_id) WHERE govtribe_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opps_source_uri
  ON opportunities (source_uri) WHERE source_uri IS NOT NULL;

-- ============================================================================
-- feature flag row for govtribe_connector_v1
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
VALUES ('govtribe_connector_v1', TRUE, 'F-Govtribe: GovTribe Connector with credit-budget awareness')
ON CONFLICT (flag_name) DO NOTHING;

COMMIT;
