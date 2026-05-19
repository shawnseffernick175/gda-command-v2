-- Mark gov source feeds as deprecated when their API is no longer available.
-- F-005: GovTribe API was deprecated in 2023; DIBBS has no real API.

ALTER TABLE gov_source_feeds
  ADD COLUMN IF NOT EXISTS deprecated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deprecation_reason TEXT;

-- Disable and mark GovTribe as deprecated
UPDATE gov_source_feeds
  SET enabled = false,
      deprecated_at = NOW(),
      deprecation_reason = 'GovTribe API was deprecated in 2023 and is no longer accessible (see docs.govtribe.com)'
  WHERE id = 'feed-govtribe';

-- Disable and mark DIBBS as deprecated (no real API — was a website scrape)
UPDATE gov_source_feeds
  SET enabled = false,
      deprecated_at = NOW(),
      deprecation_reason = 'DIBBS has no public JSON API — the integration was a website scrape that produced placeholder records, not real opportunity data'
  WHERE id = 'feed-dibbs';
