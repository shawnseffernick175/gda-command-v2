-- 013_agent_infrastructure.sql
-- Shared tables for the GDA agentic AI layer.
-- Supports: agent config, run tracking, and universal approval queue.

-- ---------------------------------------------------------------------------
-- Agent configuration — one row per agent
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_config (
  agent TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  schedule TEXT,                          -- cron expression (e.g. '0 6 * * *')
  last_run_at TIMESTAMPTZ,
  config JSONB NOT NULL DEFAULT '{}',    -- agent-specific settings
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the six agents from the North Star roadmap
INSERT INTO agent_config (agent, display_name, description, schedule) VALUES
  ('opportunity-watch',  'Opportunity Watch Agent',  'Scores SAM.gov opportunities against Envision capabilities, flags pursue/evaluate/pass', '0 */6 * * *'),
  ('capture-coach',      'Capture Coach Agent',      'Per-opportunity capture strategy, gap analysis, risk assessment, and next actions',       NULL),
  ('competitive-intel',  'Competitive Intel Agent',  'Monitors competitor FPDS wins, news, and movements; alerts on significant changes',       '0 5 * * *'),
  ('morning-commander',  'Morning Commander Agent',  'Daily executive briefing: priorities, deadlines, risks, competitor activity, system health','0 6 * * *'),
  ('fix-runner',         'Controlled Fix Agent',     'Detects n8n workflow failures, diagnoses root cause, proposes approved fixes',             '0 */4 * * *'),
  ('approval-queue',     'Approval Queue',           'Universal human-in-the-loop inbox for all agent-proposed actions',                        NULL)
ON CONFLICT (agent) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Agent runs — execution log for every agent invocation
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent TEXT NOT NULL REFERENCES agent_config(agent),
  status TEXT NOT NULL DEFAULT 'running',   -- running, completed, failed
  trigger TEXT NOT NULL DEFAULT 'manual',   -- cron, manual, webhook
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  items_processed INT DEFAULT 0,
  items_flagged INT DEFAULT 0,
  results_summary JSONB,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent);
CREATE INDEX IF NOT EXISTS idx_agent_runs_started ON agent_runs(started_at DESC);

-- ---------------------------------------------------------------------------
-- Approval queue — universal human-approval inbox
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS approval_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,                       -- opportunity_review, workflow_fix, send_email, etc.
  agent TEXT REFERENCES agent_config(agent),
  agent_run_id UUID REFERENCES agent_runs(id),
  title TEXT NOT NULL,
  summary TEXT,
  data JSONB,                               -- full context for the approval decision
  priority TEXT NOT NULL DEFAULT 'medium',   -- critical, high, medium, low
  status TEXT NOT NULL DEFAULT 'pending',    -- pending, approved, rejected, expired
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_queue_status ON approval_queue(status);
CREATE INDEX IF NOT EXISTS idx_approval_queue_type ON approval_queue(type);
CREATE INDEX IF NOT EXISTS idx_approval_queue_created ON approval_queue(created_at DESC);
