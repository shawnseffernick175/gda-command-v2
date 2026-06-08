/**
 * One-time backfill: mirrors all active legacy opportunities into
 * unified_opportunities + unified_opportunity_links.
 *
 * Idempotent — safe to re-run (uses link UNIQUE + update path).
 *
 * Usage: npm run backfill:unified
 * (or: npx tsx src/scripts/backfill-unified-opportunities.ts)
 */

import pg from 'pg';
import { mirrorOpportunityToUnified, type LegacyOpportunityRow } from '../services/opportunities/unified-mirror.js';

const { Pool } = pg;

const BATCH_SIZE = 500;

async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL']
    ?? 'postgresql://gda:gda_dev_password@localhost:5432/gda_command';

  const pool = new Pool({ connectionString: databaseUrl, max: 5 });

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let offset = 0;

  console.log('[backfill-unified] Starting backfill of legacy opportunities...');

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { rows } = await pool.query<LegacyOpportunityRow>(
      `SELECT id, data_source, sam_notice_id, govtribe_id, external_id,
              title, agency, sub_agency, naics, psc, set_aside,
              value_min, value_max, posted_at::text AS posted_at,
              response_due_at::text AS response_due_at, status
       FROM opportunities
       WHERE deleted_at IS NULL
       ORDER BY id
       LIMIT $1 OFFSET $2`,
      [BATCH_SIZE, offset],
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      const result = await mirrorOpportunityToUnified(pool, row);
      if (result.created) {
        created++;
      } else if (result.internal_id) {
        updated++;
      } else {
        skipped++;
      }
    }

    offset += rows.length;
    console.log(`[backfill-unified] Processed ${offset} rows (created=${created}, updated=${updated}, skipped=${skipped})`);
  }

  console.log(`[backfill-unified] Done. Total: created=${created}, updated=${updated}, skipped=${skipped}`);
  await pool.end();
}

main().catch((err) => {
  console.error('[backfill-unified] Fatal error:', err);
  process.exit(1);
});
