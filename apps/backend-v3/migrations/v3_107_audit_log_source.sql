-- v3_107: Add source column to audit_log (F-600).
--
-- Distinguishes whether an audit_log entry was produced by a 'system' process
-- (cron, ingest, assessment sweep) or a 'user' action (UI click, API call with
-- authenticated user). Existing rows remain NULL (pre-F-600 writes).

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS source TEXT NULL;

-- DOWN
-- ALTER TABLE audit_log DROP COLUMN IF EXISTS source;
