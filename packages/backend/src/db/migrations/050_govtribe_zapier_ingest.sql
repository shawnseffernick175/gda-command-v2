-- Tier 1 GovTribe Zapier integration: schema additions for ingest pipeline.
-- Adds columns for AI summary, incumbent confidence/source tracking,
-- and a new gov_source_feed entry for the Zapier-based integration.

-- 1. Add ai_summary column (GovTribe provides AI-generated summaries)
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS ai_summary TEXT;

-- 2. Add incumbent enrichment tracking columns
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS incumbent_confidence TEXT
  CHECK (incumbent_confidence IN ('high', 'medium', 'low'));
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS incumbent_source TEXT
  CHECK (incumbent_source IN ('sam_award', 'usaspending_exact', 'usaspending_fuzzy', 'govtribe_mcp', 'manual'));

-- 3. Add data_source value for GovTribe Zapier path
-- (data_source column already exists from migration 010)

-- 4. Add GovTribe Zapier feed to gov_source_feeds for Source Health tracking
INSERT INTO gov_source_feeds (id, source, name, base_url, search_params)
VALUES (
  'feed-govtribe-zapier',
  'govtribe_zapier',
  'GovTribe Saved Searches (via Zapier)',
  'https://govtribe.com',
  '{"integration": "zapier", "tier": 1, "credit_cost": 0, "polling_interval_minutes": 2}'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  base_url = EXCLUDED.base_url,
  search_params = EXCLUDED.search_params;
