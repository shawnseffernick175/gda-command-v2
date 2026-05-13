-- 015_fix_proposals.sql
-- Stores AI-diagnosed workflow failures with proposed fixes.
-- Used by the Controlled Fix Agent (Phase 6).

CREATE TABLE IF NOT EXISTS fix_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id UUID REFERENCES agent_runs(id),

  -- Failure identification
  execution_id TEXT,                       -- n8n execution ID (if from n8n)
  workflow_name TEXT NOT NULL,
  workflow_id TEXT,
  failed_node TEXT,
  error_message TEXT NOT NULL,
  failed_at TIMESTAMPTZ,

  -- AI diagnosis
  root_cause TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium', -- critical, high, medium, low
  suggested_fix TEXT NOT NULL,
  fix_type TEXT NOT NULL DEFAULT 'manual', -- auto, manual, restart, config_change
  risk_assessment TEXT,
  safety_lane TEXT NOT NULL DEFAULT 'approval', -- read-only, dry-run, approval, unknown
  auto_fixable BOOLEAN NOT NULL DEFAULT false,

  -- Resolution
  status TEXT NOT NULL DEFAULT 'proposed', -- proposed, approved, rejected, applied, verified, failed
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  applied_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  verification_result JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fix_proposals_status ON fix_proposals(status);
CREATE INDEX IF NOT EXISTS idx_fix_proposals_severity ON fix_proposals(severity);
CREATE INDEX IF NOT EXISTS idx_fix_proposals_created ON fix_proposals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fix_proposals_execution ON fix_proposals(execution_id);
