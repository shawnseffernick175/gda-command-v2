-- F-306: Capability Matching + Auto-Qualify Against OU3 (Envision) Offerings
-- Creates capabilities catalog and opportunity_capability_matches tables.

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

CREATE INDEX IF NOT EXISTS idx_capabilities_ou ON capabilities (ou);
CREATE INDEX IF NOT EXISTS idx_capabilities_active ON capabilities (active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_capabilities_category ON capabilities (category);

CREATE TABLE IF NOT EXISTS opportunity_capability_matches (
  opportunity_id text NOT NULL,
  capability_id uuid NOT NULL REFERENCES capabilities(id) ON DELETE CASCADE,
  match_score numeric NOT NULL CHECK (match_score >= 0 AND match_score <= 1),
  match_reasons jsonb NOT NULL DEFAULT '[]',
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (opportunity_id, capability_id)
);

CREATE INDEX IF NOT EXISTS idx_opp_cap_matches_opp ON opportunity_capability_matches (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opp_cap_matches_score ON opportunity_capability_matches (match_score DESC);
