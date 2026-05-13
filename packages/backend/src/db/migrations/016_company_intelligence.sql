-- Company Intelligence: classification + AI analysis for competitor_profiles
-- classification: team (teaming partner), threat (competitor), neutral (watch list)

ALTER TABLE competitor_profiles
  ADD COLUMN IF NOT EXISTS classification TEXT NOT NULL DEFAULT 'neutral'
    CHECK (classification IN ('team', 'threat', 'neutral'));

ALTER TABLE competitor_profiles
  ADD COLUMN IF NOT EXISTS ai_analysis JSONB;

ALTER TABLE competitor_profiles
  ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;

-- Gov source feed configuration for multi-source auto-pull
CREATE TABLE IF NOT EXISTS gov_source_feeds (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,  -- sam_gov, fpds, govwin, govtribe, usaspending, dibbs
  name TEXT NOT NULL,
  base_url TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  search_params JSONB DEFAULT '{}',
  last_sync_at TIMESTAMPTZ,
  last_sync_count INT DEFAULT 0,
  error_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default gov source feeds
INSERT INTO gov_source_feeds (id, source, name, base_url, search_params) VALUES
  ('feed-sam-gov', 'sam_gov', 'SAM.gov Opportunities', 'https://api.sam.gov/opportunities/v2/search', '{"naics": ["541511","541512","541519","541330","541611","541690"], "keywords": ["SETA","cybersecurity","C5ISR","IT support","systems engineering"]}'),
  ('feed-fpds', 'fpds', 'FPDS Contract Awards', 'https://www.fpds.gov/ezsearch/LATEST/BASIC', '{"naics": ["541511","541512","541519"], "keywords": ["SETA","cybersecurity","C5ISR"]}'),
  ('feed-govwin', 'govwin', 'GovWin IQ Opportunities', NULL, '{"categories": ["IT Services","Cybersecurity","Systems Engineering"]}'),
  ('feed-govtribe', 'govtribe', 'GovTribe Requirements', 'https://api.govtribe.com/opportunity', '{"keywords": ["SETA","cybersecurity","C5ISR","innovation factory"]}'),
  ('feed-usaspending', 'usaspending', 'USAspending Awards', 'https://api.usaspending.gov/api/v2/search/spending_by_award', '{"naics": ["541511","541512","541519"]}'),
  ('feed-dibbs', 'dibbs', 'DLA DIBBS', 'https://www.dibbs.bsm.dla.mil', '{"keywords": ["IT","cyber","electronics"]}')
ON CONFLICT (id) DO NOTHING;
