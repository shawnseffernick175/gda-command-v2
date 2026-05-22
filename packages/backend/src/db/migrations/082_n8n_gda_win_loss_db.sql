-- Migration 082: Create gda_win_loss_db table.
-- Part of F-023c: ADOPT shadow table from n8n-envision-postgres-1.
-- Win/loss database — 10 rows, 1 consumer
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS gda_win_loss_db (
  id SERIAL PRIMARY KEY,
  opportunity_title TEXT NOT NULL,
  agency TEXT,
  contract_value BIGINT,
  stage TEXT DEFAULT 'Won'::text,
  outcome TEXT,
  win_themes TEXT[],
  incumbent_displaced BOOLEAN DEFAULT false,
  incumbent_name TEXT,
  key_differentiators TEXT,
  loss_reason TEXT,
  award_date DATE,
  naics_code TEXT,
  set_aside TEXT,
  ou TEXT DEFAULT 'OU3'::text,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

