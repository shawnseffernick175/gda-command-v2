-- Migration 080: Create govtribe_cache table.
-- Part of F-023c: ADOPT shadow table from n8n-envision-postgres-1.
-- GovTribe data cache — 0 rows, 2 consumers
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS govtribe_cache (
  id SERIAL PRIMARY KEY,
  cache_key VARCHAR(512) NOT NULL,
  search_type VARCHAR(100),
  result_json JSONB NOT NULL,
  result_count INTEGER DEFAULT 0,
  credits_used NUMERIC DEFAULT 0,
  cached_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + '24:00:00'::interval)
);

CREATE UNIQUE INDEX IF NOT EXISTS govtribe_cache_cache_key_key ON public.govtribe_cache USING btree (cache_key);
CREATE INDEX IF NOT EXISTS idx_govtribe_cache_key ON public.govtribe_cache USING btree (cache_key);
CREATE INDEX IF NOT EXISTS idx_govtribe_cache_expires ON public.govtribe_cache USING btree (expires_at);
