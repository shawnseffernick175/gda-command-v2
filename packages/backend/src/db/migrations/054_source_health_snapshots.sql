-- Source Health Snapshots: daily state capture for the Source Status dashboard.
-- Provides historical tracking and powers the SourceStatusStrip UI component.

-- 1. source_health_snapshots — one row per source per snapshot cycle
CREATE TABLE IF NOT EXISTS source_health_snapshots (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  snapshot_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source          VARCHAR(50) NOT NULL,
  role            VARCHAR(20) NOT NULL DEFAULT 'primary',
  status          VARCHAR(20) NOT NULL DEFAULT 'healthy',
  last_record_at  TIMESTAMPTZ,
  records_last_7d  INT NOT NULL DEFAULT 0,
  records_last_30d INT NOT NULL DEFAULT 0,
  calls_last_7d    INT NOT NULL DEFAULT 0,
  error_count_7d   INT NOT NULL DEFAULT 0,
  status_reason   TEXT,
  meta            JSONB DEFAULT '{}',
  CONSTRAINT chk_snapshot_role CHECK (role IN ('primary', 'enrichment')),
  CONSTRAINT chk_snapshot_status CHECK (status IN ('healthy', 'degraded', 'error', 'deprecated', 'planned', 'missing_key'))
);

CREATE INDEX IF NOT EXISTS idx_source_health_snapshots_source_at
  ON source_health_snapshots (source, snapshot_at DESC);

-- 2. enrichment_call_log — lightweight per-call logging for enrichment sources
CREATE TABLE IF NOT EXISTS enrichment_call_log (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  source        VARCHAR(50) NOT NULL,
  called_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success       BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  opportunity_id TEXT,
  duration_ms   INT
);

CREATE INDEX IF NOT EXISTS idx_enrichment_call_log_source_at
  ON enrichment_call_log (source, called_at DESC);

-- 3. Add role column to gov_source_feeds
ALTER TABLE gov_source_feeds
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'primary';

-- Set enrichment roles for USAspending and FPDS
UPDATE gov_source_feeds SET role = 'enrichment' WHERE source IN ('usaspending', 'fpds');
