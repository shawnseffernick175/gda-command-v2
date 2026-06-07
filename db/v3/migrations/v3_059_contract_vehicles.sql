-- Contract vehicles Envision holds task order authority under
CREATE TABLE IF NOT EXISTS contract_vehicles (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,                -- e.g. "Army RS3"
  short_name    TEXT NOT NULL,                -- e.g. "RS3"
  contract_number TEXT,                       -- e.g. "W15P7T-19-D-0094"
  vehicle_type  TEXT NOT NULL DEFAULT 'IDIQ', -- IDIQ | BPA | GWAC | FSS | SBIR
  agency        TEXT,                         -- "Army" / "Navy" / "GSA"
  naics_primary TEXT,                         -- primary NAICS for the vehicle
  expiration_date DATE,
  ceiling_value NUMERIC,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_contract_vehicles_active ON contract_vehicles(is_active);
CREATE INDEX idx_contract_vehicles_short_name ON contract_vehicles(short_name);

-- Link table: opportunities detected as task orders under a vehicle
CREATE TABLE IF NOT EXISTS opportunity_vehicle_links (
  id              BIGSERIAL PRIMARY KEY,
  opportunity_id  BIGINT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  vehicle_id      BIGINT NOT NULL REFERENCES contract_vehicles(id) ON DELETE CASCADE,
  match_type      TEXT NOT NULL DEFAULT 'keyword', -- 'keyword' | 'contract_number' | 'manual'
  match_evidence  TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(opportunity_id, vehicle_id)
);

CREATE INDEX idx_opp_vehicle_links_opp ON opportunity_vehicle_links(opportunity_id);
CREATE INDEX idx_opp_vehicle_links_vehicle ON opportunity_vehicle_links(vehicle_id);

-- Seed Envision's known vehicles
INSERT INTO contract_vehicles (name, short_name, contract_number, vehicle_type, agency, naics_primary) VALUES
  ('Army Responsive Strategic Sourcing for Services', 'RS3', 'W15P7T-19-D-0094', 'IDIQ', 'Army', '541715'),
  ('Seaport Next Generation', 'Seaport NxG', 'N00178-19-D-8276', 'IDIQ', 'Navy', '541330'),
  ('GSA Multiple Award Schedule', 'GSA MAS', 'GS35F0222Y', 'FSS', 'GSA', '541511'),
  ('GSA OASIS Small Business Pool 1', 'OASIS SB Pool 1', NULL, 'GWAC', 'GSA', '541330'),
  ('GSA OASIS Small Business Pool 3', 'OASIS SB Pool 3', NULL, 'GWAC', 'GSA', '541511'),
  ('FAA eFAST', 'eFAST', NULL, 'IDIQ', 'FAA', '541330'),
  ('Army EAGLE', 'EAGLE', 'W52P1J-17-G-0062', 'IDIQ', 'Army', '541512'),
  ('Army TSS-E', 'TSS-E', 'W911S0-18-D-0006', 'IDIQ', 'Army', '541990'),
  ('CIO-SP3 Small Business', 'CIO-SP3 SB', NULL, 'GWAC', 'NIH/HHS', '541511'),
  ('CIO-SP3 8(a)', 'CIO-SP3 8(a)', NULL, 'GWAC', 'NIH/HHS', '541511'),
  ('USMC PM TRAYSYS', 'TRAYSYS', NULL, 'IDIQ', 'USMC', '541715');
