-- Migration 036: Vehicle Classification (W1)
-- Adds procurement vehicle type classification to opportunities
-- and a reference table for vehicle metadata.

-- Reference table for procurement vehicle types
CREATE TABLE IF NOT EXISTS procurement_vehicles (
  key          TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  description  TEXT,
  category     TEXT NOT NULL DEFAULT 'other',
  sort_order   INT NOT NULL DEFAULT 99,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add vehicle_type column to opportunities
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS vehicle_type TEXT;

-- Seed standard GovCon procurement vehicle types
INSERT INTO procurement_vehicles (key, label, description, category, sort_order) VALUES
  ('idiq',          'IDIQ',                   'Indefinite Delivery, Indefinite Quantity contract', 'contract', 1),
  ('bpa',           'BPA',                    'Blanket Purchase Agreement',                        'agreement', 2),
  ('gsa_schedule',  'GSA Schedule',           'GSA Multiple Award Schedule (MAS)',                 'schedule', 3),
  ('gwac',          'GWAC',                   'Government-Wide Acquisition Contract',              'contract', 4),
  ('full_and_open', 'Full & Open',            'Full and open competition',                         'competition', 5),
  ('set_aside_sb',  'Set-Aside (SB)',         'Small Business set-aside',                          'set_aside', 6),
  ('set_aside_8a',  'Set-Aside (8a)',         'SBA 8(a) Business Development program',             'set_aside', 7),
  ('set_aside_hubzone', 'Set-Aside (HUBZone)', 'Historically Underutilized Business Zones',        'set_aside', 8),
  ('set_aside_sdvosb', 'Set-Aside (SDVOSB)',  'Service-Disabled Veteran-Owned Small Business',     'set_aside', 9),
  ('set_aside_wosb', 'Set-Aside (WOSB)',      'Women-Owned Small Business',                        'set_aside', 10),
  ('sole_source',   'Sole Source',            'Non-competitive sole source award',                  'competition', 11),
  ('task_order',    'Task Order',             'Task/delivery order off existing vehicle',           'order', 12),
  ('other',         'Other',                  'Other procurement method',                           'other', 13)
ON CONFLICT (key) DO NOTHING;

-- Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_opportunities_vehicle_type ON opportunities(vehicle_type) WHERE vehicle_type IS NOT NULL;
