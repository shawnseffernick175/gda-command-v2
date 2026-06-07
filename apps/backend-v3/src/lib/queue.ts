import PgBoss from 'pg-boss';
import pg from 'pg';
import { config } from '../config/index.js';
import { logger } from './logger.js';

export const QUEUE_NAMES = {
  ANALYSIS_OPPORTUNITY: 'analysis-opportunity',
  ANALYSIS_CAPTURE: 'analysis-capture',
  INGEST_POSTPROCESS: 'ingest-postprocess',
  ANALYSIS_PERIODIC_REFRESH: 'analysis-periodic-refresh',
  ANALYSIS_MODEL_VERSION_SWEEP: 'analysis-model-version-sweep',
  ANALYSIS_FAST_TRACK: 'analysis-fast-track',
  ANALYSIS_BACKFILL: 'analysis-backfill',
  DAILY_BRIEFING: 'daily-briefing',
} as const;

/**
 * Register all QUEUE_NAMES via boss.createQueue() under an advisory lock
 * with deterministic insertion order. The advisory lock serializes
 * registration across concurrent processes (e.g. parallel test files
 * calling initBoss() against a shared CI database), preventing deadlocks.
 * boss.createQueue() is used (not raw INSERT) because pg-boss v10+
 * partitions the job table by queue name — createQueue handles both the
 * queue registry entry and the partition DDL.
 */
export async function registerQueues(b: PgBoss): Promise<void> {
  const lockPool = new pg.Pool({ connectionString: config.databaseUrl, max: 1 });
  const client = await lockPool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(737068)');
    const queues = Object.values(QUEUE_NAMES).slice().sort();
    for (const name of queues) {
      await b.createQueue(name);
    }
    await client.query('SELECT pg_advisory_unlock(737068)');
  } finally {
    client.release();
    await lockPool.end();
  }
}

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

  await registerQueues(boss);

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
  trigger: 'detail-endpoint' | 'pre-warm' | 'model-version-bump' | 'periodic-refresh' | 'ingest' | 'backfill' | 'manual';
}
