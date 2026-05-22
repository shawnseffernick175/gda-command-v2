-- Migration 073: Create gda_win_loss table.
-- Part of F-023c: ADOPT shadow table from n8n-envision-postgres-1.
-- Win/loss analysis — 6 rows, 4 consumers
-- F-026 Step 3 will migrate data from n8n DB to gda_command using this schema.

CREATE TABLE IF NOT EXISTS gda_win_loss (
  id SERIAL PRIMARY KEY,
  opportunity_title TEXT NOT NULL,
  solicitation_number TEXT,
  agency TEXT,
  naics_code TEXT,
  set_aside TEXT,
  contract_value NUMERIC,
  decision_outcome TEXT,
  decision_date DATE DEFAULT CURRENT_DATE,
  winner TEXT,
  winning_price NUMERIC,
  our_price NUMERIC,
  debrief_summary TEXT,
  strengths TEXT[],
  weaknesses TEXT[],
  lessons_learned TEXT[],
  evaluation_factors JSONB,
  competitor_names TEXT[],
  teaming_partners TEXT[],
  gda_unit TEXT,
  capture_manager TEXT,
  proposal_lead TEXT,
  pwin_at_submission INTEGER,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

