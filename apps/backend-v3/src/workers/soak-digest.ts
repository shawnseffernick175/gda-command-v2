/**
 * Soak digest worker — F-213.
 *
 * Runs once per day via pg-boss schedule. Rolls up soak_events into
 * soak_metrics (daily count by kind, p95 latency for 503_timeout events).
 * Sentinel reads soak_metrics directly for QA.
 */

import { pool } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { requireBoss } from '../lib/queue.js';

const QUEUE_NAME = 'soak-digest';

export async function startSoakDigestWorker(): Promise<void> {
  const boss = requireBoss();

  await boss.createQueue(QUEUE_NAME);

  await boss.schedule(QUEUE_NAME, '0 6 * * *', {}, {
    tz: 'America/New_York',
  });

  await boss.work<Record<string, unknown>>(QUEUE_NAME, { batchSize: 1 }, async () => {
    logger.info('Running daily soak digest');

    try {
      await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY soak_metrics');

      const purged = await pool.query(
        `DELETE FROM soak_events WHERE created_at < NOW() - INTERVAL '7 days'`,
      );

      logger.info(
        { purged: purged.rowCount },
        'Soak digest complete — events rolled up and old events purged',
      );
    } catch (err) {
      logger.error({ err }, 'Soak digest failed');
      throw err;
    }
  });

  logger.info('Soak digest worker registered — runs daily at 06:00 ET');
}
