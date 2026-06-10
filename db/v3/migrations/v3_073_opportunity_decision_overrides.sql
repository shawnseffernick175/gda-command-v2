CREATE TABLE opportunity_decision_overrides (
  id                  BIGSERIAL PRIMARY KEY,
  opportunity_id      BIGINT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  field_name          TEXT NOT NULL,
  ai_value            TEXT,
  ai_confidence       NUMERIC,
  ai_evidence         JSONB,
  ai_model_version    TEXT,
  ai_generated_at     TIMESTAMPTZ,
  human_value         TEXT NOT NULL,
  set_by              TEXT NOT NULL DEFAULT 'admin',
  reason              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT opportunity_decision_overrides_field_name_check
    CHECK (field_name IN ('grade', 'pipeline_stage')),
  CONSTRAINT opportunity_decision_overrides_reason_length
    CHECK (reason IS NULL OR char_length(reason) <= 500)
);

CREATE INDEX idx_opp_decision_overrides_opp
  ON opportunity_decision_overrides(opportunity_id);
CREATE INDEX idx_opp_decision_overrides_field_created
  ON opportunity_decision_overrides(field_name, created_at DESC);
CREATE INDEX idx_opp_decision_overrides_ai_value
  ON opportunity_decision_overrides(field_name, ai_value, human_value);
