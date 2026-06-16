-- IDIQ Operations: vehicle enrichment + task order feed tables
-- Adds columns for pools/set-asides/NAICS/posting locations to contract_vehicles,
-- creates vehicle_to_sources (polling config) and task_order_announcements (TO feed).

-- 1. Enrich contract_vehicles with IDIQ ops data
ALTER TABLE contract_vehicles ADD COLUMN IF NOT EXISTS naics_codes TEXT[];
ALTER TABLE contract_vehicles ADD COLUMN IF NOT EXISTS to_posting_locations TEXT[];
ALTER TABLE contract_vehicles ADD COLUMN IF NOT EXISTS pools_held TEXT[];
ALTER TABLE contract_vehicles ADD COLUMN IF NOT EXISTS set_asides_held TEXT[];

-- 2. Per-vehicle TO ingestion source config
CREATE TABLE IF NOT EXISTS vehicle_to_sources (
  id SERIAL PRIMARY KEY,
  vehicle_id BIGINT NOT NULL REFERENCES contract_vehicles(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN (
    'sam_gov','gsa_ebuy','nitaac_egos','seaport_nxg_portal',
    'rs3_sharepoint','efast_ksn','digital_market_army','vendor_email','manual'
  )),
  source_url TEXT,
  source_config JSONB,
  requires_credential BOOLEAN DEFAULT FALSE,
  credential_ref TEXT,
  poll_interval_minutes INT DEFAULT 60,
  last_polled_at TIMESTAMPTZ,
  last_status TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_to_sources_vehicle ON vehicle_to_sources(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_to_sources_active ON vehicle_to_sources(is_active) WHERE is_active = TRUE;

-- 3. Task order announcements (canonical TO records)
CREATE TABLE IF NOT EXISTS task_order_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id BIGINT REFERENCES contract_vehicles(id),
  source_id INT REFERENCES vehicle_to_sources(id),
  external_id TEXT,
  title TEXT NOT NULL,
  agency TEXT,
  sub_agency TEXT,
  pool_or_lane TEXT,
  set_aside TEXT,
  naics_code TEXT,
  est_value_usd NUMERIC,
  posted_date DATE,
  questions_due DATE,
  response_due DATE,
  award_date DATE,
  awardee TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','awarded','cancelled')),
  description TEXT,
  source_url TEXT,
  attachments JSONB,
  envision_eligible BOOLEAN,
  eligibility_reason TEXT,
  wheelhouse_score NUMERIC,
  capture_id BIGINT REFERENCES captures(id),
  heat_tier TEXT NOT NULL DEFAULT 'watch' CHECK (heat_tier IN ('hot','eligible','watch','not_eligible')),
  not_pursuing_reason TEXT,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  ingested_via TEXT,
  UNIQUE(vehicle_id, external_id, source_id)
);

CREATE INDEX IF NOT EXISTS idx_toa_vehicle_status ON task_order_announcements(vehicle_id, status);
CREATE INDEX IF NOT EXISTS idx_toa_closes ON task_order_announcements(response_due) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_toa_eligible ON task_order_announcements(envision_eligible, status) WHERE envision_eligible = TRUE;
CREATE INDEX IF NOT EXISTS idx_toa_heat ON task_order_announcements(heat_tier) WHERE status = 'open';

-- 4. Backfill vehicle data for Envision's 16 vehicles
-- Update existing vehicles with pools/set-asides/NAICS/posting
UPDATE contract_vehicles SET
  naics_codes = ARRAY['541715','541330','541611','541690','611430','561210'],
  pools_held = ARRAY['RS3 SB'],
  set_asides_held = ARRAY['SB','SDB'],
  to_posting_locations = ARRAY['https://sam.gov','RS3 SharePoint (CAC)']
WHERE short_name = 'RS3';

UPDATE contract_vehicles SET
  naics_codes = ARRAY['541330','541611','541715','541512','541519'],
  pools_held = NULL,
  set_asides_held = ARRAY['SB','SDB'],
  to_posting_locations = ARRAY['https://www.seaport.navy.mil']
WHERE short_name = 'Seaport NxG';

UPDATE contract_vehicles SET
  naics_codes = ARRAY['541511','541512','541513','541519','541611','518210'],
  pools_held = NULL,
  set_asides_held = ARRAY['SB','SDB'],
  to_posting_locations = ARRAY['https://www.ebuy.gsa.gov']
WHERE short_name = 'GSA MAS';

UPDATE contract_vehicles SET
  naics_codes = ARRAY['541330','541611','541715','541720','541990','561210'],
  pools_held = ARRAY['OASIS SB Pool 1'],
  set_asides_held = ARRAY['SB','SDB'],
  to_posting_locations = ARRAY['https://www.ebuy.gsa.gov','https://sam.gov']
WHERE short_name = 'OASIS SB Pool 1';

UPDATE contract_vehicles SET
  naics_codes = ARRAY['541511','541512','541513','541519','518210'],
  pools_held = ARRAY['OASIS SB Pool 3'],
  set_asides_held = ARRAY['SB','SDB'],
  to_posting_locations = ARRAY['https://www.ebuy.gsa.gov','https://sam.gov']
WHERE short_name = 'OASIS SB Pool 3';

UPDATE contract_vehicles SET
  naics_codes = ARRAY['541330','541611','541690','541720','611430'],
  pools_held = NULL,
  set_asides_held = ARRAY['SB','SDB'],
  to_posting_locations = ARRAY['https://faast.faa.gov']
WHERE short_name = 'eFAST';

UPDATE contract_vehicles SET
  naics_codes = ARRAY['541512','541519','541330','541715'],
  pools_held = NULL,
  set_asides_held = ARRAY['SB','SDB'],
  to_posting_locations = ARRAY['https://sam.gov']
WHERE short_name = 'EAGLE';

UPDATE contract_vehicles SET
  naics_codes = ARRAY['541990','541330','541611','541715','611430'],
  pools_held = NULL,
  set_asides_held = ARRAY['SB','SDB'],
  to_posting_locations = ARRAY['https://sam.gov']
WHERE short_name = 'TSS-E';

UPDATE contract_vehicles SET
  naics_codes = ARRAY['541511','541512','541519','518210'],
  pools_held = ARRAY['CIO-SP3 SB'],
  set_asides_held = ARRAY['SB','SDB'],
  to_posting_locations = ARRAY['https://nitaac.nih.gov/services/cio-sp3']
WHERE short_name = 'CIO-SP3 SB';

UPDATE contract_vehicles SET
  naics_codes = ARRAY['541511','541512','541519','518210'],
  pools_held = ARRAY['CIO-SP3 8(a)'],
  set_asides_held = ARRAY['8(a)','SB','SDB'],
  to_posting_locations = ARRAY['https://nitaac.nih.gov/services/cio-sp3']
WHERE short_name = 'CIO-SP3 8(a)';

UPDATE contract_vehicles SET
  naics_codes = ARRAY['541715','541330','541990','611430'],
  pools_held = NULL,
  set_asides_held = ARRAY['SB','SDB'],
  to_posting_locations = ARRAY['https://sam.gov']
WHERE short_name = 'TRAYSYS';

-- Insert missing vehicles from the 16-vehicle portfolio
INSERT INTO contract_vehicles (name, short_name, contract_number, vehicle_type, agency, naics_primary, naics_codes, pools_held, set_asides_held, to_posting_locations, is_active)
VALUES
  ('GSA OASIS+ Small Business', 'OASIS+ SB', '47QRCA25DS088', 'GWAC', 'GSA', '541330',
   ARRAY['541330','541611','541715','541720','541990','541511','541512','541519','561210'],
   ARRAY['OASIS+ SB Pool 1','OASIS+ SB Pool 2'],
   ARRAY['SB','SDB'],
   ARRAY['https://www.ebuy.gsa.gov','https://sam.gov'],
   true),
  ('GSA OASIS+ Unrestricted', 'OASIS+ UR', '47QRCA25D0090', 'GWAC', 'GSA', '541330',
   ARRAY['541330','541611','541715','541720','541990','541511','541512','541519','561210'],
   ARRAY['OASIS+ UR Pool 1'],
   ARRAY['UR'],
   ARRAY['https://www.ebuy.gsa.gov','https://sam.gov'],
   true),
  ('GSA POLARIS Small Business', 'POLARIS SB', NULL, 'GWAC', 'GSA', '541512',
   ARRAY['541512','541511','541519','518210','541513'],
   ARRAY['POLARIS SB'],
   ARRAY['SB','SDB'],
   ARRAY['https://www.ebuy.gsa.gov','https://sam.gov'],
   true),
  ('MDA SHIELD', 'SHIELD', NULL, 'IDIQ', 'MDA', '541715',
   ARRAY['541715','541330','541512','541990'],
   NULL,
   ARRAY['SB','SDB'],
   ARRAY['https://sam.gov','https://piee.eb.mil'],
   true),
  ('Army MAPS', 'MAPS', NULL, 'IDIQ', 'Army', '541512',
   ARRAY['541512','541511','541519','518210'],
   NULL,
   ARRAY['SB','SDB'],
   ARRAY['https://sam.gov','https://digitalmarket.army.mil'],
   true)
ON CONFLICT DO NOTHING;

-- 5. Seed vehicle_to_sources for active polling
-- GSA eBuy sources (OASIS+ SB, OASIS+ UR, OASIS SB Pool 1, OASIS SB Pool 3, GSA MAS, POLARIS)
INSERT INTO vehicle_to_sources (vehicle_id, source_type, source_url, source_config, poll_interval_minutes, is_active)
SELECT cv.id, 'gsa_ebuy', 'https://www.ebuy.gsa.gov', jsonb_build_object('vehicle_filter', cv.short_name, 'contract_number', cv.contract_number), 60, true
FROM contract_vehicles cv
WHERE cv.short_name IN ('OASIS+ SB','OASIS+ UR','OASIS SB Pool 1','OASIS SB Pool 3','GSA MAS','POLARIS SB')
ON CONFLICT DO NOTHING;

-- SAM.gov sources (RS3, SHIELD, EAGLE, TSS-E, TRAYSYS, MAPS)
INSERT INTO vehicle_to_sources (vehicle_id, source_type, source_url, source_config, poll_interval_minutes, is_active)
SELECT cv.id, 'sam_gov', 'https://api.sam.gov/opportunities/v2/search', jsonb_build_object('vehicle_filter', cv.short_name, 'contract_number', cv.contract_number, 'agency', cv.agency), 60, true
FROM contract_vehicles cv
WHERE cv.short_name IN ('RS3','SHIELD','EAGLE','TSS-E','TRAYSYS','MAPS')
ON CONFLICT DO NOTHING;

-- NITAAC e-GOS (CIO-SP3 SB, CIO-SP3 8(a)) — manual/email ingest
INSERT INTO vehicle_to_sources (vehicle_id, source_type, source_url, source_config, requires_credential, poll_interval_minutes, is_active)
SELECT cv.id, 'nitaac_egos', 'https://nitaac.nih.gov/services/cio-sp3', jsonb_build_object('vehicle_filter', cv.short_name), false, 120, true
FROM contract_vehicles cv
WHERE cv.short_name IN ('CIO-SP3 SB','CIO-SP3 8(a)')
ON CONFLICT DO NOTHING;

-- CAC-gated sources (SeaPort NxG, eFAST) — manual only
INSERT INTO vehicle_to_sources (vehicle_id, source_type, source_url, requires_credential, credential_ref, poll_interval_minutes, is_active)
SELECT cv.id, 'seaport_nxg_portal', 'https://www.seaport.navy.mil', true, 'cac_required', 0, false
FROM contract_vehicles cv WHERE cv.short_name = 'Seaport NxG'
ON CONFLICT DO NOTHING;

INSERT INTO vehicle_to_sources (vehicle_id, source_type, source_url, requires_credential, credential_ref, poll_interval_minutes, is_active)
SELECT cv.id, 'efast_ksn', 'https://faast.faa.gov', true, 'cac_required', 0, false
FROM contract_vehicles cv WHERE cv.short_name = 'eFAST'
ON CONFLICT DO NOTHING;

-- RS3 SharePoint (CAC-gated) — deferred
INSERT INTO vehicle_to_sources (vehicle_id, source_type, source_url, requires_credential, credential_ref, poll_interval_minutes, is_active)
SELECT cv.id, 'rs3_sharepoint', 'RS3 SharePoint (CAC)', true, 'cac_required', 0, false
FROM contract_vehicles cv WHERE cv.short_name = 'RS3'
ON CONFLICT DO NOTHING;
