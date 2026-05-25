-- F-039: Health Sentinel — single source of truth for system status
-- Stores periodic health snapshots with per-component probe results.

BEGIN;

CREATE TABLE system_health_snapshots (
  id              BIGSERIAL PRIMARY KEY,
  taken_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  overall_status  TEXT NOT NULL CHECK (overall_status IN ('healthy','degraded','down','unknown')),
  components      JSONB NOT NULL,
  failing_count   INT NOT NULL DEFAULT 0,
  reason          TEXT,
  meta            JSONB
);

CREATE INDEX idx_health_snapshots_taken_at ON system_health_snapshots(taken_at DESC);
CREATE INDEX idx_health_snapshots_status ON system_health_snapshots(overall_status, taken_at DESC);

COMMIT;
