/**
 * Migration test harness for state-dependent migration validation.
 *
 * Uses a dedicated test database on the same Postgres instance (simpler than
 * testcontainers, no Docker-in-Docker needed, runs in CI with the existing
 * postgres service). Each test gets a fresh database created/dropped per run.
 *
 * Design choice: We use a real Postgres instance rather than testcontainers
 * because (a) the CI pipeline already provides a postgres service, (b) it
 * avoids Docker-in-Docker complexity, and (c) migration tests need real
 * Postgres behavior (constraints, plpgsql, etc.), not SQLite or mocks.
 */

import pg from "pg";
import fs from "fs";
import path from "path";

const MIGRATIONS_DIR = path.join(__dirname, "..");

/** Seed specification: array of tables with rows to insert */
export interface SeedSpec {
  tables: Array<{
    table: string;
    rows: Array<Record<string, unknown>>;
  }>;
}

/**
 * Create a seeded test database with all migrations applied up to (but NOT
 * including) the target migration, then seed with the provided fixture data.
 *
 * @param upToBefore - filename of the target migration (exclusive)
 * @param seed - fixture data to insert after running prior migrations
 * @returns A pg.Pool connected to the ephemeral test database
 */
export async function createSeededTestDb(
  upToBefore: string,
  seed: SeedSpec,
): Promise<pg.Pool> {
  const dbUrl =
    process.env.DATABASE_URL ??
    "postgresql://gda:gda_dev_password@localhost:5432/gda_command";

  // Connect to the default database to create/drop the test db
  const adminPool = new pg.Pool({ connectionString: dbUrl });
  const testDbName = `gda_migration_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    // Force-disconnect any stale connections and create fresh test db
    await adminPool.query(`DROP DATABASE IF EXISTS "${testDbName}"`);
    await adminPool.query(`CREATE DATABASE "${testDbName}"`);
  } finally {
    await adminPool.end();
  }

  // Build connection string for the test db
  const url = new URL(dbUrl);
  url.pathname = `/${testDbName}`;
  const testPool = new pg.Pool({ connectionString: url.toString() });

  // Store the test db name on the pool for cleanup
  (testPool as TestPool).__testDbName = testDbName;
  (testPool as TestPool).__adminUrl = dbUrl;

  try {
    // Create schema_migrations table
    await testPool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Get all migration files in order, stopping before the target
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      if (file === upToBefore) break;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
      const client = await testPool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (name) VALUES ($1)",
          [file],
        );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        // Some migrations may fail on missing extensions (pgvector, etc.)
        // — skip gracefully since we only need the tables relevant to our test
        const msg = (e as Error).message;
        const isExtensionError = /extension|could not open/i.test(msg);
        const isTableMissing = /relation ".*" does not exist/i.test(msg);
        if (isExtensionError || isTableMissing) {
          // Record as applied so subsequent migrations don't re-try
          try {
            await client.query(
              "INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING",
              [file],
            );
          } catch { /* ignore */ }
          continue;
        }
        throw e;
      } finally {
        client.release();
      }
    }

    // Seed fixture data
    for (const { table, rows } of seed.tables) {
      for (const row of rows) {
        const keys = Object.keys(row);
        const values = Object.values(row);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
        const cols = keys.map((k) => `"${k}"`).join(", ");
        await testPool.query(
          `INSERT INTO "${table}" (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          values,
        );
      }
    }

    return testPool;
  } catch (e) {
    // Clean up pool and ephemeral database on setup failure
    await destroyTestDb(testPool);
    throw e;
  }
}

/**
 * Apply a single migration file against the test database.
 */
export async function applyMigration(
  pool: pg.Pool,
  migrationFilename: string,
): Promise<void> {
  const filePath = path.join(MIGRATIONS_DIR, migrationFilename);
  const sql = fs.readFileSync(filePath, "utf-8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations (name) VALUES ($1)",
      [migrationFilename],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Clean up the ephemeral test database. Call in afterAll().
 */
export async function destroyTestDb(pool: pg.Pool): Promise<void> {
  const testDbName = (pool as TestPool).__testDbName;
  const adminUrl = (pool as TestPool).__adminUrl;
  if (!testDbName || !adminUrl) return;

  await pool.end();

  const adminPool = new pg.Pool({ connectionString: adminUrl });
  try {
    // Terminate remaining connections
    await adminPool.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = $1 AND pid <> pg_backend_pid()
    `, [testDbName]);
    await adminPool.query(`DROP DATABASE IF EXISTS "${testDbName}"`);
  } finally {
    await adminPool.end();
  }
}

/** Internal type for attaching test db metadata to pool */
interface TestPool extends pg.Pool {
  __testDbName?: string;
  __adminUrl?: string;
}
