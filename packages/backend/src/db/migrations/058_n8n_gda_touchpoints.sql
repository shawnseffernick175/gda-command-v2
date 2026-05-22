-- Migration 058: Create gda_touchpoints table.
-- Part of F-023a: ADOPT shadow table from n8n-envision-postgres-1.
--
-- Child table of gda_relationships (migration 057). Records interaction
-- touchpoints with government contacts — contact type, summary, next actions.
--
-- Currently managed by n8n workflow GDA.api.relationship-tracker
-- (ck1NTtdvuqB7CQ81) via the "GDA Postgres" credential.
--
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS gda_touchpoints (
  id SERIAL PRIMARY KEY,
  relationship_id INTEGER REFERENCES gda_relationships(id),
  contact_type TEXT,
  summary TEXT,
  next_action TEXT,
  next_action_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
