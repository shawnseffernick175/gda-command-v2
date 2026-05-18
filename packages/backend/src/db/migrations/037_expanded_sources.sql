-- Migration 037: Expanded Sources (W2)
-- Source registry for tracking all data feed configurations,
-- sync history, and health status.

CREATE TABLE IF NOT EXISTS source_registry (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  source_type     TEXT NOT NULL,   -- 'api', 'webhook', 'file', 'rss', 'manual'
  category        TEXT NOT NULL DEFAULT 'government', -- 'government', 'commercial', 'internal'
  base_url        TEXT,
  auth_type       TEXT DEFAULT 'api_key', -- 'api_key', 'oauth', 'none', 'webhook_key'
  enabled         BOOLEAN NOT NULL DEFAULT false,
  search_params   JSONB NOT NULL DEFAULT '{}',
  sync_frequency  TEXT DEFAULT 'daily', -- 'hourly', 'daily', 'weekly', 'manual'
  last_sync_at    TIMESTAMPTZ,
  last_sync_status TEXT DEFAULT 'never', -- 'success', 'error', 'running', 'never'
  last_sync_count INT DEFAULT 0,
  total_synced    INT DEFAULT 0,
  error_count     INT DEFAULT 0,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sync run history for auditing
CREATE TABLE IF NOT EXISTS source_sync_runs (
  id              TEXT PRIMARY KEY,
  source_id       TEXT NOT NULL REFERENCES source_registry(id),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'running',
  records_fetched INT DEFAULT 0,
  records_upserted INT DEFAULT 0,
  records_errored INT DEFAULT 0,
  duration_ms     INT,
  error           TEXT,
  metadata        JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_source_sync_runs_source ON source_sync_runs(source_id);
CREATE INDEX IF NOT EXISTS idx_source_sync_runs_started ON source_sync_runs(started_at DESC);

-- Add data_source tracking to opportunities if not present
-- (column already exists but let's ensure it's there)
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS data_source TEXT;

-- Seed default sources
INSERT INTO source_registry (id, name, source_type, category, base_url, auth_type, enabled, sync_frequency, search_params) VALUES
  ('sam-gov',     'SAM.gov',           'api',     'government', 'https://api.sam.gov/opportunities/v2', 'api_key', true, 'daily', '{"daysBack": 30}'),
  ('fpds',        'FPDS',              'api',     'government', 'https://api.sam.gov/opportunities/v1', 'api_key', true, 'weekly', '{"daysBack": 90}'),
  ('govtribe',    'GovTribe',          'api',     'commercial', 'https://api.govtribe.com',             'api_key', false, 'daily', '{"keywords": []}'),
  ('govwin',      'GovWin IQ',         'api',     'commercial', NULL,                                   'oauth',  false, 'daily', '{}'),
  ('grants-gov',  'Grants.gov',        'api',     'government', 'https://api.grants.gov/v1',            'none',   false, 'daily', '{"daysBack": 30}'),
  ('ebuy',        'eBuy/GSA',          'rss',     'government', 'https://www.ebuy.gsa.gov',             'none',   false, 'daily', '{}'),
  ('dibbs',       'DIBBS',             'api',     'government', NULL,                                   'api_key', false, 'weekly', '{}'),
  ('n8n-webhook', 'n8n Webhooks',      'webhook', 'internal',   NULL,                                   'webhook_key', true, 'manual', '{}'),
  ('manual',      'Manual Entry',      'manual',  'internal',   NULL,                                   'none',   true, 'manual', '{}')
ON CONFLICT (id) DO NOTHING;
