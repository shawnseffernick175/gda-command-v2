-- Task orders — the executable contracts (TOs, delivery orders, standalone primes)
-- IDIQs stay in contract_vehicles as capacity/reference; task orders are what runs on the waterfall.
CREATE TABLE IF NOT EXISTS task_orders (
  id SERIAL PRIMARY KEY,
  to_name TEXT NOT NULL,
  to_number TEXT NOT NULL,
  parent_vehicle_id BIGINT REFERENCES contract_vehicles(id),
  parent_vehicle_short_name TEXT,
  prime_or_sub TEXT NOT NULL CHECK (prime_or_sub IN ('PRIME', 'SUB')),
  customer_agency TEXT,
  contracting_office TEXT,
  pop_start DATE,
  pop_end DATE,
  base_pop_end DATE,
  option_periods JSONB,
  total_ceiling NUMERIC,
  funded_to_date NUMERIC,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closeout', 'expired', 'awarded_not_started')),
  cpars_status TEXT,
  source_vault_doc_id INTEGER REFERENCES vault_documents(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_orders_pop_end ON task_orders(pop_end);
CREATE INDEX IF NOT EXISTS idx_task_orders_parent ON task_orders(parent_vehicle_id);
CREATE INDEX IF NOT EXISTS idx_task_orders_status ON task_orders(status);

-- Seed CEO's actual book of work (17 task orders: 11 primes + 6 subs)
-- Parent vehicle IDs reference contract_vehicles seeded in v3_059

-- PRIMES under RS3
INSERT INTO task_orders (to_name, to_number, parent_vehicle_id, parent_vehicle_short_name, prime_or_sub, customer_agency, contracting_office, status, total_ceiling, funded_to_date, notes)
SELECT 'DEVCOM C5ISR Readiness Tech Insertion (PRD)', 'W15P7T21F0209',
       cv.id, 'RS3', 'PRIME', 'U.S. Army DEVCOM', 'ACC-APG', 'active', 65200000, NULL,
       'Source: Vault ID 120 / CEO portfolio spreadsheet'
FROM contract_vehicles cv WHERE cv.short_name = 'RS3' LIMIT 1;

INSERT INTO task_orders (to_name, to_number, parent_vehicle_id, parent_vehicle_short_name, prime_or_sub, customer_agency, contracting_office, status, total_ceiling, funded_to_date, notes)
SELECT 'PEO IEW&S HQ SETA', 'W56KGY22F0028',
       cv.id, 'RS3', 'PRIME', 'U.S. Army PEO IEW&S', 'PEO IEW&S', 'active', 58000000, 25600000,
       'Source: Vault ID 120 — funded $25.6M of $58M ceiling'
FROM contract_vehicles cv WHERE cv.short_name = 'RS3' LIMIT 1;

INSERT INTO task_orders (to_name, to_number, parent_vehicle_id, parent_vehicle_short_name, prime_or_sub, customer_agency, contracting_office, status, total_ceiling, funded_to_date, notes)
SELECT 'CECOM SEC IEW&S AFPS', 'W56JSR23F0038',
       cv.id, 'RS3', 'PRIME', 'U.S. Army CECOM SEC', 'CECOM SEC', 'active', 20200000, NULL,
       'Source: Vault ID 120 — recompete risk, expiring soon'
FROM contract_vehicles cv WHERE cv.short_name = 'RS3' LIMIT 1;

INSERT INTO task_orders (to_name, to_number, parent_vehicle_id, parent_vehicle_short_name, prime_or_sub, customer_agency, contracting_office, status, total_ceiling, funded_to_date, notes)
SELECT 'Soldier Tactical/Expeditionary Power (STEP)', 'W56KGU23F0016',
       cv.id, 'RS3', 'PRIME', 'U.S. Army', 'ACC-APG', 'active', 77200000, NULL,
       'Source: Vault ID 120 — recompete RFP 4 Sep 2026'
FROM contract_vehicles cv WHERE cv.short_name = 'RS3' LIMIT 1;

-- FORCE — CEO hand-corrected dates
INSERT INTO task_orders (to_name, to_number, parent_vehicle_id, parent_vehicle_short_name, prime_or_sub, customer_agency, contracting_office, pop_start, pop_end, status, total_ceiling, funded_to_date, notes)
SELECT 'FORCE', 'W56KGU26FA010',
       cv.id, 'RS3', 'PRIME', 'USMC', 'ACC-APG',
       '2026-07-15'::DATE, '2032-01-14'::DATE, 'awarded_not_started', 107300000, 0,
       'Source: CEO hand-corrected PoP. Vault ID 120.'
FROM contract_vehicles cv WHERE cv.short_name = 'RS3' LIMIT 1;

-- PRIME under ECS PM TRASYS (TRAYSYS in our DB)
INSERT INTO task_orders (to_name, to_number, parent_vehicle_id, parent_vehicle_short_name, prime_or_sub, customer_agency, contracting_office, status, total_ceiling, funded_to_date, notes)
SELECT 'PM MC Product Support', '47QFMA23F0008',
       cv.id, 'TRAYSYS', 'PRIME', 'U.S. Army PM MC', 'PEO C3T', 'active', 30500000, NULL,
       'Source: Vault ID 119'
FROM contract_vehicles cv WHERE cv.short_name = 'TRAYSYS' LIMIT 1;

-- Standalone commercial primes (no parent IDIQ)
INSERT INTO task_orders (to_name, to_number, parent_vehicle_id, parent_vehicle_short_name, prime_or_sub, customer_agency, status, total_ceiling, notes) VALUES
  ('Exelon Future of Learning', 'STANDALONE-EXELON', NULL, NULL, 'PRIME', 'Exelon', 'active', NULL, 'Commercial / Non-IDIQ prime'),
  ('Hamilton Buhl AR Elements', 'STANDALONE-HAMILTON', NULL, NULL, 'PRIME', 'Hamilton Buhl', 'active', NULL, 'Commercial / Non-IDIQ prime'),
  ('Brookdale CC AR Medical Ventilator', 'STANDALONE-BROOKDALE', NULL, NULL, 'PRIME', 'Brookdale CC', 'active', NULL, 'Commercial / Non-IDIQ prime'),
  ('AOC Emancipation Hall AR', 'STANDALONE-AOC', NULL, NULL, 'PRIME', 'Architect of the Capitol', 'active', NULL, 'Commercial / Non-IDIQ prime'),
  ('Bricklayers BACNJ MR App', 'STANDALONE-BACNJ', NULL, NULL, 'PRIME', 'Bricklayers BAC NJ', 'active', NULL, 'Commercial / Non-IDIQ prime');

-- SUBS (parent IDIQ is external — not in our contract_vehicles table)
INSERT INTO task_orders (to_name, to_number, parent_vehicle_id, parent_vehicle_short_name, prime_or_sub, customer_agency, status, total_ceiling, notes) VALUES
  ('PM IS&A Ft. Hood', 'SUB-PMISA', NULL, 'Sev1Tech IDIQ', 'SUB', 'U.S. Army', 'active', NULL, 'Sub to Sev1Tech'),
  ('Megatron II', 'SUB-MEGATRON', NULL, 'CACI IDIQ', 'SUB', 'U.S. Army', 'active', NULL, 'Sub to CACI'),
  ('CSIA Avengers', 'SUB-CSIA', NULL, 'CACI IDIQ', 'SUB', 'U.S. Army', 'active', NULL, 'Sub to CACI'),
  ('C5ISR Tech & Ops', 'SUB-C5ISR', NULL, 'Nakupuna IDIQ', 'SUB', 'U.S. Army', 'active', NULL, 'Sub to Nakupuna'),
  ('Fort Worth Micro-Weather', 'SUB-MICROWEATHER', NULL, 'TruWeather IDIQ', 'SUB', 'U.S. Air Force', 'active', NULL, 'Sub to TruWeather'),
  ('BAH partial', 'SUB-BAH', NULL, 'BAH IDIQ', 'SUB', 'DoD', 'active', NULL, 'Sub to Booz Allen Hamilton');
