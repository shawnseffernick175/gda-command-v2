/**
 * SAM.gov Backfill Script
 *
 * Re-ingests SAM opportunities for a configurable lookback period using
 * the corrected mapper (PR #218 — tsOrNull fix for empty timestamps).
 *
 * Context: F-004 caused 13-17 opportunities to be silently dropped every
 * 6-hour sync cycle. Over ~30 days at 4 cycles/day, approximately
 * 1,560-2,040 opportunities were never ingested. This script re-fetches
 * the full date range and upserts through the corrected mapper, filling
 * the gaps.
 *
 * Usage:
 *   DATABASE_URL=... SAM_API_KEY=... npx tsx src/scripts/sam-backfill.ts
 *   DATABASE_URL=... SAM_API_KEY=... npx tsx src/scripts/sam-backfill.ts --days 90
 *
 * On production:
 *   docker exec gda-backend node packages/backend/dist/scripts/sam-backfill.js
 */

import { syncSAMOpportunities } from "../lib/feed-sync";
import { getPool } from "../lib/db";

const daysArg = process.argv.find(a => a.startsWith("--days="))?.split("=")[1]
  ?? (process.argv.indexOf("--days") !== -1 ? process.argv[process.argv.indexOf("--days") + 1] : undefined)
  ?? "90";
const DAYS_BACK = parseInt(daysArg, 10);

async function main() {
  const pool = getPool();
  if (!pool) {
    process.stderr.write("[backfill] ERROR: DATABASE_URL not set\n");
    process.exit(1);
  }

  if (!process.env.SAM_API_KEY) {
    process.stderr.write("[backfill] ERROR: SAM_API_KEY not set\n");
    process.exit(1);
  }

  // Snapshot count before
  const { rows: [{ count: beforeCount }] } = await pool.query(
    "SELECT COUNT(*)::int AS count FROM sam_opportunities"
  );

  process.stdout.write(`[backfill] Starting SAM backfill for last ${DAYS_BACK} days\n`);
  process.stdout.write(`[backfill] Records before: ${beforeCount}\n`);

  const result = await syncSAMOpportunities(DAYS_BACK);

  // Snapshot count after
  const { rows: [{ count: afterCount }] } = await pool.query(
    "SELECT COUNT(*)::int AS count FROM sam_opportunities"
  );

  const newRecords = afterCount - beforeCount;

  process.stdout.write(`[backfill] Sync result: ${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`[backfill] Records after: ${afterCount}\n`);
  process.stdout.write(`[backfill] Net new records: ${newRecords}\n`);
  process.stdout.write(`[backfill] Errors during upsert: ${result.errors}\n`);

  if (result.errors > 0) {
    process.stdout.write(`[backfill] WARNING: ${result.errors} records still failed to upsert.\n`);
    process.stdout.write(`[backfill] Check logs for sam_sync_upsert_error entries.\n`);
  }

  if (result.status === "error") {
    process.stderr.write(`[backfill] FAILED: ${result.error}\n`);
    process.exit(1);
  }

  process.stdout.write("[backfill] Done.\n");
  await pool.end();
}

main().catch((e) => {
  process.stderr.write(`[backfill] fatal: ${e.message}\n`);
  process.exit(1);
});
