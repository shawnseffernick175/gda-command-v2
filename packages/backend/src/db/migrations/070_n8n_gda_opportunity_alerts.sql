-- Migration 070: Create gda_opportunity_alerts table.
-- Part of F-023c: ADOPT shadow table from n8n-envision-postgres-1.
-- Opportunity alerts — 7 rows, 4 consumers
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS gda_opportunity_alerts (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  title TEXT NOT NULL,
  agency TEXT,
  urgency TEXT NOT NULL DEFAULT 'MED'::text,
  detail TEXT,
  source_url TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + '30 days'::interval),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opp_alerts_agency ON public.gda_opportunity_alerts USING btree (agency);
CREATE INDEX IF NOT EXISTS idx_opp_alerts_urgency ON public.gda_opportunity_alerts USING btree (urgency);
CREATE INDEX IF NOT EXISTS idx_opp_alerts_expires ON public.gda_opportunity_alerts USING btree (expires_at);
