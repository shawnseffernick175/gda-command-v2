-- v3_079: Capture stage history — audit trail for pipeline stage transitions
-- Tracks explicit user-triggered stage changes and system/auto moves separately.
-- Used by Pipeline Stage Movers panel.

CREATE TABLE IF NOT EXISTS capture_stage_history (
  id            BIGSERIAL     PRIMARY KEY,
  pipeline_item_id BIGINT     REFERENCES pipeline_items(id) ON DELETE CASCADE,
  opportunity_id   BIGINT     REFERENCES opportunities(id) ON DELETE CASCADE,
  from_stage    TEXT,
  to_stage      TEXT          NOT NULL,
  moved_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  moved_by_user TEXT,          -- NULL if system/auto
  reason        TEXT
);

CREATE INDEX IF NOT EXISTS idx_csh_moved_at ON capture_stage_history(moved_at DESC);
CREATE INDEX IF NOT EXISTS idx_csh_pipeline_item ON capture_stage_history(pipeline_item_id);
CREATE INDEX IF NOT EXISTS idx_csh_opportunity ON capture_stage_history(opportunity_id);
