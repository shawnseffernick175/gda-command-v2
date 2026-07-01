-- v3_126_risks_first_class.sql  (F-307: Risks as First-Class Objects)
-- Evolve the existing risks table to match the F-307 spec and add risk_events.

-- 1. Drop generated column so we can alter freely
ALTER TABLE risks DROP COLUMN IF EXISTS score;

-- 2. Add new columns from F-307 spec
ALTER TABLE risks
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('critical','high','medium','low')),
  ADD COLUMN IF NOT EXISTS source_event JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mitigation_doc_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS evidence_grade TEXT CHECK (evidence_grade IN ('A','B','C')),
  ADD COLUMN IF NOT EXISTS identified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS related_capture_id BIGINT,
  ADD COLUMN IF NOT EXISTS related_pipeline_item_id UUID,
  ADD COLUMN IF NOT EXISTS related_action_item_id UUID;

-- 3. Expand category CHECK to include F-307 categories
ALTER TABLE risks DROP CONSTRAINT IF EXISTS risks_category_check;
ALTER TABLE risks ADD CONSTRAINT risks_category_check CHECK (
  category IN (
    'doctrine_violation','margin','compliance','past_performance','teaming',
    'incumbent_advantage','schedule','staffing','certification','price',
    'technical','other',
    'operational','financial','competitive','personnel'
  )
);

-- 4. Expand status CHECK to include F-307 statuses
ALTER TABLE risks DROP CONSTRAINT IF EXISTS risks_status_check;
ALTER TABLE risks ADD CONSTRAINT risks_status_check CHECK (
  status IN ('open','mitigating','resolved','accepted','mitigated','closed')
);

-- 5. Expand source CHECK
ALTER TABLE risks DROP CONSTRAINT IF EXISTS risks_source_check;
ALTER TABLE risks ADD CONSTRAINT risks_source_check CHECK (
  source IN ('manual','ai_generated','doctrine_rule','color_review','sentinel','hook')
);

-- 6. Add F-307 indexes
CREATE INDEX IF NOT EXISTS risks_status_severity_idx ON risks (status, severity);
CREATE INDEX IF NOT EXISTS risks_related_capture_idx ON risks (related_capture_id) WHERE related_capture_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS risks_related_pipeline_idx ON risks (related_pipeline_item_id) WHERE related_pipeline_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS risks_severity_idx ON risks (severity);

-- 7. Create risk_events table for dedup / event log
CREATE TABLE IF NOT EXISTS risk_events (
  id         BIGSERIAL PRIMARY KEY,
  risk_id    BIGINT NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created','status_change','duplicate_fire','mitigation_update',
    'owner_change','evidence_added','severity_change','note'
  )),
  detail     JSONB NOT NULL DEFAULT '{}',
  actor      TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS risk_events_risk_id_idx ON risk_events (risk_id);
CREATE INDEX IF NOT EXISTS risk_events_created_at_idx ON risk_events (created_at DESC);
