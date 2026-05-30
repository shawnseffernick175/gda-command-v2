-- V3 Migration 004: pg-boss schema bootstrap + queue seeding
-- Creates the pgboss schema and core tables needed for the job queue.
-- pg-boss normally creates these via pgboss.install(), but we materialize
-- them here so the V3 migration sequence is fully declarative SQL.
-- Queue definitions: analysis-opportunity, analysis-capture, ingest-postprocess
-- Per Addendum A.4: pg-boss from day one.
-- Forward-only. No IF NOT EXISTS guards.

BEGIN;

-- ============================================================================
-- pgboss schema — job queue infrastructure
-- ============================================================================
CREATE SCHEMA pgboss;

CREATE TABLE pgboss.version (
  version     INTEGER     NOT NULL PRIMARY KEY
);

INSERT INTO pgboss.version (version) VALUES (21);

CREATE TABLE pgboss.job (
  id          UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT          NOT NULL,
  priority    INTEGER       NOT NULL DEFAULT 0,
  data        JSONB,
  state       TEXT          NOT NULL DEFAULT 'created'
                            CHECK (state IN ('created', 'retry', 'active', 'completed', 'expired', 'cancelled', 'failed')),
  retry_limit INTEGER       NOT NULL DEFAULT 0,
  retry_count INTEGER       NOT NULL DEFAULT 0,
  retry_delay INTEGER       NOT NULL DEFAULT 0,
  retry_backoff BOOLEAN     NOT NULL DEFAULT FALSE,
  start_after TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  started_on  TIMESTAMPTZ,
  singleton_key TEXT,
  singleton_on TIMESTAMPTZ,
  expire_in   INTERVAL      NOT NULL DEFAULT '00:15:00'::interval,
  created_on  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  completed_on TIMESTAMPTZ,
  keep_until  TIMESTAMPTZ   NOT NULL DEFAULT NOW() + INTERVAL '14 days',
  output      JSONB,
  dead_letter TEXT,
  policy      TEXT
);

CREATE INDEX job_name ON pgboss.job (name) WHERE state < 'active';
CREATE INDEX job_fetch ON pgboss.job (name, priority DESC, created_on, id) WHERE state < 'active';
CREATE INDEX job_singleton_queue ON pgboss.job (name, singleton_key) WHERE state < 'completed' AND singleton_key IS NOT NULL;
CREATE INDEX job_singleton_on ON pgboss.job (name, singleton_on) WHERE state < 'expired' AND singleton_on IS NOT NULL;
CREATE INDEX job_keep_until ON pgboss.job (keep_until) WHERE state = 'completed';

CREATE TABLE pgboss.schedule (
  name        TEXT          NOT NULL PRIMARY KEY,
  cron        TEXT          NOT NULL,
  timezone    TEXT,
  data        JSONB,
  options     JSONB,
  created_on  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_on  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE pgboss.subscription (
  event       TEXT          NOT NULL,
  name        TEXT          NOT NULL,
  created_on  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_on  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event, name)
);

-- ============================================================================
-- V3 analysis_jobs — Tracks V3-specific job metadata beyond pgboss.job
-- ============================================================================
CREATE TABLE analysis_jobs (
  id              BIGSERIAL     PRIMARY KEY,
  pgboss_job_id   UUID          REFERENCES pgboss.job(id),
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

CREATE INDEX idx_analysis_jobs_queue     ON analysis_jobs (queue_name, status);
CREATE INDEX idx_analysis_jobs_entity    ON analysis_jobs (entity_type, entity_id);
CREATE INDEX idx_analysis_jobs_status    ON analysis_jobs (status) WHERE status IN ('queued', 'active');

-- ============================================================================
-- Seed queue configuration via pgboss.schedule
-- Per Addendum A.4: analysis-opportunity (HIGH priority for detail-triggered),
-- analysis-capture, ingest-postprocess
-- ============================================================================

-- Queue config seeded as schedule entries for periodic re-analysis sweeps
-- analysis-opportunity: sweeps stale opportunity analyses every 6 hours
INSERT INTO pgboss.schedule (name, cron, timezone, data, options)
VALUES (
  'analysis-opportunity',
  '0 */6 * * *',
  'UTC',
  '{"type": "sweep", "description": "Re-analyze opportunities with stale analysis"}',
  '{"retryLimit": 3, "retryDelay": 60, "priority": 1}'
);

-- analysis-capture: sweeps stale capture analyses every 6 hours
INSERT INTO pgboss.schedule (name, cron, timezone, data, options)
VALUES (
  'analysis-capture',
  '0 */6 * * *',
  'UTC',
  '{"type": "sweep", "description": "Re-analyze captures with stale analysis"}',
  '{"retryLimit": 3, "retryDelay": 60, "priority": 0}'
);

-- ingest-postprocess: processes webhook side-effects every hour
INSERT INTO pgboss.schedule (name, cron, timezone, data, options)
VALUES (
  'ingest-postprocess',
  '0 * * * *',
  'UTC',
  '{"type": "sweep", "description": "Process pending ingest side-effects"}',
  '{"retryLimit": 2, "retryDelay": 30, "priority": 0}'
);

COMMIT;
