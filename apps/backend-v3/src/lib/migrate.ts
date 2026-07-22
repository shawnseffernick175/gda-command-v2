/**
 * Programmatic node-pg-migrate runner.
 *
 * Wraps node-pg-migrate so it can be called from:
 *   1. entrypoint.sh  (via `npx tsx src/lib/migrate.ts`)
 *   2. CI dry-run      (via `npx tsx src/lib/migrate.ts --dry-run`)
 *   3. Application code (import { runMigrations })
 *
 * Reads DATABASE_URL (or V3_DATABASE_URL) from env.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runner, type RunnerOption } from 'node-pg-migrate';
import pg from 'pg';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { envFirst } from './env.js';

const { Client } = pg;

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(HERE, '..', '..', 'migrations');

export interface MigrateResult {
  applied: number;
  version: string | null;
  dryRun: boolean;
}

export async function runMigrations(opts?: {
  dryRun?: boolean;
  databaseUrl?: string;
}): Promise<MigrateResult> {
  const dryRun = opts?.dryRun ?? false;
  const databaseUrl =
    opts?.databaseUrl || envFirst(['DATABASE_URL', 'V3_DATABASE_URL']);

  if (!databaseUrl) {
    throw new Error('DATABASE_URL or V3_DATABASE_URL must be set');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    // Bootstrap: if v3_schema_migrations exists but pgmigrations doesn't,
    // this is a first deploy of node-pg-migrate to an existing DB.
    // Seed pgmigrations so the runner doesn't re-apply existing migrations.
    if (!dryRun) {
      await bootstrapExistingDb(client);
    }

    const log = (msg: string) => console.log(`  [migrate] ${msg}`);
    const warnLog = (msg: string) => {
      if (!msg.includes("Can't determine timestamp")) log(msg);
    };
    const runnerOpts: RunnerOption = {
      dbClient: client,
      migrationsTable: 'pgmigrations',
      dir: MIGRATIONS_DIR,
      direction: 'up',
      count: Infinity,
      dryRun,
      logger: {
        info: log,
        warn: warnLog,
        error: log,
      },
    };

    const migrations = await runner(runnerOpts);
    const applied = migrations.length;

    if (!dryRun && applied > 0) {
      await syncLegacyTracker(client);
    }

    const version = await getCurrentVersion(client);

    return { applied, version, dryRun };
  } finally {
    await client.end();
  }
}

/**
 * First-deploy bootstrap for existing databases.
 *
 * Detects when node-pg-migrate is being deployed to a DB that already has
 * v3_schema_migrations (i.e., migrations were applied manually before the
 * managed runner existed). Creates pgmigrations and seeds it with all
 * v3_000–v3_024 entries so `runner()` treats them as already applied.
 */
async function bootstrapExistingDb(client: pg.Client): Promise<void> {
  const hasPgMigrations = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'pgmigrations'
     ) AS exists`
  );
  if ((hasPgMigrations.rows[0] as { exists: boolean }).exists) return;

  const hasLegacy = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'v3_schema_migrations'
     ) AS exists`
  );
  if (!(hasLegacy.rows[0] as { exists: boolean }).exists) return;

  console.log('  [migrate] Bootstrap: existing DB detected (v3_schema_migrations present, pgmigrations absent)');
  console.log('  [migrate] Seeding pgmigrations with v3_000–v3_024 as already-applied...');

  await client.query(`
    CREATE TABLE pgmigrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      run_on TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && f.startsWith('v3_'))
    .sort();

  for (const file of files) {
    const name = file.replace(/\.sql$/, '');
    await client.query(
      `INSERT INTO pgmigrations (name, run_on) VALUES ($1, NOW())`,
      [name]
    );
  }

  console.log(`  [migrate] Bootstrap complete: seeded ${files.length} entries into pgmigrations.`);
}

async function syncLegacyTracker(client: pg.Client): Promise<void> {
  const hasTable = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_name = 'v3_schema_migrations'
     ) AS exists`
  );
  if (!(hasTable.rows[0] as { exists: boolean }).exists) return;

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && f.startsWith('v3_'))
    .sort();

  for (const file of files) {
    const content = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
    const sha = createHash('sha256').update(content, 'utf8').digest('hex');
    await client.query(
      `INSERT INTO v3_schema_migrations (filename, file_sha256, applied_by, commit_sha)
       VALUES ($1, $2, current_user, 'node-pg-migrate')
       ON CONFLICT (filename) DO NOTHING`,
      [file, sha]
    );
  }
}

async function getCurrentVersion(client: pg.Client): Promise<string | null> {
  try {
    const res = await client.query(
      `SELECT name FROM pgmigrations ORDER BY run_on DESC, id DESC LIMIT 1`
    );
    return (res.rows[0] as { name: string } | undefined)?.name ?? null;
  } catch {
    return null;
  }
}

// CLI entry point
if (
  process.argv[1] &&
  (process.argv[1].endsWith('migrate.ts') ||
    process.argv[1].endsWith('migrate.js'))
) {
  const dryRun = process.argv.includes('--dry-run');
  console.log(
    `=== V3 Schema Migrations (${dryRun ? 'DRY-RUN' : 'APPLY'}) ===`
  );
  runMigrations({ dryRun })
    .then((result) => {
      if (result.dryRun) {
        console.log(
          `Dry-run complete: ${result.applied} pending migration(s).`
        );
      } else if (result.applied === 0) {
        console.log('Schema is up to date — no new migrations.');
      } else {
        console.log(`Applied ${result.applied} migration(s).`);
      }
      console.log(`Current version: ${result.version ?? '(none)'}`);
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
