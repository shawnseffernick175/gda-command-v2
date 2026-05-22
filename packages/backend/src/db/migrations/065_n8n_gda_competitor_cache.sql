-- Migration 065: Create gda_competitor_cache table.
-- Part of F-023c: ADOPT shadow table from n8n-envision-postgres-1.
-- Competitor data cache — 1 row, 6 consumers
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS gda_competitor_cache (
  id SERIAL PRIMARY KEY,
  target TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  full_11q_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gda_competitor_cache_target_key ON public.gda_competitor_cache USING btree (target);
CREATE INDEX IF NOT EXISTS idx_competitor_cache_target ON public.gda_competitor_cache USING btree (target);
CREATE INDEX IF NOT EXISTS idx_competitor_cache_timestamp ON public.gda_competitor_cache USING btree ("timestamp" DESC);
