import { buildApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './lib/logger.js';
import { initBoss, stopBoss } from './lib/queue.js';
import { startWorker } from './workers/analysis.js';
import { pool } from './lib/db.js';

async function main(): Promise<void> {
  logger.info(
    { version: config.version, commit: config.gitSha, port: config.port },
    'Starting GDA Command V3 backend'
  );

  await initBoss();

  const workerBoss = await startWorker();

  const app = await buildApp();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    await app.close();
    await workerBoss.stop({ graceful: true, timeout: 10_000 });
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
