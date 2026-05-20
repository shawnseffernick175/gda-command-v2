/**
 * Migration drift check — compares production schema_migrations against
 * the migration files on main. Reports mismatches.
 *
 * Uses DRIFT_DATABASE_URL. Currently uses gda app-role credentials;
 * will switch to gda_drift_reader (SELECT-only) when F-020 lands.
 *
 * Usage: DRIFT_DATABASE_URL=... npx tsx src/db/check-migration-drift.ts
 */

import pg from "pg";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const DRIFT_DATABASE_URL = process.env.DRIFT_DATABASE_URL;
if (!DRIFT_DATABASE_URL) {
  process.stderr.write("[drift] DRIFT_DATABASE_URL not set — skipping\n");
  process.exit(0);
}

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf-8").digest("hex");
}

async function run() {
  const pool = new pg.Pool({ connectionString: DRIFT_DATABASE_URL });

  // Check whether file_sha256 column exists (added by migration 056)
  const { rows: colCheck } = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'schema_migrations' AND column_name = 'file_sha256'
  `);
  const hasFileHash = colCheck.length > 0;

  // Get all applied migrations from production
  const query = hasFileHash
    ? "SELECT name, file_sha256 FROM schema_migrations ORDER BY id"
    : "SELECT name FROM schema_migrations ORDER BY id";
  const { rows } = await pool.query(query);

  // Read local migration files
  const migrationsDir = path.join(__dirname, "migrations");
  const localFiles = new Set(
    fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql")),
  );

  let driftFound = false;

  for (const row of rows) {
    const name: string = row.name;
    const prodHash: string | null = hasFileHash ? row.file_sha256 : null;

    if (!localFiles.has(name)) {
      process.stdout.write(
        `⚠️ DRIFT: ${name} exists in production schema_migrations but NOT on main\n`,
      );
      driftFound = true;
      continue;
    }

    // If production has file_sha256 recorded, compare against local
    if (prodHash) {
      const localContent = fs.readFileSync(
        path.join(migrationsDir, name),
        "utf-8",
      );
      const localHash = sha256(localContent);
      if (localHash !== prodHash) {
        process.stdout.write(
          `⚠️ DRIFT: ${name} content mismatch — production SHA: ${prodHash.slice(0, 12)}... main SHA: ${localHash.slice(0, 12)}...\n`,
        );
        driftFound = true;
      }
    }
  }

  // Check for local migrations not in production (informational, not drift)
  for (const local of localFiles) {
    const inProd = rows.some((r) => r.name === local);
    if (!inProd) {
      process.stdout.write(
        `ℹ️  PENDING: ${local} exists on main but not yet applied to production\n`,
      );
    }
  }

  if (!driftFound) {
    process.stdout.write("✓ No migration drift detected\n");
  }

  await pool.end();
}

run().catch((e) => {
  process.stderr.write(`[drift] error: ${e.message}\n`);
  process.exit(1);
});
