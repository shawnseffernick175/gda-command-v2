-- V3 Migration 004: analysis_jobs table (pg-boss companion)
--
-- STRATEGY B (F-220.1): pg-boss owns its own schema.
-- The pgboss schema is created by the pg-boss library at runtime via
-- boss.start(). This migration no longer attempts to pre-create the
-- pgboss schema — that was the root cause of the V3 crash-loop
-- (version mismatch, missing tables, missing columns).
--
-- This file now ONLY creates the application-level analysis_jobs table
-- that tracks V3-specific job metadata alongside pg-boss jobs.
-- The FK to pgboss.job is intentionally omitted because pg-boss schema
-- does not exist at migration time; referential integrity is enforced
-- at the application layer (queue.ts).
--
-- Historical note: the original v3_004 created a pgboss schema at
-- version 21 with snake_case columns. pg-boss v10.4.2 (installed)
-- expects version 24 with camelCase columns, a queue registry table,
-- partitioned job tables, and an archive table. The mismatch caused
-- runtime crashes. See F-220 #452 and F-220.1 #461.

BEGIN;

-- ============================================================================
-- analysis_jobs — Tracks V3-specific job metadata beyond pg-boss internals
-- ============================================================================
CREATE TABLE IF NOT EXISTS analysis_jobs (
  id              BIGSERIAL     PRIMARY KEY,
  pgboss_job_id   UUID,
  queue_name      TEXT          NOT NULL
                                CHECK (queue_name IN (
                                  'analysis-opportunity', 'analysis-capture', 'ingest-postprocess'
                                )),
  entity_type     TEXT          NOT NULL
                                CHECK (entity_type IN ('opportunity', 'capture', 'ingest')),
  entity_id       BIGINT        NOT NULL,
  priority        TEXT          NOT NULL DEFAULT 'normal'
                                CHECK (priority IN ('high', 'normal', 'low')),
  status          TEXT          NOT NULL DEFAULT 'queued'
                                CHECK (status IN ('queued', 'active', 'completed', 'failed', 'expired')),
  retry_count     INTEGER       NOT NULL DEFAULT 0,
  max_retries     INTEGER       NOT NULL DEFAULT 3,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_queue
  ON analysis_jobs (queue_name, status);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_entity
  ON analysis_jobs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status
  ON analysis_jobs (status) WHERE status IN ('queued', 'active');

COMMIT;
