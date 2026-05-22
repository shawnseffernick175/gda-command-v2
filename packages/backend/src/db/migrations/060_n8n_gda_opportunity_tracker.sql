-- Migration 060: Create gda_opportunity_tracker table.
-- Part of F-023c: ADOPT shadow table from n8n-envision-postgres-1.
-- Core pipeline table — 1,780 rows, 54 workflow consumers
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS gda_opportunity_tracker (
  id SERIAL PRIMARY KEY,
  agency TEXT NOT NULL,
  dept TEXT,
  programs_json TEXT DEFAULT '[]'::jsonb,
  program_count INTEGER DEFAULT 0,
  synced_at TIMESTAMP DEFAULT now(),
  govtribe_id TEXT,
  naics_code TEXT,
  set_aside TEXT,
  eis_fit_score INTEGER DEFAULT 0,
  data_source TEXT DEFAULT 'manual'::text,
  solicitation_number TEXT,
  response_deadline TIMESTAMP,
  place_of_performance TEXT,
  last_refreshed TIMESTAMP DEFAULT now(),
  estimated_value BIGINT,
  stage VARCHAR(20) DEFAULT 'Identified'::character varying,
  ai_analysis TEXT,
  needs_score NUMERIC,
  financials_score NUMERIC,
  ooda_score NUMERIC,
  level_1 TEXT DEFAULT 'Department of War'::text,
  level_2 TEXT,
  level_3 TEXT,
  opp_title TEXT,
  source_url TEXT,
  gda_score INTEGER DEFAULT 0,
  gda_label VARCHAR(20) DEFAULT 'PASS'::character varying,
  incumbent_analysis TEXT,
  likely_competitors TEXT,
  eligible_vehicles TEXT,
  enrichment_date TIMESTAMPTZ,
  auto_enriched BOOLEAN DEFAULT false,
  assigned_ou TEXT,
  sb_qualified BOOLEAN,
  last_synced_at TIMESTAMP,
  version INTEGER DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ot_dept ON public.gda_opportunity_tracker USING btree (dept);
CREATE INDEX IF NOT EXISTS idx_ot_synced ON public.gda_opportunity_tracker USING btree (synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_opp_tracker_govtribe_id ON public.gda_opportunity_tracker USING btree (govtribe_id);
CREATE INDEX IF NOT EXISTS idx_gda_opp_gda_score ON public.gda_opportunity_tracker USING btree (gda_score DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gda_opp_tracker_sol_num ON public.gda_opportunity_tracker USING btree (solicitation_number);
