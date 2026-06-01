-- V3 Migration 019: Decision Memory + PWin Model tables (F-302)
--
-- Creates:
--   1. agent_decisions — every qualify/kill/team/win/loss decision with rationale
--   2. pwin_features   — feature vector snapshots for scored opportunities
--   3. pwin_outcomes   — win/loss labels joined to features for training
--   4. pwin_model_versions — versioned PWin models (rules → logistic → XGB)
--
-- Idempotent: uses IF NOT EXISTS on tables and indices.
-- Reversible: see DOWN section at bottom (commented).

-- 1. agent_decisions
CREATE TABLE IF NOT EXISTS agent_decisions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          TEXT NOT NULL,
  entity_kind   TEXT NOT NULL,
  entity_id     UUID NOT NULL,
  rationale     TEXT NOT NULL CHECK (rationale <> ''),
  evidence_refs JSONB NOT NULL DEFAULT '[]',
  doctrine_alignment_score INT,
  exclusion_triggers       JSONB,
  margin_check             JSONB,
  made_by       TEXT NOT NULL,
  made_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome       TEXT,
  outcome_recorded_at   TIMESTAMPTZ,
  outcome_evidence_refs JSONB,
  parent_decision_id UUID REFERENCES agent_decisions(id),
  agent_run_id       UUID,
  CONSTRAINT agent_decisions_kind_check CHECK (
    kind = ANY (ARRAY[
      'qualify','kill','pass','bid','no_bid',
      'team_with','avoid_team','win','loss',
      'withdraw','exclusion_override'
    ])
  ),
  CONSTRAINT agent_decisions_entity_kind_check CHECK (
    entity_kind = ANY (ARRAY[
      'opportunity','pursuit','capture','partner',
      'document','pipeline_item'
    ])
  ),
  CONSTRAINT agent_decisions_outcome_check CHECK (
    outcome IS NULL OR outcome = ANY (ARRAY['won','lost','withdrawn','no_award'])
  )
);

CREATE INDEX IF NOT EXISTS agent_decisions_entity
  ON agent_decisions(entity_kind, entity_id);
CREATE INDEX IF NOT EXISTS agent_decisions_made_at
  ON agent_decisions(made_at DESC);
CREATE INDEX IF NOT EXISTS agent_decisions_outcome
  ON agent_decisions(outcome) WHERE outcome IS NOT NULL;

-- 2. pwin_features
CREATE TABLE IF NOT EXISTS pwin_features (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL,
  features       JSONB NOT NULL,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pwin_features_opp
  ON pwin_features(opportunity_id, computed_at DESC);

-- 3. pwin_outcomes
CREATE TABLE IF NOT EXISTS pwin_outcomes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id      UUID NOT NULL,
  feature_snapshot_id UUID REFERENCES pwin_features(id),
  outcome             TEXT NOT NULL CHECK (outcome = ANY (ARRAY['won','lost','no_award'])),
  outcome_value       NUMERIC,
  decision_id         UUID REFERENCES agent_decisions(id),
  recorded_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. pwin_model_versions
CREATE TABLE IF NOT EXISTS pwin_model_versions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version                  TEXT NOT NULL UNIQUE,
  model_kind               TEXT NOT NULL CHECK (model_kind = ANY (ARRAY['rules','logistic','xgboost'])),
  trained_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  trained_on_outcomes_count INT,
  feature_schema           JSONB NOT NULL,
  model_blob               BYTEA,
  rules_config             JSONB,
  metrics                  JSONB,
  is_active                BOOLEAN DEFAULT FALSE,
  notes                    TEXT
);

-- Only one active version at a time
CREATE UNIQUE INDEX IF NOT EXISTS pwin_one_active
  ON pwin_model_versions(is_active) WHERE is_active = TRUE;

-- Seed v1 rules-based model as active
INSERT INTO pwin_model_versions (
  id, version, model_kind, trained_at, trained_on_outcomes_count,
  feature_schema, rules_config, is_active, notes
)
VALUES (
  gen_random_uuid(),
  'v1-rules',
  'rules',
  now(),
  0,
  '{
    "vehicle": "string",
    "has_vehicle_access": "boolean",
    "vehicle_set_aside": "string",
    "agency": "string",
    "sub_agency": "string",
    "is_existing_customer": "boolean",
    "naics": "string",
    "ceiling_value_m": "number",
    "is_recompete": "boolean",
    "is_incumbent": "boolean",
    "incumbent_competitor": "string",
    "scope_match_score": "number",
    "days_to_rfp_release": "number",
    "days_to_proposal_due": "number",
    "is_under_continuing_resolution": "boolean",
    "core_offering_match": "array",
    "clearance_required": "string",
    "clearance_fit": "boolean",
    "doctrine_alignment_score": "number",
    "exclusion_triggered": "boolean",
    "exclusion_ids": "array",
    "expected_margin_pct": "number",
    "below_margin_floor": "boolean",
    "needs_teaming_partner": "boolean",
    "candidate_partners": "array",
    "named_competitors_count": "number",
    "competitor_incumbency_rate": "number",
    "similar_awards_count": "number",
    "avg_similar_award_value_m": "number"
  }'::jsonb,
  '{
    "base": 30,
    "incumbency_bonus": 30,
    "capability_match_weight": 0.3,
    "vehicle_access_bonus": 10,
    "vehicle_no_access_penalty": -15,
    "clearance_fit_bonus": 5,
    "clearance_no_fit_penalty": -10,
    "doctrine_max_bonus": 10,
    "margin_floor_penalty": -20,
    "teaming_with_partners_bonus": 5,
    "teaming_no_partners_penalty": -10
  }'::jsonb,
  TRUE,
  'Initial rules-based PWin scorer — F-302'
)
ON CONFLICT (version) DO NOTHING;

-- === DOWN (rollback) ===
-- BEGIN;
-- DROP TABLE IF EXISTS pwin_outcomes;
-- DROP TABLE IF EXISTS pwin_model_versions;
-- DROP TABLE IF EXISTS pwin_features;
-- DROP TABLE IF EXISTS agent_decisions;
-- COMMIT;
