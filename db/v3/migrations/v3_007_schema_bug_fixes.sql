-- V3 Migration 007: Schema bug fixes from parity run (#420)
-- 1. Add sources.legacy_id column (omitted from v3_001)
-- 2. Rename pgboss.job snake_case columns to camelCase (pg-boss v9+ native)
-- Idempotent: running twice is a no-op.
-- Forward-only.

BEGIN;

-- ============================================================================
-- 1. sources.legacy_id — required by load.ts, missing from v3_001
-- ============================================================================
ALTER TABLE sources ADD COLUMN IF NOT EXISTS legacy_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS sources_legacy_id_uniq
  ON sources(legacy_id) WHERE legacy_id IS NOT NULL;

-- ============================================================================
-- 2. pgboss.job column renames — snake_case → camelCase
--    v3_004 created these columns with snake_case; pg-boss native expects
--    camelCase. Each rename is guarded by an information_schema check so
--    running this migration a second time (or on a DB where pg-boss already
--    ran install()) is a no-op.
-- ============================================================================

DO $$
DECLARE
  _col RECORD;
BEGIN
  -- Mapping: old_name (snake_case) → new_name (camelCase)
  FOR _col IN
    SELECT old_name, new_name FROM (VALUES
      ('retry_limit',   'retrylimit'),
      ('retry_count',   'retrycount'),
      ('retry_delay',   'retrydelay'),
      ('retry_backoff', 'retrybackoff'),
      ('start_after',   'startafter'),
      ('started_on',    'startedon'),
      ('singleton_key', 'singletonkey'),
      ('singleton_on',  'singletonon'),
      ('expire_in',     'expirein'),
      ('created_on',    'createdon'),
      ('completed_on',  'completedon'),
      ('keep_until',    'keepuntil'),
      ('dead_letter',   'deadletter')
    ) AS t(old_name, new_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'pgboss'
        AND table_name   = 'job'
        AND column_name  = _col.old_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE pgboss.job RENAME COLUMN %I TO %I',
        _col.old_name, _col.new_name
      );
    END IF;
  END LOOP;
END$$;

COMMIT;
