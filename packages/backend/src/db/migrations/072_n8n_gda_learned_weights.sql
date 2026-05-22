-- Migration 072: Create gda_learned_weights table.
-- Part of F-023c: ADOPT shadow table from n8n-envision-postgres-1.
-- ML learned weights — 18 rows, 4 consumers
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS gda_learned_weights (
  id SERIAL PRIMARY KEY,
  weight_key VARCHAR(100) NOT NULL,
  weight_value NUMERIC NOT NULL,
  confidence NUMERIC DEFAULT 0.5,
  source VARCHAR(50) DEFAULT 'an1-seed'::character varying,
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  sample_count INTEGER DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS gda_learned_weights_weight_key_key ON public.gda_learned_weights USING btree (weight_key);
CREATE INDEX IF NOT EXISTS idx_learned_weights_key ON public.gda_learned_weights USING btree (weight_key);
