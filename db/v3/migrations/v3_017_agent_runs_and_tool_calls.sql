-- F-300: Agent Runtime audit tables + read-only role
-- Creates agent_runs, agent_tool_calls, and gda_agent_ro role

-- Read-only role for agent DB access
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gda_agent_ro') THEN
    EXECUTE format('CREATE ROLE gda_agent_ro LOGIN PASSWORD %L', 'agent_ro_default');
  END IF;
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO gda_agent_ro', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO gda_agent_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO gda_agent_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO gda_agent_ro;

CREATE TABLE IF NOT EXISTS agent_runs (
  id            UUID PRIMARY KEY,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ,
  task          TEXT NOT NULL,
  context       JSONB,
  caller        TEXT,
  model         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'running',
  output        TEXT,
  error         TEXT,
  step_count    INT DEFAULT 0,
  token_usage   JSONB
);

CREATE TABLE IF NOT EXISTS agent_tool_calls (
  id            UUID PRIMARY KEY,
  run_id        UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_index    INT NOT NULL,
  tool_name     TEXT NOT NULL,
  input         JSONB NOT NULL,
  output        JSONB,
  latency_ms    INT,
  error         TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_caller_started
  ON agent_runs(caller, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_run_step
  ON agent_tool_calls(run_id, step_index);
