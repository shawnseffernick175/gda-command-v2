-- Old pre-v3_063 pipeline_items table shape used for migration testing.
-- This must be applied BEFORE v3_063 so the migration has something to transform.
DROP TABLE IF EXISTS pipeline_items CASCADE;

CREATE TABLE pipeline_items (
  id BIGSERIAL PRIMARY KEY,
  opportunity_id BIGINT,
  capture_owner TEXT,
  stage TEXT NOT NULL DEFAULT 'qualifying'
    CHECK (stage IN ('qualifying','pursuit','proposal','submitted','evaluation','won','lost')),
  source_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO pipeline_items (opportunity_id, capture_owner, stage, source_id) VALUES
  (1, 'user-a', 'qualifying', 1),
  (2, 'user-b', 'pursuit', 1),
  (3, 'user-c', 'proposal', 1),
  (4, 'user-d', 'submitted', 1),
  (5, 'user-e', 'evaluation', 1),
  (6, 'user-f', 'won', 1),
  (7, 'user-g', 'lost', 1);
