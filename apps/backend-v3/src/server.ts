import { buildApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './lib/logger.js';
import { initBoss, stopBoss, requireBoss, QUEUE_NAMES, type AnalysisJobData } from './lib/queue.js';
import { startWorker } from './workers/analysis.js';
import { startSoakDigestWorker } from './workers/soak-digest.js';
import { subscribeFastTrack } from './workers/fast-track.js';
import { pool } from './lib/db.js';
import { startCronScheduler, stopCronScheduler } from './cron/index.js';
import { initRouter, validateKeys } from './lib/llm-router.js';

async function main(): Promise<void> {
  logger.info(
    { version: config.version, commit: config.gitSha, port: config.port },
    'Starting GDA Command V3 backend'
  );

  validateKeys();
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
  const res = await pool.query<{ id: string }>(
    `SELECT id FROM opportunities
     WHERE deleted_at IS NULL
       AND (analysis IS NULL OR analysis_version != $1)
     LIMIT 500`,
    [config.analysisVersion],
  );

  if (res.rows.length === 0) return;

  logger.info({ count: res.rows.length }, 'F-605 backfill: enqueueing stale/missing analysis');

  const boss = requireBoss();
  for (const row of res.rows) {
    const jobData: AnalysisJobData = {
      entityType: 'opportunity',
      entityId: row.id,
      priority: 'normal',
      trigger: 'backfill',
    };
    void boss.send(QUEUE_NAMES.ANALYSIS_OPPORTUNITY, jobData, {
      priority: 10,
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
