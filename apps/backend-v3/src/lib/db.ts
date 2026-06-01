import pg from 'pg';
import { config } from '../config/index.js';
import { logger } from './logger.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected pool error');
});

export async function checkDbConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (err) {
    logger.warn({ err }, 'DB connection check failed');
    return false;
  }
}

export async function checkMigrationsCurrent(): Promise<'current' | 'behind' | 'unknown'> {
  try {
    const client = await pool.connect();
    try {
      const trackerExists = await client.query(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'v3_schema_migrations') AS ok"
      );
      const hasTracker = (trackerExists.rows[0] as { ok: boolean } | undefined)?.ok;
      if (!hasTracker) return 'behind';

      const res = await client.query(
        'SELECT count(*)::int AS cnt FROM v3_schema_migrations'
      );
      const count = (res.rows[0] as { cnt: number } | undefined)?.cnt ?? 0;
      return count > 0 ? 'current' : 'behind';
    } finally {
      client.release();
    }
  } catch {
    return 'unknown';
  }
}

export interface SchemaStatus {
  version: string;
  migration_count: number;
  last_migration_at: string | null;
  drift_detected: boolean;
}

export async function getSchemaStatus(): Promise<SchemaStatus> {
  const client = await pool.connect();
  try {
    const trackerExists = await client.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'v3_schema_migrations') AS ok"
    );
    const hasTracker = (trackerExists.rows[0] as { ok: boolean } | undefined)?.ok;
    if (!hasTracker) {
      return { version: 'none', migration_count: 0, last_migration_at: null, drift_detected: true };
    }

    const res = await client.query(`
      SELECT
        count(*)::int AS cnt,
        max(filename) AS latest,
        max(applied_at)::text AS last_applied
      FROM v3_schema_migrations
    `);
    const row = res.rows[0] as { cnt: number; latest: string | null; last_applied: string | null };

    const version = row.latest ?? 'none';
    const driftDetected = row.cnt === 0;

    return {
      version,
      migration_count: row.cnt,
      last_migration_at: row.last_applied,
      drift_detected: driftDetected,
    };
  } finally {
    client.release();
  }
}
