-- Migration 076: Create gda_teaming_partners table.
-- Part of F-023c: ADOPT shadow table from n8n-envision-postgres-1.
-- Teaming partner tracker — 12 rows, 3 consumers
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS gda_teaming_partners (
  id SERIAL PRIMARY KEY,
  company_name TEXT NOT NULL,
  cage_code TEXT,
  duns TEXT,
  uei TEXT,
  size_status TEXT,
  socio_economic TEXT,
  naics_codes TEXT,
  core_capabilities TEXT,
  past_teaming_with_gda BOOLEAN DEFAULT false,
  past_teaming_details TEXT,
  contract_vehicles TEXT,
  geographic_presence TEXT,
  key_personnel TEXT,
  relationship_strength TEXT DEFAULT 'New'::text,
  last_contact_date TIMESTAMPTZ,
  linked_opp_ids TEXT,
  nda_status TEXT DEFAULT 'None'::text,
  ta_status TEXT DEFAULT 'None'::text,
  notes TEXT,
  source TEXT DEFAULT 'Manual'::text,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gda_teaming_partners_uei_key ON public.gda_teaming_partners USING btree (uei);
