-- V3 Migration 006: Widen analysis_jobs queue CHECK for new queues
--
-- F-209 (Capture module) introduced analysis-periodic-refresh and
-- analysis-model-version-sweep queues. This migration widens the
-- analysis_jobs.queue_name CHECK to accept those queues.
--
-- STRATEGY B (F-220.1): pg-boss owns its schema. Queue registration
-- is handled by boss.createQueue() at runtime (see queue.ts).
-- This migration no longer touches pgboss.queue or pgboss.schedule.
-- Forward-only.

BEGIN;

-- Widen the analysis_jobs.queue_name CHECK to include the two new queues.
ALTER TABLE analysis_jobs DROP CONSTRAINT IF EXISTS analysis_jobs_queue_name_check;
ALTER TABLE analysis_jobs ADD CONSTRAINT analysis_jobs_queue_name_check
  CHECK (queue_name IN (
    'analysis-opportunity', 'analysis-capture', 'ingest-postprocess',
    'analysis-periodic-refresh', 'analysis-model-version-sweep'
  ));

COMMIT;
