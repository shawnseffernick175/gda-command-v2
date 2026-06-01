-- V3 Migration 021: Decision Memory + PWin Model tables (F-302)
--
-- Extends:
--   1. agent_decisions (created by v3_018) — adds entity_kind/entity_id, outcome columns,
--      decision-memory fields, constraints, and indices for F-302 decision memory.
-- Creates:
--   2. pwin_features   — feature vector snapshots for scored opportunities
--   3. pwin_outcomes   — win/loss labels joined to features for training
--   4. pwin_model_versions — versioned PWin models (rules → logistic → XGB)
--
-- Idempotent: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS throughout.
-- Reversible: see DOWN section at bottom (commented).

-- 1. Extend agent_decisions (already created by v3_018_doctrine_rules.sql)
--    v3_018 schema: id, opportunity_id, kind, rationale, evidence_refs, decided_by, decided_at
--    F-302 adds: entity_kind, entity_id, made_by, made_at, outcome tracking, constraints, etc.

ALTER TABLE agent_decisions ADD COLUMN IF NOT EXISTS entity_kind TEXT;
ALTER TABLE agent_decisions ADD COLUMN IF NOT EXISTS entity_id UUID;
ALTER TABLE agent_decisions ADD COLUMN IF NOT EXISTS made_by TEXT;
ALTER TABLE agent_decisions ADD COLUMN IF NOT EXISTS made_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE agent_decisions ADD COLUMN IF NOT EXISTS doctrine_alignment_score INT;
ALTER TABLE agent_decisions ADD COLUMN IF NOT EXISTS exclusion_triggers JSONB;
ALTER TABLE agent_decisions ADD COLUMN IF NOT EXISTS margin_check JSONB;
ALTER TABLE agent_decisions ADD COLUMN IF NOT EXISTS outcome TEXT;
ALTER TABLE agent_decisions ADD COLUMN IF NOT EXISTS outcome_recorded_at TIMESTAMPTZ;
ALTER TABLE agent_decisions ADD COLUMN IF NOT EXISTS outcome_evidence_refs JSONB;
ALTER TABLE agent_decisions ADD COLUMN IF NOT EXISTS parent_decision_id UUID REFERENCES agent_decisions(id);
ALTER TABLE agent_decisions ADD COLUMN IF NOT EXISTS agent_run_id UUID;

-- Backfill entity_kind/entity_id from opportunity_id for existing rows
UPDATE agent_decisions
  SET entity_kind = 'opportunity',
      entity_id = opportunity_id,
      made_by = decided_by,
      made_at = decided_at
WHERE entity_kind IS NULL AND opportunity_id IS NOT NULL;

-- Add constraints (use DO block to make idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_decisions_kind_check') THEN
    ALTER TABLE agent_decisions ADD CONSTRAINT agent_decisions_kind_check CHECK (
      kind = ANY (ARRAY[
        'qualify','kill','pass','bid','no_bid',
        'team_with','avoid_team','win','loss',
        'withdraw','exclusion_override'
      ])
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_decisions_entity_kind_check') THEN
    ALTER TABLE agent_decisions ADD CONSTRAINT agent_decisions_entity_kind_check CHECK (
      entity_kind IS NULL OR entity_kind = ANY (ARRAY[
        'opportunity','pursuit','capture','partner',
        'document','pipeline_item'
      ])
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_decisions_outcome_check') THEN
    ALTER TABLE agent_decisions ADD CONSTRAINT agent_decisions_outcome_check CHECK (
      outcome IS NULL OR outcome = ANY (ARRAY['won','lost','withdrawn','no_award'])
    );
  END IF;
END $$;

-- Indices
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
-- DROP TABLE IF EXISTS pwin_outcomes;
-- DROP TABLE IF EXISTS pwin_model_versions;
-- DROP TABLE IF EXISTS pwin_features;
-- ALTER TABLE agent_decisions DROP COLUMN IF EXISTS entity_kind;
-- ALTER TABLE agent_decisions DROP COLUMN IF EXISTS entity_id;
-- ALTER TABLE agent_decisions DROP COLUMN IF EXISTS made_by;
-- ALTER TABLE agent_decisions DROP COLUMN IF EXISTS made_at;
-- ALTER TABLE agent_decisions DROP COLUMN IF EXISTS doctrine_alignment_score;
-- ALTER TABLE agent_decisions DROP COLUMN IF EXISTS exclusion_triggers;
-- ALTER TABLE agent_decisions DROP COLUMN IF EXISTS margin_check;
-- ALTER TABLE agent_decisions DROP COLUMN IF EXISTS outcome;
-- ALTER TABLE agent_decisions DROP COLUMN IF EXISTS outcome_recorded_at;
-- ALTER TABLE agent_decisions DROP COLUMN IF EXISTS outcome_evidence_refs;
-- ALTER TABLE agent_decisions DROP COLUMN IF EXISTS parent_decision_id;
-- ALTER TABLE agent_decisions DROP COLUMN IF EXISTS agent_run_id;
