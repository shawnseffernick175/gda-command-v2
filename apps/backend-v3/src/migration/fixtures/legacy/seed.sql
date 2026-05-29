-- Legacy V2 fixture data for CI migration-parity-check.
-- Represents a small representative subset of the 154 prod tables.

-- sam_opportunities (canonical feed)
CREATE TABLE IF NOT EXISTS sam_opportunities (
  id BIGSERIAL PRIMARY KEY,
  notice_id TEXT,
  solicitation_number TEXT,
  title TEXT NOT NULL,
  agency TEXT,
  sub_agency TEXT,
  status TEXT DEFAULT 'active',
  posted_date TIMESTAMPTZ,
  response_deadline TIMESTAMPTZ,
  naics TEXT,
  psc TEXT,
  set_aside TEXT,
  value NUMERIC,
  place_of_performance TEXT,
  description TEXT,
  source_url TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO sam_opportunities (id, notice_id, solicitation_number, title, agency, naics, set_aside, value, status, posted_date, response_deadline, description, source_url)
VALUES
  (1, 'SAM-001', 'SOL-2026-001', 'Army Logistics Support Services', 'Department of the Army', '541611', 'SBA', 5000000, 'active', '2026-01-15', '2026-06-15', 'Comprehensive logistics support for Army operations.', 'https://sam.gov/opp/SAM-001'),
  (2, 'SAM-002', 'SOL-2026-002', 'C5ISR Systems Engineering', 'Department of the Army', '541330', NULL, 12000000, 'active', '2026-02-01', '2026-07-01', 'Systems engineering for C5ISR modernization.', 'https://sam.gov/opp/SAM-002'),
  (3, 'SAM-003', 'SOL-2026-003', 'TRADOC Training Platform Development', 'Department of the Army', '611430', 'WOSB', 3000000, 'active', '2026-03-01', '2026-08-01', 'Develop immersive training platforms for TRADOC.', 'https://sam.gov/opp/SAM-003');

-- gda_opportunity_tracker (n8n shadow table)
CREATE TABLE IF NOT EXISTS gda_opportunity_tracker (
  id BIGSERIAL PRIMARY KEY,
  solicitation_number TEXT,
  title TEXT NOT NULL,
  agency TEXT,
  status TEXT,
  value_estimated NUMERIC,
  naics TEXT,
  source_url TEXT,
  tags TEXT[] DEFAULT '{}',
  analysis JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO gda_opportunity_tracker (id, solicitation_number, title, agency, status, value_estimated, naics, source_url, analysis)
VALUES
  (1, 'SOL-2026-004', 'USCG Cyber Security Assessment', 'US Coast Guard', 'qualified', 2000000, '541512', 'https://govtribe.com/opp/004', '{"pwin": 65, "pwin_sources": [{"kind": "govtribe", "title": "GovTribe Analysis", "url": "https://govtribe.com/opp/004", "retrieved_at": "2026-03-15T00:00:00Z"}], "incumbent": "Booz Allen", "incumbent_sources": [{"kind": "fpds", "title": "FPDS Award", "url": "https://fpds.gov/004", "retrieved_at": "2026-03-15T00:00:00Z"}], "competitors": [{"name": "Booz Allen", "threat_level": "high"}], "competitors_sources": [{"kind": "govtribe", "title": "GovTribe Competitors", "url": "https://govtribe.com/opp/004/competitors", "retrieved_at": "2026-03-15T00:00:00Z"}]}');

-- opportunities (legacy backend table)
CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  solicitation_number TEXT,
  title TEXT NOT NULL,
  agency TEXT,
  sub_agency TEXT,
  status TEXT DEFAULT 'discovery',
  value_estimated NUMERIC,
  value_min NUMERIC,
  value_max NUMERIC,
  naics TEXT,
  psc TEXT,
  set_aside TEXT,
  description TEXT,
  raw_source_url TEXT,
  data_source TEXT DEFAULT 'manual',
  incumbent TEXT,
  tags TEXT[] DEFAULT '{}',
  analysis JSONB,
  analysis_version TEXT,
  ai_analyzed_at TIMESTAMPTZ,
  qualified_at TIMESTAMPTZ,
  qualified_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO opportunities (id, solicitation_number, title, agency, status, value_min, naics, data_source, incumbent, raw_source_url)
VALUES
  ('legacy-001', 'SOL-2026-005', 'Navy Special Warfare Training', 'Department of the Navy', 'discovery', 1500000, '611430', 'manual', 'SAIC', 'https://sam.gov/opp/legacy-001');

-- gda_capture_plans
CREATE TABLE IF NOT EXISTS gda_capture_plans (
  id BIGSERIAL PRIMARY KEY,
  opportunity_id TEXT,
  title TEXT,
  capture_owner TEXT,
  status TEXT DEFAULT 'active',
  win_probability NUMERIC,
  win_prob_evidence TEXT,
  milestone_90day TEXT,
  analysis JSONB,
  analysis_version TEXT,
  ai_analyzed_at TIMESTAMPTZ,
  teaming_partners TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO gda_capture_plans (id, opportunity_id, capture_owner, status, win_probability, analysis, teaming_partners)
VALUES
  (1, 'legacy-001', 'Shawn', 'active', 55, '{"pwin": 55, "pwin_sources": [{"kind": "internal", "title": "Capture Analysis", "url": "/captures/1", "retrieved_at": "2026-04-01T00:00:00Z"}]}', '{"Riverstone"}'),
  (2, NULL, 'Shawn', 'active', NULL, NULL, '{}');

-- gda_action_items
CREATE TABLE IF NOT EXISTS gda_action_items (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  detail TEXT,
  owner TEXT DEFAULT 'Shawn',
  status TEXT DEFAULT 'open',
  due_date TIMESTAMPTZ,
  source TEXT DEFAULT 'manual',
  source_id TEXT,
  linked_record_type TEXT,
  linked_record_id TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO gda_action_items (id, title, detail, owner, status, due_date, source, linked_record_type, linked_record_id)
VALUES
  (1, 'Review CMMI ML3 renewal timeline', 'CMMI ML3 expires 8/7/2026 — coordinate with quality team', 'Shawn', 'open', '2026-06-15', 'manual', 'certification', 'cmmi-ml3'),
  (2, 'Request SHIELD task order capacity from Angela', NULL, 'Shawn', 'in_progress', '2026-07-01', 'email', NULL, NULL),
  (3, 'Completed item for testing', 'This was done already', 'Shawn', 'done', NULL, 'manual', NULL, NULL);

-- source_registry
CREATE TABLE IF NOT EXISTS source_registry (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT,
  name TEXT,
  base_url TEXT,
  last_synced_at TIMESTAMPTZ,
  confidence TEXT DEFAULT 'high',
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO source_registry (id, kind, name, base_url, confidence)
VALUES
  (1, 'sam_gov', 'SAM.gov', 'https://sam.gov', 'high'),
  (2, 'fpds', 'FPDS.gov', 'https://fpds.gov', 'high'),
  (3, 'govtribe', 'GovTribe', 'https://govtribe.com', 'medium');

-- gda_teaming_partners
CREATE TABLE IF NOT EXISTS gda_teaming_partners (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT,
  anchor_company TEXT,
  uei TEXT,
  cage TEXT,
  primary_naics TEXT,
  capabilities TEXT[] DEFAULT '{}',
  certifications JSONB DEFAULT '[]',
  vehicles JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO gda_teaming_partners (id, name, display_name, uei, cage, primary_naics, capabilities, certifications, vehicles)
VALUES
  (1, 'Riverstone Solutions', 'Riverstone', 'TECGLUBFP6N6', '71WX3', '541512', '{"TechSIGINT","Cyber Operations","HUBZone"}', '[{"name": "HUBZone", "status": "active"}]', '[{"name": "MDA SHIELD", "contract": "HQ085926DF469"}]'),
  (2, 'PD Systems', 'PD Systems', NULL, NULL, '611430', '{"XR/AR/VR Training","Digital Twin","LVC Integration"}', '[{"name": "V3 Veteran", "status": "active"}]', '[]');
