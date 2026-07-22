import { config } from './config/index.js';
import { logger } from './lib/logger.js';
import {
  initBoss,
  stopBoss,
  requireBoss,
  QUEUE_NAMES,
  ANALYSIS_PRIORITY,
  type AnalysisJobData,
} from './lib/queue.js';
import { startWorker } from './workers/analysis.js';
import { startSoakDigestWorker } from './workers/soak-digest.js';
import { subscribeFastTrack } from './workers/fast-track.js';
import { startActionItemDraftWorker } from './workers/action-item-draft.js';
import { pool } from './lib/db.js';
import { startCronScheduler, stopCronScheduler } from './cron/index.js';
import { initRouter, validateKeys } from './lib/llm-router.js';
import { assertAnalysisConfig } from './lib/config-guard.js';
import type PgBoss from 'pg-boss';

/**
 * Background worker entrypoint (F-audit stabilization).
 *
 * Runs everything that is NOT the HTTP API: pg-boss queue consumers
 * (analysis / capture / ingest-postprocess / soak-digest / fast-track /
 * action-item-draft) and the node-cron scheduler that drives ingestion and
 * periodic maintenance. This process does NOT open an HTTP listener.
 *
 * Splitting this off the API process means a stuck ingest/enrichment job can no
 * longer starve request handling. The API (server.ts) still starts pg-boss so
 * it can *enqueue* jobs; this process is the only one that *consumes* them and
 * runs cron.
 */
async function main(): Promise<void> {
  logger.info(
    { version: config.version, commit: config.gitSha, role: 'worker' },
    'Starting V3 worker'
  );

  validateKeys();
  assertAnalysisConfig();
  initRouter(pool);

  await initBoss();

  const workerBoss = await startWorker();
  await startSoakDigestWorker();
  await subscribeFastTrack();
  await startActionItemDraftWorker();

  startCronScheduler();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal, role: 'worker' }, 'Shutting down worker');
    stopCronScheduler();
    await workerBoss.stop({ graceful: true, timeout: 10_000 });
    await stopBoss();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  logger.info({ role: 'worker' }, 'Worker started — consuming queues and running cron');

  // F-605: Backfill — enqueue analysis for opportunities missing analysis or on stale version
  backfillAnalysis().catch((err) => {
    logger.warn({ err }, 'Analysis backfill failed (non-critical)');
  });
}

async function backfillAnalysis(): Promise<void> {
  const boss: PgBoss = requireBoss();

  // Throttle: skip if backlog already large
  const backlogRes = await pool.query<{ cnt: string }>(
    `SELECT count(*)::text AS cnt FROM pgboss.job
     WHERE name = $1 AND state IN ('created', 'retry')`,
    [QUEUE_NAMES.ANALYSIS_OPPORTUNITY],
  );
  const backlog = Number(backlogRes.rows[0]?.cnt ?? 0);
  if (backlog > 1000) {
    logger.info({ backlog }, 'F-605 backfill skipped - backlog exceeds threshold');
    return;
  }

  const res = await pool.query<{ id: string }>(
    `SELECT id FROM opportunities
     WHERE deleted_at IS NULL
       AND (analysis IS NULL OR analysis_version != $1)
       AND (relevance_status IS NULL OR relevance_status = 'relevant')
       -- Passed/dispositioned opps are never analyzed (mirrors self-check.ts).
       AND assessment_status IS DISTINCT FROM 'pass'
       -- Binding rule: opps within 30 days of the deadline are auto-passed.
       AND (response_due_at IS NULL OR response_due_at >= NOW() + INTERVAL '30 days')
     LIMIT 500`,
    [config.analysisVersion],
  );

  if (res.rows.length === 0) return;

  logger.info({ count: res.rows.length }, 'F-605 backfill: enqueueing stale/missing analysis');

  for (const row of res.rows) {
    const jobData: AnalysisJobData = {
      entityType: 'opportunity',
      entityId: row.id,
      priority: 'normal',
      trigger: 'backfill',
    };
    void boss.send(QUEUE_NAMES.ANALYSIS_OPPORTUNITY, jobData, {
      priority: ANALYSIS_PRIORITY.BACKFILL,
      retryLimit: 3,
      retryDelay: 5,
      retryBackoff: true,
      singletonKey: `opp-${row.id}`,
    });
  }
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start worker');
  process.exit(1);
});
