-- Migration 038: Merger Context (W4)
-- Company entities with parent/subsidiary relationships, M&A event tracking,
-- and merger-aware opportunity impact analysis.

-- Track M&A events in the GovCon landscape
CREATE TABLE IF NOT EXISTS mergers_acquisitions (
  id TEXT PRIMARY KEY,
  acquirer_name TEXT NOT NULL,
  target_name TEXT NOT NULL,
  deal_type TEXT NOT NULL DEFAULT 'acquisition'
    CHECK (deal_type IN ('acquisition', 'merger', 'divestiture', 'joint_venture', 'strategic_alliance')),
  status TEXT NOT NULL DEFAULT 'announced'
    CHECK (status IN ('announced', 'pending', 'completed', 'blocked', 'withdrawn')),
  announced_date DATE,
  closed_date DATE,
  deal_value NUMERIC,
  rationale TEXT,
  impact_summary TEXT,
  affected_naics TEXT[] DEFAULT '{}',
  affected_agencies TEXT[] DEFAULT '{}',
  our_impact TEXT DEFAULT 'neutral'
    CHECK (our_impact IN ('positive', 'negative', 'neutral', 'monitor')),
  score_adjustment INT DEFAULT 0,
  source_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link M&A events to affected opportunities
CREATE TABLE IF NOT EXISTS merger_opp_impacts (
  id TEXT PRIMARY KEY,
  merger_id TEXT NOT NULL REFERENCES mergers_acquisitions(id) ON DELETE CASCADE,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  impact_type TEXT NOT NULL DEFAULT 'neutral'
    CHECK (impact_type IN ('competitor_strengthened', 'competitor_weakened', 'new_teaming', 'lost_teaming', 'incumbent_change', 'neutral')),
  description TEXT,
  score_delta INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merger_id, opportunity_id)
);

CREATE INDEX IF NOT EXISTS idx_ma_status ON mergers_acquisitions(status);
CREATE INDEX IF NOT EXISTS idx_ma_our_impact ON mergers_acquisitions(our_impact);
CREATE INDEX IF NOT EXISTS idx_merger_opp_merger ON merger_opp_impacts(merger_id);
CREATE INDEX IF NOT EXISTS idx_merger_opp_opp ON merger_opp_impacts(opportunity_id);

-- Seed example M&A events relevant to GovCon
INSERT INTO mergers_acquisitions (id, acquirer_name, target_name, deal_type, status, announced_date, closed_date, deal_value, rationale, impact_summary, affected_naics, affected_agencies, our_impact, score_adjustment) VALUES
  ('ma-001', 'Leidos', 'Dynetics', 'acquisition', 'completed', '2024-01-15', '2024-06-01', 1650000000, 'Expand hypersonics and space capabilities', 'Leidos strengthened in defense R&D; potential threat on SETA contracts', ARRAY['541330','541715'], ARRAY['DoD','MDA','Army'], 'monitor', 0),
  ('ma-002', 'SAIC', 'Halfaker and Associates', 'acquisition', 'completed', '2024-03-10', '2024-07-15', 320000000, 'Expand health IT and federal civilian capabilities', 'SAIC now stronger competitor in VA/HHS IT modernization', ARRAY['541511','541512'], ARRAY['VA','HHS'], 'negative', -5),
  ('ma-003', 'Booz Allen Hamilton', 'EverWatch', 'acquisition', 'completed', '2024-02-01', '2024-05-20', 440000000, 'Strengthen signals intelligence capabilities', 'BAH gained SIGINT expertise; increased competition for IC contracts', ARRAY['541511','541519'], ARRAY['NSA','NGA','CIA'], 'negative', -3),
  ('ma-004', 'KBR', 'LinQuest', 'acquisition', 'completed', '2024-04-20', '2024-09-01', 305000000, 'Expand space and defense analytics', 'KBR stronger in space domain; watch for Space Force competition', ARRAY['541330','541715'], ARRAY['Space Force','DoD'], 'monitor', 0),
  ('ma-005', 'Peraton', 'Perspecta', 'acquisition', 'completed', '2023-05-01', '2023-12-15', 7100000000, 'Create major defense IT services player', 'Peraton now top-10 defense contractor; direct competitor in IT services', ARRAY['541511','541512','541519'], ARRAY['DoD','IC','DHS'], 'negative', -5)
ON CONFLICT (id) DO NOTHING;
