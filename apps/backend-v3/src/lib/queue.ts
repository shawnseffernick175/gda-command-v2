import PgBoss from 'pg-boss';
import { config } from '../config/index.js';
import { logger } from './logger.js';

export const QUEUE_NAMES = {
  ANALYSIS_OPPORTUNITY: 'analysis-opportunity',
  ANALYSIS_CAPTURE: 'analysis-capture',
  INGEST_POSTPROCESS: 'ingest-postprocess',
  ANALYSIS_PERIODIC_REFRESH: 'analysis-periodic-refresh',
  ANALYSIS_MODEL_VERSION_SWEEP: 'analysis-model-version-sweep',
} as const;

let boss: PgBoss | null = null;

export function getBoss(): PgBoss | null {
  return boss;
}

export function requireBoss(): PgBoss {
  if (!boss) throw new Error('pg-boss not initialised — call initBoss() first');
  return boss;
}

export async function initBoss(): Promise<PgBoss> {
  boss = new PgBoss({
    connectionString: config.databaseUrl,
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInHours: 1,
    archiveCompletedAfterSeconds: 3600,
    deleteAfterDays: 7,
  });

  boss.on('error', (err) => {
    logger.error({ err }, 'pg-boss error');
  });

  await boss.start();

  for (const name of Object.values(QUEUE_NAMES)) {
    await boss.createQueue(name);
  }

  logger.info({ queues: Object.values(QUEUE_NAMES) }, 'pg-boss started, queues registered');
  return boss;
}

export async function stopBoss(): Promise<void> {
  if (boss) {
    await boss.stop({ graceful: true, timeout: 10_000 });
    boss = null;
    logger.info('pg-boss stopped');
  }
}

export interface AnalysisJobData {
  entityType: 'opportunity' | 'capture';
  entityId: string;
  priority: 'high' | 'normal';
  trigger: 'detail-endpoint' | 'pre-warm' | 'model-version-bump' | 'periodic-refresh';
}
