-- V3 Migration 020: GovWin IQ connector tables (F-Govwin)
--
-- Adds govwin_cache (raw payload debug store) and govwin_auth_state
-- (singleton row tracking CAS ticket health). Feature-flagged behind
-- GOVWIN_CONNECTOR_V1 at the application layer; tables are always present.

BEGIN;

-- Raw payload cache for debugging + reprocessing
CREATE TABLE IF NOT EXISTS govwin_cache (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  govwin_id       text NOT NULL,
  endpoint        text NOT NULL,
  raw_payload     jsonb NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(govwin_id, endpoint)
);

CREATE INDEX IF NOT EXISTS govwin_cache_fetched_at
  ON govwin_cache (fetched_at DESC);

-- Singleton auth state row — tracks CAS TGT health
CREATE TABLE IF NOT EXISTS govwin_auth_state (
  id              integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  tgt_hash        text,
  expires_at      timestamptz,
  last_refresh_at timestamptz,
  last_error      text,
  CONSTRAINT govwin_auth_singleton CHECK (id = 1)
);

-- Seed the singleton row
INSERT INTO govwin_auth_state (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

COMMIT;
