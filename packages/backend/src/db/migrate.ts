/**
 * Simple SQL migration runner for GDA Command.
 * Reads .sql files from ./migrations/ in order and applies them.
 * Tracks applied migrations in a `schema_migrations` table.
 *
 * Usage: npx tsx src/db/migrate.ts
 */

import pg from "pg";
import fs from "fs";
import path from "path";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://gda:gda_dev_password@localhost:5432/gda_command";

async function run() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  // Ensure tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Read applied
  const { rows: applied } = await pool.query(
    "SELECT name FROM schema_migrations ORDER BY id"
  );
  const appliedSet = new Set(applied.map((r) => r.name));

  // Read migration files — check both src and dist locations
  let migrationsDir = path.join(__dirname, "migrations");
  if (!fs.existsSync(migrationsDir)) {
    // When running compiled from dist/db/, look in src/db/migrations/
    migrationsDir = path.join(__dirname, "../../src/db/migrations");
  }
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let count = 0;
  for (const file of files) {
    if (appliedSet.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    process.stdout.write(`[migrate] applying ${file}...\n`);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
        file,
      ]);
      await client.query("COMMIT");
      count++;
    } catch (e) {
      await client.query("ROLLBACK");
      process.stderr.write(`[migrate] FAILED on ${file}: ${(e as Error).message}\n`);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  if (count === 0) {
    process.stdout.write("[migrate] all migrations already applied.\n");
  } else {
    process.stdout.write(`[migrate] applied ${count} migration(s).\n`);
  }

  await pool.end();
}

run().catch((e) => {
  process.stderr.write(`[migrate] fatal: ${e.message}\n`);
  process.exit(1);
});
