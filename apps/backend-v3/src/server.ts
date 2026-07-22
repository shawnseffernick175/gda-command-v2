import { buildApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './lib/logger.js';
import { initBoss, stopBoss } from './lib/queue.js';
import { pool } from './lib/db.js';
import { initRouter, validateKeys } from './lib/llm-router.js';
import { assertAnalysisConfig } from './lib/config-guard.js';

/**
 * HTTP API entrypoint.
 *
 * This process only serves the Fastify API. pg-boss is started so route
 * handlers can *enqueue* jobs (e.g. analysis on opportunity open, R2), but the
 * queue consumers and the node-cron scheduler run in the separate worker
 * process (worker.ts) so background work can't starve request handling.
 */
async function main(): Promise<void> {
  logger.info(
    { version: config.version, commit: config.gitSha, port: config.port, role: 'api' },
    'Starting V3 backend'
  );

  validateKeys();
  assertAnalysisConfig();
  initRouter(pool);

  await initBoss();

  const app = await buildApp();

  const shutdown = async (signal: string) => {
    logger.info({ signal, role: 'api' }, 'Shutting down');
    await app.close();
    await stopBoss();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: config.port, host: config.host });
  logger.info({ port: config.port, host: config.host }, 'Server listening');
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
