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
      const res = await client.query(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sources') AS has_sources"
      );
      const row = res.rows[0] as { has_sources: boolean } | undefined;
      return row?.has_sources ? 'current' : 'behind';
    } finally {
      client.release();
    }
  } catch {
    return 'unknown';
  }
}
