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

-- Seed risk register entries
INSERT INTO risk_register (id, opportunity_id, opportunity_title, category, if_statement, then_statement, likelihood, impact, risk_score, status, mitigation_plan, mitigation_owner, trigger_indicators, due_date)
VALUES
  ('risk-001', 'opp-001', 'IEWS SETA Support', 'competitive', 'If incumbent (Leidos) submits aggressive pricing', 'Then our cost proposal may be non-competitive despite technical superiority', 'high', 'high', 20, 'open', 'Develop competitive pricing model with past performance justification; identify cost efficiencies from existing tools', 'Capture Manager', '{"Leidos hires additional BD staff","Leidos wins related SETA contract","Industry day attendance suggests strong incumbent presence"}', '2026-06-15'),
  ('risk-002', 'opp-003', 'Cyber Training Range', 'technical', 'If the government requires FedRAMP High authorization', 'Then timeline extends 6-9 months and compliance costs increase by $500K+', 'medium', 'high', 15, 'mitigating', 'Pre-position FedRAMP documentation; partner with authorized cloud provider; begin ATO package early', 'Technical Lead', '{"RFP mentions FedRAMP High","Draft SOW references cloud security requirements","Agency issues FedRAMP memo"}', '2026-07-01'),
  ('risk-003', 'opp-002', 'Next-Gen Network Monitoring', 'schedule', 'If key personnel are unavailable during proposal period', 'Then proposal quality degrades and win probability drops by 15-20%', 'medium', 'medium', 12, 'open', 'Identify backup SMEs; pre-write technical sections; maintain proposal-ready resumes', 'HR Director', '{"Team member gives notice","Conflicting proposal deadlines","Key personnel assigned to active project surge"}', '2026-05-30'),
  ('risk-004', NULL, NULL, 'regulatory', 'If CMMC 2.0 Level 2 certification is delayed beyond Q3 2026', 'Then company is ineligible for 40% of target DoD opportunities requiring CMMC compliance', 'low', 'high', 10, 'mitigating', 'Accelerate CMMC assessment prep; engage C3PAO early; conduct gap analysis monthly', 'CISO', '{"C3PAO scheduling delays","NIST SP 800-171 assessment gaps found","CUI handling deficiencies identified"}', '2026-09-01'),
  ('risk-005', 'opp-005', 'Data Analytics Platform', 'teaming', 'If teaming partner (small business) loses its set-aside eligibility', 'Then joint venture structure becomes invalid and re-proposal is required', 'low', 'medium', 6, 'accepted', 'Monitor partner SBA status quarterly; maintain backup teaming arrangements; structure agreements with contingency clauses', 'Contracts Manager', '{"Partner revenue exceeds size standard","SBA re-certification fails","Partner acquired by large business"}', '2026-08-15'),
  ('risk-006', 'opp-004', 'Cloud Migration Services', 'cost', 'If cloud infrastructure costs increase more than 15% year-over-year', 'Then fixed-price contract margins erode below breakeven within 18 months', 'medium', 'medium', 9, 'open', 'Include escalation clauses in proposal; negotiate reserved capacity pricing; build 10% cost contingency', 'Finance Director', '{"AWS/Azure announce price increases","Spot instance pricing volatility exceeds 20%","Government adds new compliance requirements increasing compute needs"}', '2026-06-30'),
  ('risk-007', NULL, NULL, 'past_performance', 'If CPARS rating drops below Satisfactory on current DISA contract', 'Then past performance evaluation scores decrease across all new proposals', 'low', 'high', 10, 'mitigating', 'Conduct monthly performance reviews with COR; address all issues within 48 hours; maintain CPARS-ready documentation', 'Program Manager', '{"COR raises performance concern","Deliverable rejected","SLA breach occurs"}', '2026-12-31')
ON CONFLICT (id) DO NOTHING;
