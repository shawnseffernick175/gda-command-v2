-- V3 Migration 006: Register analysis-periodic-refresh pg-boss queue
-- F-209 (Capture module) introduced a periodic refresh job that schedules
-- against the 'analysis-periodic-refresh' queue. v3_004 only seeded
-- analysis-opportunity, analysis-capture, ingest-postprocess.
-- This migration registers the missing queue so pgboss.schedule FK is satisfied.
-- Forward-only.

BEGIN;

-- If pgboss.queue registry table does not exist in our bootstrap, create it
-- to match pg-boss v10+ schema expectations (schedule.name FK target).
CREATE TABLE IF NOT EXISTS pgboss.queue (
  name              TEXT          NOT NULL PRIMARY KEY,
  policy            TEXT,
  retry_limit       INTEGER,
  retry_delay       INTEGER,
  retry_backoff     BOOLEAN,
  expire_seconds    INTEGER,
  retention_minutes INTEGER,
  dead_letter       TEXT,
  partition_name    TEXT,
  created_on        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_on        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Backfill all canonical queues (idempotent)
INSERT INTO pgboss.queue (name, policy, retry_limit, retry_delay)
VALUES
  ('analysis-opportunity',       'standard', 3, 60),
  ('analysis-capture',           'standard', 3, 60),
  ('ingest-postprocess',         'standard', 2, 30),
  ('analysis-periodic-refresh',  'standard', 3, 60),
  ('analysis-model-version-sweep', 'standard', 1, 60)
ON CONFLICT (name) DO NOTHING;

-- Ensure pgboss.schedule has the FK to pgboss.queue (if not already there).
-- pg-boss creates this FK as schedule_name_fkey when running install().
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'schedule_name_fkey' AND connamespace = 'pgboss'::regnamespace
  ) THEN
    ALTER TABLE pgboss.schedule
      ADD CONSTRAINT schedule_name_fkey
      FOREIGN KEY (name) REFERENCES pgboss.queue(name) ON DELETE CASCADE;
  END IF;
END$$;

COMMIT;
