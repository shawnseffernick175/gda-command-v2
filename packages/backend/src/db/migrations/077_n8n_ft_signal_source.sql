-- Migration 077: Create ft_signal_source table.
-- Part of F-023c: ADOPT shadow table from n8n-envision-postgres-1.
-- Fast-track signal sources — 10 rows, FK parent (must precede 078)
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS ft_signal_source (
  id SERIAL PRIMARY KEY,
  source_id VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL,
  source_type VARCHAR(50) NOT NULL,
  band VARCHAR(30) NOT NULL,
  url TEXT,
  notes TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ft_signal_source_source_id_key ON public.ft_signal_source USING btree (source_id);
