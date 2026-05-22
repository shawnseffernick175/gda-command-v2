-- Migration 081: Create gda_wargames table.
-- Part of F-023c: ADOPT shadow table from n8n-envision-postgres-1.
-- Wargaming scenarios — 1 row, 2 consumers
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS gda_wargames (
  id SERIAL PRIMARY KEY,
  opp_id TEXT,
  opp_title TEXT,
  solicitation_number TEXT,
  scenario_name TEXT NOT NULL,
  scenario_type TEXT DEFAULT 'Competitive'::text,
  our_strategy TEXT,
  competitor_1_name TEXT,
  competitor_1_strategy TEXT,
  competitor_1_strengths TEXT,
  competitor_1_weaknesses TEXT,
  competitor_2_name TEXT,
  competitor_2_strategy TEXT,
  competitor_2_strengths TEXT,
  competitor_2_weaknesses TEXT,
  competitor_3_name TEXT,
  competitor_3_strategy TEXT,
  evaluation_criteria TEXT,
  our_win_themes TEXT,
  our_discriminators TEXT,
  ghost_themes TEXT,
  risk_factors TEXT,
  recommended_actions TEXT,
  pwin_before INTEGER,
  pwin_after INTEGER,
  ai_analysis TEXT,
  status TEXT DEFAULT 'Draft'::text,
  created_by TEXT DEFAULT 'GDA'::text,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

