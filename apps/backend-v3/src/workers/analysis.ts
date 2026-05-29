/**
 * pg-boss analysis worker.
 *
 * Subscribes to: analysis-opportunity, analysis-capture, ingest-postprocess
 *
 * Pre-warm policy (F-201 Addendum A.2):
 *   - n8n webhook commit → enqueue
 *   - manual create → enqueue
 *   - PATCH of analysis-affecting fields → enqueue
 *   - source change → enqueue
 *   - model version bump → sweep all stale
 *
 * Stub implementation: writes deterministic placeholder data with real
 * version + generated_at so contract tests pass. Real models come in Phase 3.
 */

import PgBoss from 'pg-boss';
import pg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { QUEUE_NAMES, type AnalysisJobData } from '../lib/queue.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 5,
});

function buildStubAnalysis(): Record<string, unknown> {
  return {
    pwin: 0.5,
    pwin_sources: [
      {
        kind: 'internal',
        title: 'Stub analysis model ' + config.analysisVersion,
        url: '/audit/analysis/stub',
        retrieved_at: new Date().toISOString(),
      },
    ],
    incumbent: 'Unknown (stub)',
    incumbent_sources: [
      {
        kind: 'internal',
        title: 'Stub — no real analysis yet',
        url: '/audit/analysis/stub',
        retrieved_at: new Date().toISOString(),
      },
    ],
    competitors: [],
    competitors_sources: [],
    timeline: {
      rfp_release: null,
      proposals_due: null,
      award_estimate: null,
    },
    timeline_sources: [],
    version: config.analysisVersion,
    generated_at: new Date().toISOString(),
  };
}

async function handleOpportunityAnalysis(jobs: PgBoss.Job<AnalysisJobData>[]): Promise<void> {
  for (const job of jobs) {
    const { entityId } = job.data;
    logger.info({ entityId, jobId: job.id }, 'Processing opportunity analysis');

    const analysis = buildStubAnalysis();
    const now = new Date().toISOString();

    await pool.query(
      `UPDATE opportunities
       SET analysis = $1,
           analysis_version = $2,
           ai_analyzed_at = $3,
           updated_at = updated_at
       WHERE id = $4 AND deleted_at IS NULL`,
      [JSON.stringify(analysis), config.analysisVersion, now, entityId]
    );

    logger.info({ entityId, version: config.analysisVersion }, 'Opportunity analysis written');
  }
}

async function handleCaptureAnalysis(jobs: PgBoss.Job<AnalysisJobData>[]): Promise<void> {
  for (const job of jobs) {
    const { entityId } = job.data;
    logger.info({ entityId, jobId: job.id }, 'Processing capture analysis');

    const analysis = buildStubAnalysis();
    const now = new Date().toISOString();

    await pool.query(
      `UPDATE captures
       SET analysis = $1,
           analysis_version = $2,
           ai_analyzed_at = $3,
           updated_at = updated_at
       WHERE id = $4`,
      [JSON.stringify(analysis), config.analysisVersion, now, entityId]
    );

    logger.info({ entityId, version: config.analysisVersion }, 'Capture analysis written');
  }
}

async function handleIngestPostprocess(jobs: PgBoss.Job<Record<string, unknown>>[]): Promise<void> {
  for (const job of jobs) {
    logger.info({ jobId: job.id }, 'Processing ingest postprocess (stub)');
  }
}

export async function startWorker(): Promise<PgBoss> {
  const boss = new PgBoss({
    connectionString: config.databaseUrl,
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInHours: 1,
    archiveCompletedAfterSeconds: 3600,
    deleteAfterDays: 7,
  });

  boss.on('error', (err) => {
    logger.error({ err }, 'Worker pg-boss error');
  });

  await boss.start();
  logger.info('Worker pg-boss started');

  await boss.work<AnalysisJobData>(
    QUEUE_NAMES.ANALYSIS_OPPORTUNITY,
    { batchSize: 1 },
    handleOpportunityAnalysis
  );
  logger.info({ queue: QUEUE_NAMES.ANALYSIS_OPPORTUNITY }, 'Subscribed to queue');

  await boss.work<AnalysisJobData>(
    QUEUE_NAMES.ANALYSIS_CAPTURE,
    { batchSize: 1 },
    handleCaptureAnalysis
  );
  logger.info({ queue: QUEUE_NAMES.ANALYSIS_CAPTURE }, 'Subscribed to queue');

  await boss.work<Record<string, unknown>>(
    QUEUE_NAMES.INGEST_POSTPROCESS,
    { batchSize: 1 },
    handleIngestPostprocess
  );
  logger.info({ queue: QUEUE_NAMES.INGEST_POSTPROCESS }, 'Subscribed to queue');

  return boss;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  startWorker().catch((err) => {
    logger.fatal({ err }, 'Worker failed to start');
    process.exit(1);
  });
}
