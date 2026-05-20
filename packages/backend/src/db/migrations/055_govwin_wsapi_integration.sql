-- GovWin WSAPI integration: rate-limit call log + updateDate dedup column + feed config
-- Part of F-006: Replace broken iq.govwin.com/neo/api/v1 with services.govwin.com/neo-ws WSAPI

-- Rate-limit tracking: rolling 60-minute window, halt at 3,000/hour (75% of 4,000 org cap)
CREATE TABLE IF NOT EXISTS govwin_call_log (
  id SERIAL PRIMARY KEY,
  endpoint TEXT NOT NULL,
  called_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_govwin_call_log_called_at
  ON govwin_call_log (called_at DESC);

-- 7-day retention is plenty for rate-limit tracking
-- Cleanup handled by: DELETE FROM govwin_call_log WHERE called_at < NOW() - INTERVAL '7 days'

-- Store GovWin's updateDate per opportunity for incremental sync dedup
-- When updateDate matches stored value, skip extended sub-calls (saves 6-12 API calls per opp)
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS govwin_update_date TEXT;

-- Update gov_source_feeds for govwin: enable it, set role=primary, sync_freshness_hours=36
UPDATE gov_source_feeds
  SET enabled = true,
      role = 'primary',
      sync_freshness_hours = 36
  WHERE source = 'govwin';
