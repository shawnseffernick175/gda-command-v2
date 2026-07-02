-- F-309: Sentinel Handoff Monitor — event store for plain-language summaries
-- Every plumbing failure, success, or upcoming-break creates a sentinel_event
-- that gets summarized into plain English by the agent.

CREATE TABLE IF NOT EXISTS sentinel_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    TEXT NOT NULL CHECK (event_type IN ('handoff', 'win', 'break', 'info')),
  severity      TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  source_key    TEXT,                       -- e.g. 'govtribe', 'govwin', 'sam.gov', 'auth', 'cron'
  title         TEXT NOT NULL,              -- plain-language title (no jargon)
  context       TEXT,                       -- one-line plain-language context
  action_label  TEXT,                       -- e.g. "Top up credits", "Rotate secret"
  action_url    TEXT,                       -- link for the action button
  raw_event     JSONB,                      -- original event JSON for "show details" disclosure
  resolved_at   TIMESTAMPTZ,               -- NULL = open; set when resolved
  due_by        TIMESTAMPTZ,               -- optional deadline for handoff items
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sentinel_events_type_open ON sentinel_events (event_type, created_at DESC)
  WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sentinel_events_recent ON sentinel_events (created_at DESC);
