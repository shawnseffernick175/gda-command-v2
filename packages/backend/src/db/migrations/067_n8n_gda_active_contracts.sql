-- Migration 067: Create gda_active_contracts table.
-- Part of F-023c: ADOPT shadow table from n8n-envision-postgres-1.
-- Contract tracking — 5 rows, 5 consumers
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS gda_active_contracts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  client TEXT,
  piid TEXT,
  idv TEXT,
  naics TEXT,
  contract_type TEXT,
  ceiling NUMERIC DEFAULT 0,
  funded NUMERIC DEFAULT 0,
  pop_start TEXT,
  pop_end TEXT,
  option_years INTEGER DEFAULT 0,
  options_exercised INTEGER DEFAULT 0,
  status TEXT DEFAULT 'Active'::text,
  pm TEXT,
  cotr TEXT,
  employees INTEGER DEFAULT 0,
  location TEXT,
  description TEXT,
  key_personnel TEXT[],
  fy_revenue JSONB DEFAULT '{}'::jsonb,
  ou TEXT DEFAULT 'EIS'::text,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

