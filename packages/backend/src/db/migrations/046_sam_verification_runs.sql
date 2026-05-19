-- Migration 046: SAM verification runs table (F-004 closure)
-- Stores daily automated verify → backfill → verify results so they're
-- visible on a GDA surface (QA Center).

CREATE TABLE IF NOT EXISTS sam_verification_runs (
  id             TEXT PRIMARY KEY,
  ran_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  days_checked   INT NOT NULL,
  sam_count      INT NOT NULL,
  db_count_before INT NOT NULL,
  db_count_after  INT,
  gap_before_pct NUMERIC(5,2) NOT NULL,
  gap_after_pct  NUMERIC(5,2),
  backfill_ran   BOOLEAN NOT NULL DEFAULT FALSE,
  backfill_fetched INT,
  backfill_upserted INT,
  backfill_errors  INT,
  status         TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'error')),
  error_message  TEXT,
  duration_ms    INT
);
