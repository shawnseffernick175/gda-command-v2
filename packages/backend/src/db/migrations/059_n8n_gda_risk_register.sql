-- Migration 059: Create gda_risk_register table.
-- Part of F-023b: ADOPT shadow table from n8n-envision-postgres-1.
--
-- This table was originally named "risk_register" in the n8n database, renamed
-- to "gda_risk_register" in F-023b to resolve a name collision with the
-- migration-tracked gda_command.risk_register (created by migration 012).
--
-- The n8n table has a DIFFERENT schema (25 cols, risk assessment data from
-- auto-risk-generation and deadline-escalation cron workflows) vs the
-- gda_command table (19 cols, opportunity-level risk tracking).
--
-- Currently consumed by 8 n8n workflows via the "GDA Postgres" credential:
--   GDA.api.capture-plan, GDA.api.dashboard-mega, GDA.cron.pipeline-health-digest,
--   GDA.cron.deadline-escalation, GDA.api.daily-brief, GDA.api.risk-intel,
--   GDA.cron.auto-risk-generation, GDA.api.daily-actions
--
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS gda_risk_register (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category VARCHAR,
  severity VARCHAR,
  likelihood VARCHAR,
  impact VARCHAR,
  mitigation TEXT,
  owner VARCHAR,
  status VARCHAR DEFAULT 'active',
  due_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  related_opp_id INTEGER,
  related_opp_title TEXT,
  risk_status VARCHAR DEFAULT 'pending',
  assigned_source VARCHAR,
  assigned_notes TEXT,
  likelihood_num INTEGER DEFAULT 3,
  impact_num INTEGER DEFAULT 3,
  risk_key VARCHAR,
  auto_generated BOOLEAN DEFAULT TRUE,
  source VARCHAR DEFAULT 'auto-risk-cron',
  agency VARCHAR,
  opp_id INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gda_risk_register_risk_key ON gda_risk_register(risk_key);
CREATE INDEX IF NOT EXISTS idx_gda_risk_register_severity ON gda_risk_register(severity);
CREATE INDEX IF NOT EXISTS idx_gda_risk_register_category ON gda_risk_register(category);
CREATE INDEX IF NOT EXISTS idx_gda_risk_register_status ON gda_risk_register(status);
