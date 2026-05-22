-- Migration 074: Create gda_error_log table.
-- Part of F-023c: ADOPT shadow table from n8n-envision-postgres-1.
-- Error logging — 334 rows, 3 consumers
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS gda_error_log (
  id SERIAL PRIMARY KEY,
  workflow_id TEXT,
  workflow_name TEXT,
  error_message TEXT,
  error_node TEXT,
  execution_id TEXT,
  logged_at TIMESTAMPTZ DEFAULT now()
);

