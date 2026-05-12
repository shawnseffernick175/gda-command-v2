-- Risk Register table
CREATE TABLE IF NOT EXISTS risk_register (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT REFERENCES opportunities(id),
  opportunity_title TEXT,
  category TEXT NOT NULL DEFAULT 'technical',
  if_statement TEXT NOT NULL,
  then_statement TEXT NOT NULL,
  likelihood TEXT NOT NULL DEFAULT 'medium',
  impact TEXT NOT NULL DEFAULT 'medium',
  risk_score NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  mitigation_plan TEXT,
  mitigation_owner TEXT,
  trigger_indicators TEXT[] DEFAULT '{}',
  contingency_plan TEXT,
  due_date DATE,
  data_source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_register_status ON risk_register(status);
CREATE INDEX IF NOT EXISTS idx_risk_register_opp ON risk_register(opportunity_id);

-- Company Profile table
CREATE TABLE IF NOT EXISTS company_profile (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dba TEXT,
  cage_code TEXT,
  uei TEXT,
  duns TEXT,
  revenue NUMERIC,
  employees INTEGER,
  naics_codes TEXT[] DEFAULT '{}',
  psc_codes TEXT[] DEFAULT '{}',
  capabilities TEXT[] DEFAULT '{}',
  past_performance TEXT[] DEFAULT '{}',
  set_aside_types TEXT[] DEFAULT '{}',
  address_city TEXT,
  address_state TEXT,
  address_country TEXT DEFAULT 'US',
  website TEXT,
  contract_vehicles TEXT[] DEFAULT '{}',
  certifications TEXT[] DEFAULT '{}',
  core_competencies TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed company profile: Envision Innovative Solutions
INSERT INTO company_profile (id, name, cage_code, uei, revenue, employees, naics_codes, capabilities, past_performance, set_aside_types, address_city, address_state, website, contract_vehicles, certifications, core_competencies)
VALUES (
  'company-001',
  'Envision Innovative Solutions',
  '8NPE5',
  'QLF5M4BNKBC5',
  382000000,
  41,
  '{"541512","541519","541611","541715","541330","541990","518210","561611"}',
  '{"IT Modernization","Cybersecurity","Cloud Migration","Data Analytics","AI/ML","Systems Engineering","Program Management","DevSecOps"}',
  '{"DoD SETA Support","Army Cyber Command","DISA Network Operations","NAVAIR Systems Engineering"}',
  '{"SDVOSB","Small Business"}',
  'San Antonio',
  'TX',
  'https://envisioninnovativesolutions.com',
  '{"GSA MAS","OASIS+","CIO-SP3","ITES-3S","ASTRO"}',
  '{"ISO 27001","CMMI Level 3","ISO 9001","FedRAMP"}',
  '{"Cybersecurity Operations","IT Service Management","Systems Integration","Digital Transformation","Intelligence Analysis","Cloud Infrastructure"}'
)
ON CONFLICT (id) DO NOTHING;

-- Risk register seed data is in seed.ts (after opportunities are inserted) to avoid FK violations on fresh installs
