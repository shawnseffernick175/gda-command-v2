-- F-618: Prompt Creator — LLM Prompt Library
-- Tables for storing, versioning, and editing LLM prompts

CREATE TABLE IF NOT EXISTS prompt_library (
  id SERIAL PRIMARY KEY,
  prompt_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  surface TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT,
  variables JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prompt_versions (
  id SERIAL PRIMARY KEY,
  prompt_id INTEGER NOT NULL REFERENCES prompt_library(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT,
  changed_by TEXT NOT NULL DEFAULT 'admin',
  change_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prompt_surface ON prompt_library(surface);
CREATE INDEX IF NOT EXISTS idx_prompt_key ON prompt_library(prompt_key);

-- Seed core prompts
INSERT INTO prompt_library (prompt_key, display_name, description, surface, system_prompt, user_prompt_template, variables) VALUES
(
  'opportunity_analysis',
  'Opportunity Analysis',
  'AI analysis run at ingest for each opportunity',
  'opportunities',
  'You are a defense contracting intelligence analyst. Never fabricate facts, names, dollar amounts, or dates. If data is unavailable, say so explicitly. Write as a sharp defense contracting analyst briefing an executive. Be direct, specific, confident. No AI preamble, no hedging language, no bullet soup.',
  E'Analyze this government contracting opportunity for Envision (NAICS: 541511, 541512, 541519, 541690):\n\nTitle: {TITLE}\nAgency: {AGENCY}\nValue: {VALUE}\nDescription: {DESCRIPTION}\n\nReturn JSON with win_probability, win_probability_reasoning, shipley_bid_no_bid, competitive_landscape, source_chips.',
  '[{"name":"TITLE","description":"Opportunity title","example":"IT Support Services"},{"name":"AGENCY","description":"Issuing agency","example":"Army CECOM"},{"name":"VALUE","description":"Estimated value","example":"$2.5M"},{"name":"DESCRIPTION","description":"Opportunity description","example":"..."}]'
),
(
  'risk_generation',
  'Risk Generation',
  'AI-generated risks from opportunity scope',
  'risks',
  'You are a program risk analyst. Never fabricate facts, names, dollar amounts, or dates. Write as a sharp defense contracting analyst briefing an executive. Be direct, specific, confident.',
  E'Generate capture risks for this opportunity:\n\nTitle: {TITLE}\nAgency: {AGENCY}\nValue: {VALUE}\nDeadline: {DEADLINE}\n\nReturn a JSON array of risks with title, description, category, likelihood (1-5), impact (1-5), mitigation.',
  '[{"name":"TITLE","description":"Opportunity title"},{"name":"AGENCY","description":"Agency"},{"name":"VALUE","description":"Value"},{"name":"DEADLINE","description":"Response deadline"}]'
),
(
  'fast_track_triage',
  'Fast Track Triage',
  'Instant go/no-go grade for pasted opportunities',
  'fast_track',
  'You are a bid/no-bid analyst. Never fabricate facts, names, dollar amounts, or dates. Write as a sharp defense contracting analyst briefing an executive.',
  E'Grade this opportunity for Envision (NAICS: 541511, 541512, 541519):\n\nTitle: {TITLE}\nDescription: {DESCRIPTION}\nNAICS: {NAICS}\n\nReturn JSON with grade (A/B/C/D/F), naics_match_score (0-1), recommended_action, rationale.',
  '[{"name":"TITLE"},{"name":"DESCRIPTION"},{"name":"NAICS"}]'
),
(
  'competitor_black_hat',
  'Competitor Black Hat Analysis',
  'Black hat threat analysis for a competitor',
  'competitors',
  'You are a competitive intelligence analyst. Never fabricate facts, names, dollar amounts, or dates. Write as a sharp defense contracting analyst briefing an executive.',
  E'Run a black hat analysis on {COMPETITOR_NAME}, a government contractor with {WIN_COUNT} wins and ${TOTAL_OBLIGATED} total obligated.\n\nReturn JSON with likely_approach, strengths[], weaknesses[], counter_strategy, intel_summary.',
  '[{"name":"COMPETITOR_NAME"},{"name":"WIN_COUNT"},{"name":"TOTAL_OBLIGATED"}]'
),
(
  'daily_briefing',
  'Daily Briefing',
  'Executive daily intelligence brief',
  'briefing',
  'You are an intelligence analyst producing a daily defense market brief. Never fabricate facts, names, dollar amounts, or dates. Write as a sharp analyst briefing a senior executive.',
  E'Generate a daily defense market brief for Envision (defense IT, NAICS 541511/541512/541519).\n\nContext:\n{CONTEXT}\n\nReturn JSON with executive_summary, market_intel_summary, competitor_moves[], regulatory_flags[], opportunities_flagged[], recommended_actions[].',
  '[{"name":"CONTEXT","description":"Recent awards, signals, and market data"}]'
)
ON CONFLICT (prompt_key) DO NOTHING;
