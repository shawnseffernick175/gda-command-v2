-- F-312: Partner Profiles — Riverstone + PD Systems Read-Only Teaming Context
CREATE TABLE IF NOT EXISTS partner_profiles (
  ou TEXT PRIMARY KEY CHECK (ou IN ('riverstone','pd_systems')),
  name TEXT NOT NULL,
  owner UUID NOT NULL,
  overview TEXT NOT NULL,
  agencies_of_strength TEXT[] NOT NULL DEFAULT '{}',
  naics_codes TEXT[] NOT NULL DEFAULT '{}',
  capabilities_summary JSONB NOT NULL DEFAULT '[]',
  past_performance_summary JSONB NOT NULL DEFAULT '[]',
  key_personnel JSONB NOT NULL DEFAULT '[]',
  certifications TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
