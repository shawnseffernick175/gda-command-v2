-- Migration 036: Company Entities (W4 — Merger Context)
-- Adds company_entity table for multi-entity merger awareness.

DO $$ BEGIN
  CREATE TYPE entity_status AS ENUM ('legacy', 'merging', 'newco', 'subsidiary', 'partner');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS company_entity (
  entity_id          TEXT PRIMARY KEY,
  legal_name         TEXT NOT NULL,
  dba_names          TEXT[] DEFAULT '{}',
  status             entity_status NOT NULL,
  cage_code          TEXT,
  uei                TEXT,
  duns               TEXT,
  primary_naics      TEXT,
  naics_codes        TEXT[] DEFAULT '{}',
  psc_codes          TEXT[] DEFAULT '{}',
  set_aside_status   TEXT[] DEFAULT '{}',
  certifications     JSONB DEFAULT '[]',
  contract_vehicles  JSONB DEFAULT '[]',
  capabilities       TEXT[] DEFAULT '{}',
  bu_codes           JSONB DEFAULT '[]',
  differentiators    TEXT,
  headquarters       TEXT,
  employee_count     INTEGER,
  revenue_band       TEXT,
  primary_customers  TEXT[] DEFAULT '{}',
  description        TEXT,
  embedding          VECTOR(1536),
  deleted_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Tag opportunities with which entity is pursuing
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS pursuing_entity_id TEXT REFERENCES company_entity(entity_id);

-- Seed the four core entities
INSERT INTO company_entity (entity_id, legal_name, status, cage_code, uei, primary_naics, naics_codes, psc_codes, set_aside_status, certifications, contract_vehicles, capabilities, headquarters, employee_count, revenue_band, primary_customers, description)
VALUES
  (
    'envision',
    'Envision Innovative Solutions, Inc.',
    'legacy',
    NULL, -- Shawn to fill
    NULL, -- Shawn to fill
    '541512',
    ARRAY['541512','541511','541330','541715','541990'],
    ARRAY['D302','D307','D310','D399','R408','R425'],
    ARRAY['SDB','8(a)'],
    '[{"name":"CMMC L2","issuer":"C3PAO","expires":null},{"name":"CMMI-DEV ML3","issuer":"CMMI Institute","expires":null},{"name":"ISO 9001:2015","issuer":"ISO","expires":null}]'::jsonb,
    '[{"name":"GSA MAS","number":"47QRCA25DU127","expires":null}]'::jsonb,
    ARRAY['C5ISR','cybersecurity','XR/VR/AR','AI/ML','ATC','tactical_comms','SETA'],
    'Reston, VA',
    NULL,
    NULL,
    ARRAY['DoD','Army','Army C5ISR','PEO C3T','Air Force'],
    'Envision Innovative Solutions is a Service-Disabled Veteran-Owned Small Business (SDVOSB) specializing in C5ISR, cybersecurity, and emerging technology solutions for DoD and intelligence community customers.'
  ),
  (
    'pd_systems',
    'PD Systems, Inc.',
    'legacy',
    NULL, -- TODO: Shawn to populate via /admin/companies
    NULL, -- TODO: Shawn to populate via /admin/companies
    NULL, -- TODO: Shawn to populate
    '{}',
    '{}',
    '{}',
    '[]'::jsonb,
    '[]'::jsonb,
    '{}',
    NULL, -- TODO: Shawn to populate
    NULL,
    NULL,
    '{}',
    'PD Systems — stub record. Populate via /admin/companies before staging deploy.'
  ),
  (
    'riverstone',
    'Riverstone',
    'legacy',
    NULL, -- TODO: Shawn to populate via /admin/companies
    NULL, -- TODO: Shawn to populate via /admin/companies
    NULL, -- TODO: Shawn to populate
    '{}',
    '{}',
    '{}',
    '[]'::jsonb,
    '[]'::jsonb,
    '{}',
    NULL, -- TODO: Shawn to populate
    NULL,
    NULL,
    '{}',
    'Riverstone — stub record. Populate via /admin/companies before staging deploy.'
  ),
  (
    'newco',
    'NewCo (Envision + PD Systems + Riverstone)',
    'merging',
    NULL,
    NULL,
    NULL,
    '{}',
    '{}',
    '{}',
    '[]'::jsonb,
    '[]'::jsonb,
    '{}',
    NULL,
    NULL,
    NULL,
    '{}',
    'Combined entity post-merger. Capabilities, certifications, and vehicles will be consolidated from all three legacy entities once merger is finalized.'
  )
ON CONFLICT (entity_id) DO NOTHING;
