-- v3_102: Capture Review Engine — 6-color Shipley reviews + capture plans + milestones
-- F-868: CEO directive — "Capture page is THE place for every color review"
-- Adds: capture_plans, capture_milestones, color_reviews, color_review_reviewers,
--       color_review_sections, color_review_scores, color_review_compliance

-- ═══════════════════════════════════════════════════════════════════
-- 1. capture_plans — Shipley capture drivers (single source of Pwin)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS capture_plans (
  id SERIAL PRIMARY KEY,
  capture_id INTEGER NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Customer drivers
  customer_relationship_score SMALLINT CHECK (customer_relationship_score BETWEEN 1 AND 5),
  customer_relationship_notes TEXT,
  customer_budget_confirmed BOOLEAN DEFAULT FALSE,
  customer_funded_date DATE,

  -- Solution drivers
  solution_fit_score SMALLINT CHECK (solution_fit_score BETWEEN 1 AND 5),
  solution_differentiators TEXT,
  solution_risks TEXT,

  -- Competitive drivers
  competitive_position_score SMALLINT CHECK (competitive_position_score BETWEEN 1 AND 5),
  known_competitors JSONB DEFAULT '[]'::jsonb,
  ghosting_strategy TEXT,

  -- Pricing drivers
  ptw_estimate NUMERIC,
  pricing_posture TEXT CHECK (pricing_posture IS NULL OR pricing_posture IN ('aggressive', 'balanced', 'premium')),
  margin_target NUMERIC,

  -- Past performance
  cpars_references JSONB DEFAULT '[]'::jsonb,
  team_required_pp_categories JSONB DEFAULT '[]'::jsonb,

  -- Teaming
  prime_or_sub TEXT CHECK (prime_or_sub IS NULL OR prime_or_sub IN ('PRIME', 'SUB')),
  teammates JSONB DEFAULT '[]'::jsonb,

  -- Computed Pwin
  computed_pwin NUMERIC,
  pwin_last_computed_at TIMESTAMPTZ,

  -- Forecastable is derived
  is_forecastable BOOLEAN GENERATED ALWAYS AS (
    customer_relationship_score IS NOT NULL
    AND solution_fit_score IS NOT NULL
    AND competitive_position_score IS NOT NULL
  ) STORED,

  CONSTRAINT uq_capture_plan_capture UNIQUE(capture_id)
);

CREATE INDEX IF NOT EXISTS idx_capture_plans_capture ON capture_plans(capture_id);

-- ═══════════════════════════════════════════════════════════════════
-- 2. capture_milestones — 90-day increments per capture
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS capture_milestones (
  id SERIAL PRIMARY KEY,
  capture_id INTEGER NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  milestone_name TEXT NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'complete', 'slipped')),
  owner_contact TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capture_milestones_capture ON capture_milestones(capture_id);
CREATE INDEX IF NOT EXISTS idx_capture_milestones_due ON capture_milestones(due_date);

-- ═══════════════════════════════════════════════════════════════════
-- 3. color_reviews — The 6-color review engine
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS color_reviews (
  id SERIAL PRIMARY KEY,
  capture_id INTEGER NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  proposal_vault_doc_id INTEGER REFERENCES vault_documents(id),
  rfp_vault_doc_id INTEGER REFERENCES vault_documents(id),
  color TEXT NOT NULL CHECK (color IN ('pink', 'red', 'black', 'blue', 'white', 'green')),
  scheduled_date DATE,
  completed_date DATE,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'complete', 'cancelled')),
  rubric TEXT NOT NULL DEFAULT 'shipley_5' CHECK (rubric IN ('shipley_5', 'numeric_5', 'pass_fail')),
  overall_color_rating TEXT CHECK (overall_color_rating IS NULL OR overall_color_rating IN ('Blue', 'Green', 'Yellow', 'Red', 'Pink')),
  overall_score NUMERIC,
  pwin_impact NUMERIC,
  report_vault_doc_id INTEGER REFERENCES vault_documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_color_reviews_capture ON color_reviews(capture_id);
CREATE INDEX IF NOT EXISTS idx_color_reviews_status ON color_reviews(status);
CREATE INDEX IF NOT EXISTS idx_color_reviews_color ON color_reviews(color);

-- ═══════════════════════════════════════════════════════════════════
-- 4. color_review_reviewers — who is reviewing
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS color_review_reviewers (
  id SERIAL PRIMARY KEY,
  review_id INTEGER NOT NULL REFERENCES color_reviews(id) ON DELETE CASCADE,
  reviewer_name TEXT NOT NULL,
  reviewer_email TEXT,
  role TEXT CHECK (role IS NULL OR role IN ('lead', 'technical', 'mgmt', 'past_perf', 'pricing', 'compliance')),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_color_review_reviewers_review ON color_review_reviewers(review_id);

-- ═══════════════════════════════════════════════════════════════════
-- 5. color_review_sections — eval factors mapped from RFP Section M
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS color_review_sections (
  id SERIAL PRIMARY KEY,
  review_id INTEGER NOT NULL REFERENCES color_reviews(id) ON DELETE CASCADE,
  section_name TEXT NOT NULL,
  section_m_criterion TEXT,
  section_l_requirement TEXT,
  rfp_text_excerpt TEXT,
  proposal_text_excerpt TEXT,
  weight_pct NUMERIC,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_color_review_sections_review ON color_review_sections(review_id);

-- ═══════════════════════════════════════════════════════════════════
-- 6. color_review_scores — per section per reviewer
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS color_review_scores (
  id SERIAL PRIMARY KEY,
  section_id INTEGER NOT NULL REFERENCES color_review_sections(id) ON DELETE CASCADE,
  reviewer_id INTEGER NOT NULL REFERENCES color_review_reviewers(id) ON DELETE CASCADE,
  score NUMERIC,
  color_rating TEXT CHECK (color_rating IS NULL OR color_rating IN ('Blue', 'Green', 'Yellow', 'Red', 'Pink')),
  strengths TEXT,
  weaknesses TEXT,
  recommendations TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (section_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_color_review_scores_section ON color_review_scores(section_id);
CREATE INDEX IF NOT EXISTS idx_color_review_scores_reviewer ON color_review_scores(reviewer_id);

-- ═══════════════════════════════════════════════════════════════════
-- 7. color_review_compliance — Section L shall tracking
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS color_review_compliance (
  id SERIAL PRIMARY KEY,
  review_id INTEGER NOT NULL REFERENCES color_reviews(id) ON DELETE CASCADE,
  shall_statement TEXT NOT NULL,
  rfp_reference TEXT,
  proposal_addressed_in TEXT,
  is_compliant BOOLEAN,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_color_review_compliance_review ON color_review_compliance(review_id);

-- ═══════════════════════════════════════════════════════════════════
-- 8. Add contract_revenue_value to captures for Pwin calc
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS contract_revenue_value NUMERIC;
