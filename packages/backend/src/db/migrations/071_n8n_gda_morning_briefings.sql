-- Migration 071: Create gda_morning_briefings table.
-- Part of F-023c: ADOPT shadow table from n8n-envision-postgres-1.
-- Morning briefings — 40 rows, 4 consumers
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS gda_morning_briefings (
  id SERIAL PRIMARY KEY,
  briefing TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  generated_at TIMESTAMPTZ DEFAULT now(),
  headlines JSONB
);

