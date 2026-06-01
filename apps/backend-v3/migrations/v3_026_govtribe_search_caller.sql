-- V3 Migration 026: GovTribe Search + Caller Tracking (F-320)
--
-- Adds caller column to govtribe_credit_ledger so agent-v3 tool
-- invocations are distinguishable from backend scheduled ingest.
-- Forward-only.

BEGIN;

ALTER TABLE govtribe_credit_ledger
  ADD COLUMN IF NOT EXISTS caller TEXT DEFAULT 'backend-v3';

CREATE INDEX IF NOT EXISTS idx_govtribe_ledger_caller
  ON govtribe_credit_ledger (caller);

COMMIT;
