import PgBoss from 'pg-boss';
import { config } from '../config/index.js';
import { logger } from './logger.js';

export const QUEUE_NAMES = {
  ANALYSIS_OPPORTUNITY: 'analysis-opportunity',
  ANALYSIS_CAPTURE: 'analysis-capture',
  INGEST_POSTPROCESS: 'ingest-postprocess',
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
  logger.info('pg-boss started');
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
