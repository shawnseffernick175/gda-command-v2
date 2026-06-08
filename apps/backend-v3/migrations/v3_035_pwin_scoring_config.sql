-- F-453: Tunable Pwin scoring weights
CREATE TABLE pwin_scoring_config (
  id BIGSERIAL PRIMARY KEY,
  config_key TEXT NOT NULL UNIQUE DEFAULT 'default',
  weights JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with defaults matching current rules-scorer hardcoded values
INSERT INTO pwin_scoring_config (config_key, weights) VALUES ('default', '{
  "base": 30,
  "incumbency_bonus": 30,
  "recompete_bonus": 8,
  "capability_match_multiplier": 0.3,
  "vehicle_access": 10,
  "clearance_fit": 5,
  "doctrine_bonus_max": 10,
  "margin_penalty": -20,
  "teaming_bonus": 5,
  "teaming_penalty": -10,
  "naics_small_setaside": 20,
  "naics_small_fullopen": 10,
  "existing_customer": 5
}');
