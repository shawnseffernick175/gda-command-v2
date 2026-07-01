-- F-306: Capability Catalog + Opportunity Capability Matching
-- Envision (OU3) capability catalog is the primary qualification gate.
-- Riverstone (OU2) and PD Systems (OU1) are read-only teaming context.

-- Capability catalog: one row per service offering per OU
CREATE TABLE IF NOT EXISTS capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ou text NOT NULL CHECK (ou IN ('envision','riverstone','pd_systems')),
  name text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  naics_codes text[] NOT NULL DEFAULT '{}',
  psc_codes text[] NOT NULL DEFAULT '{}',
  agencies_strong_in text[] NOT NULL DEFAULT '{}',
  past_performance_doc_ids uuid[] NOT NULL DEFAULT '{}',
  key_personnel uuid[] NOT NULL DEFAULT '{}',
  certifications text[] NOT NULL DEFAULT '{}',
  evidence_grade text CHECK (evidence_grade IN ('A','B','C')),
  active boolean NOT NULL DEFAULT true,
  last_reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Per-opportunity capability match scores
CREATE TABLE IF NOT EXISTS opportunity_capability_matches (
  opportunity_id uuid NOT NULL,
  capability_id uuid NOT NULL REFERENCES capabilities(id) ON DELETE CASCADE,
  match_score numeric NOT NULL CHECK (match_score >= 0 AND match_score <= 1),
  match_reasons jsonb NOT NULL DEFAULT '[]',
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (opportunity_id, capability_id)
);

CREATE INDEX IF NOT EXISTS idx_capabilities_ou ON capabilities(ou) WHERE active;
CREATE INDEX IF NOT EXISTS idx_capabilities_active ON capabilities(active) WHERE active;
CREATE INDEX IF NOT EXISTS idx_opp_cap_matches_opp ON opportunity_capability_matches(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opp_cap_matches_score ON opportunity_capability_matches(match_score DESC);
