import { buildApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './lib/logger.js';
import { initBoss, stopBoss, requireBoss, QUEUE_NAMES, ANALYSIS_PRIORITY, type AnalysisJobData } from './lib/queue.js';
import { startWorker } from './workers/analysis.js';
import { startSoakDigestWorker } from './workers/soak-digest.js';
import { subscribeFastTrack } from './workers/fast-track.js';
import { pool } from './lib/db.js';
import { startCronScheduler, stopCronScheduler } from './cron/index.js';
import { initRouter, validateKeys } from './lib/llm-router.js';
import { assertAnalysisConfig } from './lib/config-guard.js';

async function main(): Promise<void> {
  logger.info(
    { version: config.version, commit: config.gitSha, port: config.port },
    'Starting V3 backend'
  );

  validateKeys();
  assertAnalysisConfig();
  initRouter(pool);

  await initBoss();

  const workerBoss = await startWorker();
  await startSoakDigestWorker();
  await subscribeFastTrack();

  startCronScheduler();

  const app = await buildApp();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    await app.close();
    stopCronScheduler();
    await workerBoss.stop({ graceful: true, timeout: 10_000 });
    await stopBoss();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: config.port, host: config.host });
  logger.info({ port: config.port, host: config.host }, 'Server listening');

  // F-605: Backfill — enqueue analysis for opportunities missing analysis or on stale version
  backfillAnalysis().catch((err) => {
    logger.warn({ err }, 'Analysis backfill failed (non-critical)');
  });
}

async function backfillAnalysis(): Promise<void> {
  const boss = requireBoss();

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
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
