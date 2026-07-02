-- v3_134_soak_metrics_unique_idx
-- Adds a unique index on the soak_metrics materialized view so that
-- REFRESH MATERIALIZED VIEW CONCURRENTLY can be used (non-blocking reads).

CREATE UNIQUE INDEX IF NOT EXISTS soak_metrics_day_kind_api_version_idx
  ON soak_metrics (day, kind, api_version);
