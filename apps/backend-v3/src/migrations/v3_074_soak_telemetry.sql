-- v3_074_soak_telemetry
-- Creates soak telemetry event store and daily metrics materialized view.

CREATE TABLE IF NOT EXISTS soak_events (
  id          bigserial PRIMARY KEY,
  kind        text NOT NULL,
  url         text,
  status      int,
  duration_ms int,
  message     text,
  api_version text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE MATERIALIZED VIEW IF NOT EXISTS soak_metrics AS
  SELECT
    date_trunc('day', created_at)::date AS day,
    kind,
    count(*)                                                         AS count,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)       AS p95_ms,
    api_version
  FROM soak_events
  GROUP BY 1, 2, 5;
