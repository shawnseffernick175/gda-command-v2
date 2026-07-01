-- F-307: Risks as First-Class Objects Across Lifecycle (Launchpad Roll-Up)
-- Promotes risks to first-class entities with lifecycle tracking, multi-entity
-- linkage, event log, and deduplication support.

-- Add severity column
ALTER TABLE risks
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('critical', 'high', 'medium', 'low'));

-- Add lifecycle-related columns
ALTER TABLE risks
  ADD COLUMN IF NOT EXISTS related_capture_id BIGINT,
  ADD COLUMN IF NOT EXISTS related_pipeline_item_id BIGINT,
  ADD COLUMN IF NOT EXISTS related_action_item_id BIGINT,
  ADD COLUMN IF NOT EXISTS source_event JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mitigation_doc_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS evidence_grade TEXT CHECK (evidence_grade IN ('A', 'B', 'C') OR evidence_grade IS NULL),
  ADD COLUMN IF NOT EXISTS identified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT 'system';

-- Expand category constraint to include F-307 categories
ALTER TABLE risks DROP CONSTRAINT IF EXISTS risks_category_check;
ALTER TABLE risks ADD CONSTRAINT risks_category_check
  CHECK (category IN (
    'operational', 'technical', 'financial', 'compliance', 'schedule', 'competitive', 'personnel',
    'doctrine_violation', 'margin', 'past_performance', 'teaming',
    'incumbent_advantage', 'staffing', 'certification', 'price', 'other'
  ));

-- Expand status constraint to include F-307 lifecycle statuses
ALTER TABLE risks DROP CONSTRAINT IF EXISTS risks_status_check;
ALTER TABLE risks ADD CONSTRAINT risks_status_check
  CHECK (status IN ('open', 'mitigating', 'mitigated', 'resolved', 'accepted', 'closed'));

-- Add indexes for the new query patterns
CREATE INDEX IF NOT EXISTS risks_severity_idx ON risks (severity);
CREATE INDEX IF NOT EXISTS risks_status_severity_idx ON risks (status, severity);
CREATE INDEX IF NOT EXISTS risks_related_capture_idx ON risks (related_capture_id) WHERE related_capture_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS risks_related_pipeline_idx ON risks (related_pipeline_item_id) WHERE related_pipeline_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS risks_identified_at_idx ON risks (identified_at DESC);

-- Risk events table: tracks duplicate fires and lifecycle transitions
CREATE TABLE IF NOT EXISTS risk_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id BIGINT NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'duplicate_fire', 'status_change', 'severity_change', 'owner_assigned', 'mitigation_updated', 'evidence_added', 'auto_archived')),
  payload JSONB NOT NULL DEFAULT '{}',
  actor TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS risk_events_risk_id_idx ON risk_events (risk_id, created_at DESC);
CREATE INDEX IF NOT EXISTS risk_events_type_idx ON risk_events (event_type, created_at DESC);
