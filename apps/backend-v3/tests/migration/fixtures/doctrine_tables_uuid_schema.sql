-- Minimal doctrine_evaluations + agent_decisions with the ORIGINAL UUID-typed
-- columns (mirrors v3_019_doctrine_rules.sql before the v3_065 fix).
-- Used by the v3_065 migration test to verify UUID -> TEXT conversion.

CREATE TABLE IF NOT EXISTS doctrine_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_kind TEXT NOT NULL,
  entity_id UUID NOT NULL,
  principle_scores JSONB NOT NULL DEFAULT '{}',
  alignment_total INT NOT NULL DEFAULT 0,
  evaluated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID,
  entity_id UUID,
  kind TEXT NOT NULL DEFAULT 'override',
  rationale TEXT NOT NULL DEFAULT '',
  decided_by TEXT NOT NULL DEFAULT 'test',
  decided_at TIMESTAMPTZ DEFAULT now()
);
