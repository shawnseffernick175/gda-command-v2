-- F-311: Financial Bible — PD-SYS 4-file upload, Envision-OU scoped

-- Version history for each upload batch
CREATE TABLE IF NOT EXISTS financial_bible_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  uploaded_by   text NOT NULL,
  notes         text,
  active        boolean NOT NULL DEFAULT false,
  format_version text NOT NULL DEFAULT '1.0',
  source_files  jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_warnings jsonb DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_fb_versions_active
  ON financial_bible_versions (active) WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_fb_versions_uploaded
  ON financial_bible_versions (uploaded_at DESC);

-- Labor category rates (from 01_Rates.xlsx)
CREATE TABLE IF NOT EXISTS financial_rates (
  version_id      uuid NOT NULL REFERENCES financial_bible_versions(id) ON DELETE CASCADE,
  labor_category  text NOT NULL,
  clearance       text NOT NULL,
  rate            numeric NOT NULL,
  effective_from  date NOT NULL,
  effective_to    date,
  PRIMARY KEY (version_id, labor_category, clearance, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_fb_rates_version
  ON financial_rates (version_id);

-- Indirect rate pools (from 02_Indirects.xlsx)
CREATE TABLE IF NOT EXISTS financial_indirects (
  version_id      uuid NOT NULL REFERENCES financial_bible_versions(id) ON DELETE CASCADE,
  contract_type   text NOT NULL,
  fringe_pct      numeric NOT NULL,
  overhead_pct    numeric NOT NULL,
  ga_pct          numeric NOT NULL,
  fee_band_low    numeric NOT NULL,
  fee_band_high   numeric NOT NULL,
  PRIMARY KEY (version_id, contract_type)
);

-- ODCs and escalation tables (from 03_ODCs_Escalation.xlsx)
CREATE TABLE IF NOT EXISTS financial_odc_escalation (
  version_id      uuid NOT NULL REFERENCES financial_bible_versions(id) ON DELETE CASCADE,
  category        text NOT NULL,
  description     text,
  base_cost       numeric NOT NULL DEFAULT 0,
  escalation_year int NOT NULL DEFAULT 2026,
  escalation_pct  numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (version_id, category, escalation_year)
);

CREATE INDEX IF NOT EXISTS idx_fb_odc_version
  ON financial_odc_escalation (version_id);

-- Past priced pursuits (from 04_History_Priced.xlsx)
CREATE TABLE IF NOT EXISTS financial_history (
  version_id    uuid NOT NULL REFERENCES financial_bible_versions(id) ON DELETE CASCADE,
  pursuit_id    text NOT NULL,
  agency        text,
  outcome       text CHECK (outcome IN ('won','lost','no_bid','withdrew')),
  bid_price     numeric,
  winner_price  numeric,
  notes         text,
  PRIMARY KEY (version_id, pursuit_id)
);

-- Pricing scenarios built from Bible data
CREATE TABLE IF NOT EXISTS pricing_scenarios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id      uuid NOT NULL REFERENCES financial_bible_versions(id) ON DELETE CASCADE,
  opportunity_id  bigint REFERENCES opportunities(id) ON DELETE SET NULL,
  capture_id      bigint REFERENCES captures(id) ON DELETE SET NULL,
  title           text NOT NULL,
  labor_mix       jsonb NOT NULL DEFAULT '[]'::jsonb,
  odc_items       jsonb NOT NULL DEFAULT '[]'::jsonb,
  contract_type   text,
  period_months   int NOT NULL DEFAULT 12,
  total_cost      numeric NOT NULL DEFAULT 0,
  total_price     numeric NOT NULL DEFAULT 0,
  margin_pct      numeric NOT NULL DEFAULT 0,
  doctrine_pass   boolean NOT NULL DEFAULT true,
  notes           text,
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ps_opportunity
  ON pricing_scenarios (opportunity_id) WHERE opportunity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ps_capture
  ON pricing_scenarios (capture_id) WHERE capture_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ps_version
  ON pricing_scenarios (version_id);
