-- F-213: 30-day soak instrumentation — soak_metrics table
-- Stores daily rollups of client-side error events for Sentinel.

CREATE TABLE IF NOT EXISTS soak_metrics (
  id          BIGSERIAL PRIMARY KEY,
  day         DATE        NOT NULL,
  kind        TEXT        NOT NULL,  -- 'fetch_error' | '5xx' | '503_timeout'
  count       INTEGER     NOT NULL DEFAULT 0,
  p95_ms      NUMERIC,               -- p95 latency for detail-endpoint calls
  api_version TEXT        NOT NULL DEFAULT 'v3',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (day, kind, api_version)
);

CREATE TABLE IF NOT EXISTS soak_events (
  id          BIGSERIAL PRIMARY KEY,
  kind        TEXT        NOT NULL,
  url         TEXT,
  status      INTEGER,
  duration_ms INTEGER,
  message     TEXT,
  api_version TEXT        NOT NULL DEFAULT 'v3',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
