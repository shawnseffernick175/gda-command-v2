-- F-311: Financial Bible — Manual Upload, PD-SYS 4-File Format, Envision-OU Scoped
-- Canonical pricing source: rates, indirects, ODCs/escalation, priced-pursuit history.
-- Every upload is versioned; one active version at a time; rollback supported.

-- Version envelope — one row per upload batch
CREATE TABLE IF NOT EXISTS financial_bible_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by   TEXT NOT NULL,
  notes         TEXT,
  active        BOOLEAN NOT NULL DEFAULT FALSE,
  format_version TEXT NOT NULL DEFAULT '1.0',
  source_files  JSONB NOT NULL,
  validation_errors JSONB,
  summary_stats JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bible_versions_active ON financial_bible_versions (active) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_bible_versions_uploaded ON financial_bible_versions (uploaded_at DESC);

-- Labor rates by category, clearance, effective date range
CREATE TABLE IF NOT EXISTS financial_rates (
  version_id     UUID NOT NULL REFERENCES financial_bible_versions(id) ON DELETE CASCADE,
  labor_category TEXT NOT NULL,
  clearance      TEXT NOT NULL,
  rate           NUMERIC NOT NULL,
  effective_from DATE NOT NULL,
  effective_to   DATE,
  PRIMARY KEY (version_id, labor_category, clearance, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_bible_rates_lookup ON financial_rates (labor_category, clearance);

-- Indirect rates by contract type
CREATE TABLE IF NOT EXISTS financial_indirects (
  version_id     UUID NOT NULL REFERENCES financial_bible_versions(id) ON DELETE CASCADE,
  contract_type  TEXT NOT NULL,
  fringe_pct     NUMERIC NOT NULL,
  overhead_pct   NUMERIC NOT NULL,
  ga_pct         NUMERIC NOT NULL,
  fee_band_low   NUMERIC NOT NULL,
  fee_band_high  NUMERIC NOT NULL,
  PRIMARY KEY (version_id, contract_type)
);

-- ODC categories + annual escalation tables
CREATE TABLE IF NOT EXISTS financial_odc_escalation (
  version_id     UUID NOT NULL REFERENCES financial_bible_versions(id) ON DELETE CASCADE,
  category       TEXT NOT NULL,
  base_year      INT NOT NULL,
  base_amount    NUMERIC NOT NULL DEFAULT 0,
  escalation_pct NUMERIC NOT NULL DEFAULT 0,
  notes          TEXT,
  PRIMARY KEY (version_id, category, base_year)
);

-- Historical priced pursuits with outcomes
CREATE TABLE IF NOT EXISTS financial_history (
  version_id   UUID NOT NULL REFERENCES financial_bible_versions(id) ON DELETE CASCADE,
  pursuit_id   TEXT NOT NULL,
  agency       TEXT,
  outcome      TEXT CHECK (outcome IN ('won','lost','no_bid','withdrew')),
  bid_price    NUMERIC,
  winner_price NUMERIC,
  notes        TEXT,
  PRIMARY KEY (version_id, pursuit_id)
);

-- Pricing scenarios built from active Bible version
CREATE TABLE IF NOT EXISTS pricing_scenarios (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bible_version_id  UUID NOT NULL REFERENCES financial_bible_versions(id),
  opportunity_id    INT,
  capture_id        INT,
  title             TEXT NOT NULL,
  labor_mix         JSONB NOT NULL DEFAULT '[]',
  period_months     INT NOT NULL DEFAULT 12,
  indirect_rates    JSONB,
  total_direct      NUMERIC NOT NULL DEFAULT 0,
  total_indirect    NUMERIC NOT NULL DEFAULT 0,
  total_odc         NUMERIC NOT NULL DEFAULT 0,
  total_cost        NUMERIC NOT NULL DEFAULT 0,
  fee_pct           NUMERIC NOT NULL DEFAULT 0,
  fee_amount        NUMERIC NOT NULL DEFAULT 0,
  total_price       NUMERIC NOT NULL DEFAULT 0,
  margin_pct        NUMERIC NOT NULL DEFAULT 0,
  doctrine_pass     BOOLEAN NOT NULL DEFAULT TRUE,
  doctrine_notes    TEXT,
  created_by        TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_scenarios_opp ON pricing_scenarios (opportunity_id) WHERE opportunity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pricing_scenarios_capture ON pricing_scenarios (capture_id) WHERE capture_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pricing_scenarios_version ON pricing_scenarios (bible_version_id);
