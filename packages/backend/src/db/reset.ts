/**
 * Reset database — drops all tables and re-runs migrations + seed.
 * Usage: npx tsx src/db/reset.ts
 */

import pg from "pg";
import { execSync } from "child_process";
import path from "path";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://gda:gda_dev_password@localhost:5432/gda";

async function reset() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  process.stdout.write("[reset] Dropping all tables...\n");
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await pool.end();
  process.stdout.write("[reset] Schema dropped. Running migrations...\n");

  const backendDir = path.resolve(__dirname, "../..");
  execSync("npx tsx src/db/migrate.ts", {
    cwd: backendDir,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL },
  });

  process.stdout.write("[reset] Running seed...\n");
  execSync("npx tsx src/db/seed.ts", {
    cwd: backendDir,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL },
  });
}

reset().catch((e) => {
  process.stderr.write(`[reset] fatal: ${e.message}\n`);
  process.exit(1);
});
