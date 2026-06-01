BEGIN;

CREATE TABLE fast_track_assessments (
  id              BIGSERIAL     PRIMARY KEY,
  input_hash      TEXT          NOT NULL,
  title           TEXT          NOT NULL,
  description     TEXT          NOT NULL,
  naics_codes     TEXT[]        NOT NULL DEFAULT '{}',
  set_aside       TEXT,
  place_of_performance TEXT,
  grade           TEXT          NOT NULL CHECK (grade IN ('A', 'B', 'C')),
  rationale       TEXT          NOT NULL,
  naics_match_score NUMERIC     NOT NULL CHECK (naics_match_score >= 0 AND naics_match_score <= 100),
  recommended_action TEXT       NOT NULL CHECK (recommended_action IN ('pursue', 'watch', 'skip')),
  source_chips    JSONB         NOT NULL DEFAULT '[]',
  model_used      TEXT          NOT NULL,
  analysis_version TEXT         NOT NULL,
  generated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (input_hash, analysis_version)
);

CREATE INDEX idx_fast_track_input_hash  ON fast_track_assessments (input_hash);
CREATE INDEX idx_fast_track_generated   ON fast_track_assessments (generated_at DESC);
CREATE INDEX idx_fast_track_grade       ON fast_track_assessments (grade);

COMMIT;
