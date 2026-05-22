-- Migration 068: Create gda_dashboard_intel_cache table.
-- Part of F-023c: ADOPT shadow table from n8n-envision-postgres-1.
-- Dashboard intel cache — 6 rows, 5 consumers
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS gda_dashboard_intel_cache (
  id SERIAL PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

