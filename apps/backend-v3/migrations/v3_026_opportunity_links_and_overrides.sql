-- V3 Migration 022: Opportunity links, field overrides, and merge cache (F-405)
--
-- opportunity_links — joins an opportunity (internal_id) to its source records
-- opportunity_field_overrides — human edits that override all source data
-- merged_opportunity_cache — 60s TTL cache for the merged view
-- Forward-only.

BEGIN;

-- ============================================================================
-- opportunity_links — links an opportunity to source-specific records
-- ============================================================================
CREATE TABLE IF NOT EXISTS opportunity_links (
  id              BIGSERIAL     PRIMARY KEY,
  opportunity_id  BIGINT        NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  source_type     TEXT          NOT NULL
                                CHECK (source_type IN (
                                  'govwin', 'sam', 'govtribe', 'fast_track'
                                )),
  source_record_id TEXT         NOT NULL,
  snapshot        JSONB         NOT NULL DEFAULT '{}',
  linked_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_id, source_type, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_opp_links_opp_id
  ON opportunity_links (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opp_links_source
  ON opportunity_links (source_type, source_record_id);

-- ============================================================================
-- opportunity_field_overrides — human edits beat all source data
-- ============================================================================
CREATE TABLE IF NOT EXISTS opportunity_field_overrides (
  id              BIGSERIAL     PRIMARY KEY,
  opportunity_id  BIGINT        NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  field_name      TEXT          NOT NULL,
  field_value     TEXT,
  set_by          TEXT          NOT NULL DEFAULT 'manual',
  set_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_id, field_name)
);

CREATE INDEX IF NOT EXISTS idx_opp_overrides_opp_id
  ON opportunity_field_overrides (opportunity_id);

-- ============================================================================
-- merged_opportunity_cache — 60s TTL cache for computed merge results
-- ============================================================================
CREATE TABLE IF NOT EXISTS merged_opportunity_cache (
  opportunity_id  BIGINT        PRIMARY KEY REFERENCES opportunities(id) ON DELETE CASCADE,
  merged_data     JSONB         NOT NULL,
  computed_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMIT;
