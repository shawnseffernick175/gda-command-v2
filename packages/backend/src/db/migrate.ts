/**
 * SQL migration runner for GDA Command.
 * Reads .sql files from ./migrations/ in order and applies them.
 * Tracks applied migrations in a `schema_migrations` table.
 *
 * F-019 additions:
 * - Manifest hash verification (defense in depth)
 * - Provenance recording (commit_sha, applied_by, file_sha256)
 * - MIGRATION_DATABASE_URL support (reserved for F-020 role separation)
 * - Break-glass env vars for emergency bypasses
 *
 * Usage: npx tsx src/db/migrate.ts
 */

import pg from "pg";
import fs from "fs";
import path from "path";
import crypto from "crypto";

// --- Connection URL resolution ---
// Prefer MIGRATION_DATABASE_URL when set (reserved for F-020 role separation).
// Falls back to DATABASE_URL (current default until role separation lands).
function resolveConnectionUrl(): string {
  const migrationUrl = process.env.MIGRATION_DATABASE_URL?.trim() || null;
  const appUrl =
    process.env.DATABASE_URL ??
    "postgresql://gda:gda_dev_password@localhost:5432/gda";

  if (migrationUrl) return migrationUrl;

  return appUrl;
}

// --- Manifest verification ---
const skipManifestCheck =
  process.env.MIGRATION_SKIP_MANIFEST_CHECK === "true";

interface Manifest {
  [filename: string]: string; // filename -> sha256 hash
}

function loadManifest(migrationsDir: string): Manifest | null {
  // Look for manifest in migrations dir or repo root
  const candidates = [
    path.join(migrationsDir, "migration-manifest.json"),
    path.join(migrationsDir, "..", "..", "..", "..", "migration-manifest.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf-8")) as Manifest;
    }
  }
  return null;
}

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf-8").digest("hex");
}

function verifyManifest(
  file: string,
  sql: string,
  manifest: Manifest,
): boolean {
  if (skipManifestCheck) {
    process.stderr.write(
      `[migrate] ⚠️ MANIFEST CHECK BYPASSED for ${file}\n`,
    );
    return true;
  }

  const expectedHash = manifest[file];
  if (!expectedHash) {
    process.stderr.write(
      `[migrate] FATAL: ${file} not found in migration-manifest.json. ` +
        `This migration has not been reviewed and merged to main.\n`,
    );
    return false;
  }

  const actualHash = sha256(sql);
  if (actualHash !== expectedHash) {
    process.stderr.write(
      `[migrate] FATAL: ${file} content mismatch.\n` +
        `  Expected SHA-256: ${expectedHash}\n` +
        `  Actual SHA-256:   ${actualHash}\n` +
        `  The file on disk does not match the reviewed version on main.\n`,
    );
    return false;
  }

  return true;
}

// --- Provenance ---
const DEPLOY_COMMIT_SHA = process.env.DEPLOY_COMMIT_SHA ?? null;

/** Return true only if every statement in the SQL is DELETE or TRUNCATE. */
function isDataCleanupMigration(sql: string): boolean {
  const stripped = sql
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
  if (!stripped) return false;
  const statements = stripped
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return statements.every((s) => /^\s*(DELETE\s+FROM|TRUNCATE)\s/i.test(s));
}

/** Check if schema_migrations has the provenance columns (added by 056). */
async function hasProvenanceColumns(pool: pg.Pool): Promise<boolean> {
  const { rows } = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'schema_migrations' AND column_name = 'file_sha256'
  `);
  return rows.length > 0;
}

async function run() {
  const connectionUrl = resolveConnectionUrl();
  const pool = new pg.Pool({ connectionString: connectionUrl });

  // Ensure tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Detect provenance support (columns added by migration 056)
  let provenance = await hasProvenanceColumns(pool);

  // Get current_user from Postgres (unforgeable applied_by)
  let pgCurrentUser = "unknown";
  if (provenance) {
    const { rows } = await pool.query("SELECT current_user");
    pgCurrentUser = rows[0].current_user;
  }

  // Read applied
  const { rows: applied } = await pool.query(
    "SELECT name FROM schema_migrations ORDER BY id",
  );
  const appliedSet = new Set(applied.map((r) => r.name));

  // Read migration files — check both src and dist locations
  let migrationsDir = path.join(__dirname, "migrations");
  if (!fs.existsSync(migrationsDir)) {
    migrationsDir = path.join(__dirname, "../../src/db/migrations");
  }
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  // Load manifest (may not exist yet — pre-F-019 or dev environment)
  const manifest = loadManifest(migrationsDir);
  if (manifest && !skipManifestCheck) {
    process.stdout.write(
      `[migrate] manifest loaded: ${Object.keys(manifest).length} entries\n`,
    );
  } else if (!manifest) {
    process.stdout.write(
      "[migrate] no migration-manifest.json found — skipping hash verification\n",
    );
  }

  let count = 0;
  for (const file of files) {
    if (appliedSet.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");

    // Manifest verification (if manifest exists)
    if (manifest) {
      if (!verifyManifest(file, sql, manifest)) {
        process.exit(1);
      }
    }

    const fileHash = sha256(sql);
    process.stdout.write(`[migrate] applying ${file} [${fileHash.slice(0, 12)}]...\n`);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);

      // Insert with provenance if columns exist, otherwise legacy insert
      if (provenance) {
        await client.query(
          `INSERT INTO schema_migrations (name, commit_sha, applied_by, file_sha256)
           VALUES ($1, $2, $3, $4)`,
          [file, DEPLOY_COMMIT_SHA, pgCurrentUser, fileHash],
        );
      } else {
        await client.query(
          "INSERT INTO schema_migrations (name) VALUES ($1)",
          [file],
        );
      }

      await client.query("COMMIT");
      count++;

      // After applying 056, re-check for provenance columns so subsequent
      // migrations in the same run get provenance recorded.
      // Wrapped in its own try-catch: backfill is non-essential enrichment
      // and must not abort the migration run after 056 is already committed.
      if (file === "056_schema_migrations_provenance.sql" && !provenance) {
        try {
          provenance = await hasProvenanceColumns(pool);
          if (provenance) {
            process.stdout.write(
              "[migrate] provenance columns now active — subsequent migrations will record provenance\n",
            );
            const { rows: userRows } = await pool.query(
              "SELECT current_user",
            );
            pgCurrentUser = userRows[0].current_user;
            await pool.query(
              `UPDATE schema_migrations
               SET commit_sha = $1, applied_by = $2, file_sha256 = $3
               WHERE name = $4 AND file_sha256 IS NULL`,
              [DEPLOY_COMMIT_SHA, pgCurrentUser, fileHash, file],
            );
          }
        } catch (backfillErr) {
          process.stderr.write(
            `[migrate] WARNING: provenance backfill failed for 056: ${(backfillErr as Error).message}\n`,
          );
        }
      }
    } catch (e) {
      await client.query("ROLLBACK");
      const msg = (e as Error).message;
      process.stderr.write(`[migrate] FAILED on ${file}: ${msg}\n`);
      const isTableMissing = /relation ".*" does not exist/i.test(msg);
      const isCleanupOnly = isDataCleanupMigration(sql);
      if (isTableMissing && isCleanupOnly) {
        process.stderr.write(
          `[migrate] WARNING: skipping cleanup migration ${file} (table not found)\n`,
        );
        const skipClient = await pool.connect();
        try {
          if (provenance) {
            await skipClient.query(
              `INSERT INTO schema_migrations (name, commit_sha, applied_by, file_sha256)
               VALUES ($1, $2, $3, $4)`,
              [file, DEPLOY_COMMIT_SHA, pgCurrentUser, fileHash],
            );
          } else {
            await skipClient.query(
              "INSERT INTO schema_migrations (name) VALUES ($1)",
              [file],
            );
          }
        } finally {
          skipClient.release();
        }
        continue;
      }
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
