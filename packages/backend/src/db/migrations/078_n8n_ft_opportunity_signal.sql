-- Migration 078: Create ft_opportunity_signal table.
-- Part of F-023c: ADOPT shadow table from n8n-envision-postgres-1.
-- Fast-track pipeline signals — 234 rows, FK child of ft_signal_source
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS ft_opportunity_signal (
  id SERIAL PRIMARY KEY,
  signal_id VARCHAR(100) NOT NULL,
  source_id VARCHAR(50),
  title VARCHAR(500) NOT NULL,
  agency VARCHAR(300),
  unit_org VARCHAR(300),
  horizon VARCHAR(30) NOT NULL DEFAULT 'formal'::character varying,
  naics VARCHAR(20),
  estimated_value BIGINT,
  due_date DATE,
  posted_date DATE,
  signal_strength NUMERIC DEFAULT 5.0,
  confidence NUMERIC DEFAULT 5.0,
  tags TEXT[] DEFAULT ARRAY[]::text[],
  recommended_action VARCHAR(200),
  solution_path VARCHAR(100),
  description TEXT,
  external_url TEXT,
  raw_data JSONB DEFAULT '{}'::jsonb,
  reviewed BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  source_url TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS ft_opportunity_signal_signal_id_key ON public.ft_opportunity_signal USING btree (signal_id);
CREATE INDEX IF NOT EXISTS idx_ft_signal_horizon ON public.ft_opportunity_signal USING btree (horizon);
CREATE INDEX IF NOT EXISTS idx_ft_signal_source ON public.ft_opportunity_signal USING btree (source_id);
CREATE INDEX IF NOT EXISTS idx_ft_signal_agency ON public.ft_opportunity_signal USING btree (agency);
CREATE INDEX IF NOT EXISTS idx_ft_signal_active ON public.ft_opportunity_signal USING btree (active, created_at DESC);

DO $$ BEGIN
  ALTER TABLE ft_opportunity_signal ADD CONSTRAINT ft_opportunity_signal_source_id_fkey
    FOREIGN KEY (source_id) REFERENCES ft_signal_source(source_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
