/**
 * SAM.gov Count Verification Script
 *
 * Compares the number of SAM records in our database for a given date
 * window against the count the SAM.gov API reports for the same window.
 * They should match within tolerance (~1-2% for timing/pagination edge
 * cases). If they don't, the ingest pipeline has a gap.
 *
 * Usage:
 *   DATABASE_URL=... SAM_API_KEY=... npx tsx src/scripts/sam-verify-counts.ts
 *   DATABASE_URL=... SAM_API_KEY=... npx tsx src/scripts/sam-verify-counts.ts --days 7
 *
 * On production:
 *   docker exec gda-backend node packages/backend/dist/scripts/sam-verify-counts.js
 */

import { getPool } from "../lib/db";
import { searchOpportunities, toSAMDate } from "../lib/sam-api";

const daysArg = process.argv.find(a => a.startsWith("--days="))?.split("=")[1]
  ?? (process.argv.indexOf("--days") !== -1 ? process.argv[process.argv.indexOf("--days") + 1] : undefined)
  ?? "7";
const DAYS_BACK = parseInt(daysArg, 10);

const TOLERANCE_PERCENT = 5;

async function main() {
  const pool = getPool();
  if (!pool) {
    process.stderr.write("[verify] ERROR: DATABASE_URL not set\n");
    process.exit(1);
  }

  if (!process.env.SAM_API_KEY) {
    process.stderr.write("[verify] ERROR: SAM_API_KEY not set\n");
    process.exit(1);
  }

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - DAYS_BACK);

  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  process.stdout.write(`[verify] Comparing counts for ${fromStr} to ${toStr} (${DAYS_BACK} days)\n`);

  // Query SAM.gov for total count (offset=0, limit=1 — we only need totalRecords)
  const samResult = await searchOpportunities({
    postedFrom: toSAMDate(from),
    postedTo: toSAMDate(to),
    limit: 1,
    offset: 0,
  });
  const samCount = samResult.totalRecords;

  // Query our database for the same window
  const { rows: [{ count: dbCount }] } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM sam_opportunities
     WHERE created_at >= $1::date AND created_at <= $2::date + INTERVAL '1 day'`,
    [fromStr, toStr]
  );

  const diff = Math.abs(samCount - dbCount);
  const pct = samCount > 0 ? ((diff / samCount) * 100).toFixed(1) : "0";

  process.stdout.write(`[verify] SAM.gov reports:  ${samCount} opportunities\n`);
  process.stdout.write(`[verify] Our database has: ${dbCount} opportunities\n`);
  process.stdout.write(`[verify] Difference:       ${diff} (${pct}%)\n`);

  if (parseFloat(pct) <= TOLERANCE_PERCENT) {
    process.stdout.write(`[verify] PASS — within ${TOLERANCE_PERCENT}% tolerance\n`);
  } else {
    process.stdout.write(`[verify] FAIL — gap exceeds ${TOLERANCE_PERCENT}% tolerance\n`);
    process.stdout.write(`[verify] Missing ~${samCount - dbCount} records from database\n`);
    process.exit(1);
  }

  await pool.end();
}

main().catch((e) => {
  process.stderr.write(`[verify] fatal: ${e.message}\n`);
  process.exit(1);
});
