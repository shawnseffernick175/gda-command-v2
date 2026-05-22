-- Migration 061: Create gda_capture_plans table.
-- Part of F-023c: ADOPT shadow table from n8n-envision-postgres-1.
-- Capture planning — ~110 rows, 25 consumers
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS gda_capture_plans (
  id SERIAL PRIMARY KEY,
  opportunity TEXT,
  agency TEXT,
  contract_value TEXT,
  plan_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  opp_id INTEGER,
  opp_title TEXT,
  auto_generated BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  version INTEGER DEFAULT 1,
  last_synced_at TIMESTAMP,
  sync_source VARCHAR(50)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_capture_plans_opp_id ON public.gda_capture_plans USING btree (opp_id) WHERE (opp_id IS NOT NULL);
