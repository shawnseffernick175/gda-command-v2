-- F-878: Scoring & Doctrine — wheelhouse_config table + pwin audit columns
BEGIN;

-- 1. Wheelhouse config singleton
CREATE TABLE IF NOT EXISTS wheelhouse_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  naics_allowlist TEXT[] NOT NULL DEFAULT '{}',
  agency_allowlist TEXT[] NOT NULL DEFAULT '{}',
  dollar_min BIGINT NOT NULL DEFAULT 100000,
  dollar_max BIGINT NOT NULL DEFAULT 500000000,
  setasides_pursued TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by BIGINT REFERENCES users(id)
);

INSERT INTO wheelhouse_config (id, naics_allowlist, agency_allowlist, setasides_pursued)
VALUES (1,
  ARRAY['541330','541611','541612','541614','541615','541618','541620','541690','541713','541714','541715','541720','541990','561499','561611','611512'],
  ARRAY['DoD-Army','DoD-Navy','DoD-Air Force','DoD-USMC','DoD-SOCOM','DoD-DLA','DHS','DOJ','DOE','VA','NASA','DOS','USAID'],
  ARRAY['8(a)','SDVOSB','WOSB','HUBZone','Small Business']
) ON CONFLICT (id) DO NOTHING;

-- 2. Pwin scoring config audit columns
ALTER TABLE pwin_scoring_config
  ADD COLUMN IF NOT EXISTS updated_by BIGINT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS previous_weights JSONB;

COMMIT;
