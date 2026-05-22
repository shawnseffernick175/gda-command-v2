-- Migration 062: Create gda_intelligence_log table.
-- Part of F-023c: ADOPT shadow table from n8n-envision-postgres-1.
-- Intelligence feed log — 54 rows, 14 consumers
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS gda_intelligence_log (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL,
  agency TEXT,
  finding TEXT NOT NULL,
  category TEXT,
  priority TEXT NOT NULL DEFAULT 'MED'::text
);

CREATE INDEX IF NOT EXISTS idx_intel_log_timestamp ON public.gda_intelligence_log USING btree ("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_intel_log_agency ON public.gda_intelligence_log USING btree (agency);
CREATE INDEX IF NOT EXISTS idx_intel_log_priority ON public.gda_intelligence_log USING btree (priority);
