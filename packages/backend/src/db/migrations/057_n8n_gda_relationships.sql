-- Migration 057: Create gda_relationships table.
-- Part of F-023a: ADOPT shadow table from n8n-envision-postgres-1.
--
-- This table is currently managed by n8n workflow GDA.api.relationship-tracker
-- (ck1NTtdvuqB7CQ81) via the "GDA Postgres" credential. It stores contact
-- relationship data for government BD stakeholder tracking.
--
-- Schema matches the LIVE table in n8n-envision-postgres-1 (not the workflow's
-- CREATE TABLE IF NOT EXISTS, which has a divergent schema).
--
-- PII columns: email, phone — flagged in F-023 audit.
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS gda_relationships (
  id SERIAL PRIMARY KEY,
  contact_name VARCHAR,
  title VARCHAR,
  agency VARCHAR,
  department VARCHAR,
  email VARCHAR,
  phone VARCHAR,
  relationship_strength VARCHAR DEFAULT 'New',
  last_contact_date DATE,
  notes TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
