-- Migration 063: Create gda_competitor_watchlist table.
-- Part of F-023c: ADOPT shadow table from n8n-envision-postgres-1.
-- Competitor intelligence — 46 rows, 9 consumers
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS gda_competitor_watchlist (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  size VARCHAR(20) DEFAULT 'unknown'::character varying,
  size_detail JSONB DEFAULT '{}'::jsonb,
  threat_score INTEGER DEFAULT 0,
  relationship VARCHAR(20) DEFAULT 'MONITOR'::character varying,
  relationship_rationale TEXT,
  target_agencies TEXT,
  capabilities TEXT,
  known_contracts JSONB DEFAULT '[]'::jsonb,
  overlap_with_eis JSONB DEFAULT '{}'::jsonb,
  teaming_potential JSONB DEFAULT '{}'::jsonb,
  recent_news JSONB DEFAULT '[]'::jsonb,
  eis_strategy JSONB DEFAULT '{}'::jsonb,
  profile_data JSONB DEFAULT '{}'::jsonb,
  added_reason TEXT,
  status VARCHAR(20) DEFAULT 'active'::character varying,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  analyzed_at TIMESTAMPTZ,
  threat_level VARCHAR(20),
  scoring_factors TEXT,
  scored_at TIMESTAMP,
  region VARCHAR(50),
  govtribe_url TEXT,
  total_obligated NUMERIC,
  why_they_matter TEXT,
  top_agencies TEXT,
  idiq_vehicles TEXT,
  sba_certs TEXT,
  capture_plan_overlap TEXT,
  teaming_potential_detail TEXT,
  govtribe_summary TEXT,
  landscape TEXT,
  tags TEXT,
  gda_threat_summary TEXT,
  recent_contracts TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS gda_competitor_watchlist_name_key ON public.gda_competitor_watchlist USING btree (name);
CREATE INDEX IF NOT EXISTS idx_cw_name ON public.gda_competitor_watchlist USING btree (name);
CREATE INDEX IF NOT EXISTS idx_cw_status ON public.gda_competitor_watchlist USING btree (status);
