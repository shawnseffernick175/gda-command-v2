-- Migration 084: Create gda_contacts table.
-- Part of F-023c: ADOPT shadow table from n8n-envision-postgres-1.
-- Contact management — 2 rows, PII (email, phone). PROMOTED from DOCUMENT-ONLY
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS gda_contacts (
  id SERIAL PRIMARY KEY,
  govtribe_id TEXT,
  name TEXT,
  email TEXT,
  phone TEXT,
  title TEXT,
  role TEXT,
  organization TEXT,
  agency TEXT,
  dept TEXT,
  linked_opp_ids TEXT[],
  notes TEXT,
  source TEXT DEFAULT 'GovTribe'::text,
  last_interaction TIMESTAMPTZ,
  gap_days INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gda_contacts_govtribe_id_key ON public.gda_contacts USING btree (govtribe_id);
