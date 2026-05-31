/**
 * Runs every file in db/v3/migrations/*.sql in lexicographic order
 * against the given Postgres connection string.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const { Pool } = pg;

export async function runMigrations(databaseUrl: string): Promise<void> {
  const migrationsDir = resolve(
    import.meta.dirname,
    '../../../../db/v3/migrations',
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });

  try {
    for (const file of files) {
      const sql = readFileSync(resolve(migrationsDir, file), 'utf-8');
      await pool.query(sql);
    }
  } finally {
    await pool.end();
  }
}
