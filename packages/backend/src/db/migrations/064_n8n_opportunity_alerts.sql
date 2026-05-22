-- Migration 064: Create opportunity_alerts table.
-- Part of F-023c: ADOPT shadow table from n8n-envision-postgres-1.
-- Alert system — 2 rows, 7 consumers, heavily indexed
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS opportunity_alerts (
  id SERIAL PRIMARY KEY,
  govtribe_id VARCHAR(100),
  solicitation_number VARCHAR(200),
  title TEXT NOT NULL,
  opportunity_type VARCHAR(50),
  set_aside_type VARCHAR(100),
  posted_date DATE,
  due_date DATE,
  agency TEXT,
  department TEXT,
  naics_code VARCHAR(20),
  naics_name TEXT,
  source_url TEXT,
  source VARCHAR(50) DEFAULT 'GovTribe'::character varying,
  eis_fit_score NUMERIC,
  urgency_score NUMERIC,
  composite_score NUMERIC,
  ai_fit_reasoning TEXT,
  capability_tags TEXT[],
  status VARCHAR(30) DEFAULT 'NEW'::character varying,
  synced_at TIMESTAMP DEFAULT now(),
  created_at TIMESTAMP DEFAULT now(),
  fit_score INTEGER DEFAULT 0,
  capability_matches TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS opportunity_alerts_solicitation_number_key ON public.opportunity_alerts USING btree (solicitation_number);
CREATE INDEX IF NOT EXISTS idx_opp_alerts_sol ON public.opportunity_alerts USING btree (solicitation_number);
CREATE INDEX IF NOT EXISTS idx_opp_alerts_dept ON public.opportunity_alerts USING btree (department);
CREATE INDEX IF NOT EXISTS idx_opp_alerts_score ON public.opportunity_alerts USING btree (composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_opp_alerts_due ON public.opportunity_alerts USING btree (due_date);
CREATE INDEX IF NOT EXISTS idx_opp_alerts_status ON public.opportunity_alerts USING btree (status);
CREATE INDEX IF NOT EXISTS idx_opp_score ON public.opportunity_alerts USING btree (fit_score DESC);
CREATE INDEX IF NOT EXISTS idx_opp_due ON public.opportunity_alerts USING btree (due_date);
