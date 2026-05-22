-- Migration 066: Create gda_action_items table.
-- Part of F-023c: ADOPT shadow table from n8n-envision-postgres-1.
-- Action items — 47 rows, 5 consumers
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS gda_action_items (
  id SERIAL PRIMARY KEY,
  item TEXT NOT NULL,
  owner TEXT,
  deadline TEXT,
  status TEXT NOT NULL DEFAULT 'Open'::text,
  source_meeting TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_items_status ON public.gda_action_items USING btree (status);
CREATE INDEX IF NOT EXISTS idx_action_items_owner ON public.gda_action_items USING btree (owner);
CREATE INDEX IF NOT EXISTS idx_action_items_deadline ON public.gda_action_items USING btree (deadline);
