/**
 * V3 Migration Runner
 *
 * Applies forward-only SQL migrations from db/v3/migrations/ against the
 * V3 Postgres database. Tracks applied migrations in v3_schema_migrations.
 *
 * Algorithm (per phase-1-architecture-and-schema.md §3.2):
 * 1. Connect to V3_DATABASE_URL (falls back to DATABASE_URL).
 * 2. Bootstrap v3_schema_migrations if it does not exist (only IF NOT EXISTS allowed).
 * 3. Read applied filenames from v3_schema_migrations.
 * 4. Scan db/v3/migrations/ for v3_*.sql files, sorted lexicographically.
 * 5. For each unapplied migration: compute SHA-256, execute in transaction, record.
 * 6. On failure: ROLLBACK and exit 1.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import pg from 'pg';

const { Pool } = pg;

const MIGRATIONS_DIR = resolve(join(import.meta.dirname ?? __dirname, 'migrations'));

function getCommitSha(): string | null {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

async function main(): Promise<void> {
  const databaseUrl = process.env.V3_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: V3_DATABASE_URL or DATABASE_URL must be set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const commitSha = getCommitSha();

  try {
    // Step 1 — Bootstrap tracker (only IF NOT EXISTS allowed in V3)
    const bootstrapSql = await readFile(join(MIGRATIONS_DIR, 'v3_000_schema_migrations.sql'), 'utf8');
    await pool.query(bootstrapSql);

    // Step 2 — Read applied migrations
    const { rows: applied } = await pool.query<{ filename: string }>(
      'SELECT filename FROM v3_schema_migrations ORDER BY filename'
    );
    const appliedSet = new Set(applied.map((r) => r.filename));

    // Step 3 — Scan migration files
    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql') && f.startsWith('v3_') && f !== 'v3_000_schema_migrations.sql')
      .sort();

    if (files.length === 0) {
      console.log('No V3 migrations found.');
      return;
    }

    let appliedCount = 0;

    for (const file of files) {
      if (appliedSet.has(file)) {
        continue;
      }

      const filePath = join(MIGRATIONS_DIR, file);
      const sql = await readFile(filePath, 'utf8');
      const hash = sha256(sql);

      console.log(`Applying: ${file} ...`);
      const start = Date.now();

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          `INSERT INTO v3_schema_migrations (filename, file_sha256, applied_by, commit_sha, execution_ms)
           VALUES ($1, $2, current_user, $3, $4)`,
          [file, hash, commitSha, Date.now() - start]
        );
        await client.query('COMMIT');
        console.log(`  ✓ ${file} (${Date.now() - start}ms)`);
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ✗ FAILED: ${file}`);
        console.error(err);
        process.exit(1);
      } finally {
        client.release();
      }
    }

    if (appliedCount === 0) {
      console.log('V3 schema is up to date — no new migrations.');
    } else {
      console.log(`Applied ${appliedCount} V3 migration(s) successfully.`);
    }
  } finally {
    await pool.end();
  }
}

main();
