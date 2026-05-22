-- Migration 075: Create gda_saved_opportunities table.
-- Part of F-023c: ADOPT shadow table from n8n-envision-postgres-1.
-- Saved opportunities — 0 rows, 3 consumers
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS gda_saved_opportunities (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  agency TEXT,
  dept TEXT,
  need_score INTEGER DEFAULT 0,
  urgency TEXT DEFAULT 'MEDIUM'::text,
  primary_fit TEXT,
  secondary_fit TEXT,
  so_what TEXT,
  solicitation TEXT,
  source TEXT,
  value TEXT,
  capture_action TEXT,
  ai_rank INTEGER DEFAULT 0,
  ai_rationale TEXT,
  user_starred BOOLEAN DEFAULT false,
  user_notes TEXT,
  status TEXT DEFAULT 'TRACKING'::text,
  saved_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

