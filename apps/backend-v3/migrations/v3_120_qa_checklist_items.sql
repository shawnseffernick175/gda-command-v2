-- QA Checklist backend: table for tracking QA checklist items.
-- No seed rows — fresh deploy returns zero rows.

CREATE TABLE IF NOT EXISTS qa_checklist_items (
  id              SERIAL PRIMARY KEY,
  page_area       TEXT NOT NULL,
  problem_summary TEXT NOT NULL,
  category        TEXT NOT NULL,
  severity        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued',
  github_issue    TEXT,
  github_pr       TEXT,
  evidence_note   TEXT,
  verified_live   BOOLEAN NOT NULL DEFAULT FALSE,
  last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_seed         BOOLEAN NOT NULL DEFAULT FALSE
);
