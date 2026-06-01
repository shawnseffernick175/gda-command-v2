-- V3 Migration 027: GovTribe Saved Search Runs + Ledger Extensions (F-318)
--
-- Adds per-run tracking for individual saved searches (rate-limit gate)
-- and extends govtribe_credit_ledger with dry_run, caller, saved_search_id.
-- Forward-only.

BEGIN;

-- ============================================================================
-- govtribe_saved_search_runs — tracks each execution for rate-limit gating
-- ============================================================================
CREATE TABLE IF NOT EXISTS govtribe_saved_search_runs (
  id              BIGSERIAL     PRIMARY KEY,
  saved_search_id TEXT          NOT NULL,
  caller          TEXT          NOT NULL DEFAULT 'system',
  dry_run         BOOLEAN       NOT NULL DEFAULT FALSE,
  credits_used    INTEGER       NOT NULL DEFAULT 0,
  rows_fetched    INTEGER       NOT NULL DEFAULT 0,
  rows_inserted   INTEGER       NOT NULL DEFAULT 0,
  rows_updated    INTEGER       NOT NULL DEFAULT 0,
  status          TEXT          NOT NULL DEFAULT 'success'
                                CHECK (status IN ('success', 'error', 'throttled', 'dry_run')),
  error_text      TEXT,
  started_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_govtribe_ss_runs_search_id
  ON govtribe_saved_search_runs (saved_search_id, created_at DESC);

-- ============================================================================
-- govtribe_credit_ledger — add dry_run, caller, saved_search_id columns
-- ============================================================================
ALTER TABLE govtribe_credit_ledger
  ADD COLUMN IF NOT EXISTS dry_run BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE govtribe_credit_ledger
  ADD COLUMN IF NOT EXISTS caller TEXT;

ALTER TABLE govtribe_credit_ledger
  ADD COLUMN IF NOT EXISTS saved_search_id TEXT;

COMMIT;
