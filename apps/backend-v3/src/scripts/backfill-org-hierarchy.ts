/**
 * One-time backfill: populates the 5 new org hierarchy columns
 * (department_name, agency_name, office, contracting_office, org_path)
 * on existing SAM.gov rows.
 *
 * Idempotent -- only touches rows where department_name IS NULL.
 * Batched in chunks of 500 to avoid long transactions.
 *
 * Pagination uses a keyset cursor on id (WHERE id > lastId) rather than
 * OFFSET. OFFSET is unsafe here: the WHERE filter (department_name IS NULL)
 * matches a shrinking set as rows are updated, so a fixed OFFSET skips past
 * unprocessed rows and leaves gaps (the original bug needed 7 passes to
 * converge). Keyset pagination always advances past the last id seen, so it
 * converges in a single pass and never re-visits a row -- even rows whose
 * parse yields a null department_name (which would otherwise re-match the
 * filter forever).
 *
 * Usage: npx tsx src/scripts/backfill-org-hierarchy.ts
 */

import pg from 'pg';
import { parseFederalOrg } from '../lib/orgHierarchy.js';

const { Pool } = pg;

const BATCH_SIZE = 500;

async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL']
    ?? 'postgresql://gda:gda_dev_password@localhost:5432/gda_command';

  const pool = new Pool({ connectionString: databaseUrl, max: 5 });

  let updated = 0;
  let scanned = 0;
  // id is BIGSERIAL; pg returns it as a string. Keep the cursor as a string
  // and pass it as a bigint param. Start at 0 so the first batch begins at the
  // lowest id.
  let lastId = '0';

  console.log('[backfill-org-hierarchy] Starting backfill of SAM.gov org hierarchy...');

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { rows } = await pool.query<{
      id: string;
      agency: string | null;
      sub_agency: string | null;
      department: string | null;
    }>(
      `SELECT id, agency, sub_agency, department
       FROM opportunities
       WHERE data_source = 'sam.gov'
         AND department_name IS NULL
         AND id > $2::bigint
       ORDER BY id
       LIMIT $1`,
      [BATCH_SIZE, lastId],
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      const parsed = parseFederalOrg({
        agency: row.agency,
        sub_agency: row.sub_agency,
        department: row.department,
      });

      await pool.query(
        `UPDATE opportunities
         SET department_name = $1,
             agency_name = $2,
             office = $3,
             contracting_office = $4,
             org_path = $5
         WHERE id = $6`,
        [
          parsed.department_name,
          parsed.agency_name,
          parsed.office,
          parsed.contracting_office,
          parsed.org_path,
          row.id,
        ],
      );
      updated++;
    }

    // Advance the keyset cursor past the last id in this batch. Because we
    // always move forward on id, rows already visited (including those whose
    // parse left department_name null) are never selected again.
    const last = rows[rows.length - 1];
    if (!last) break;
    lastId = last.id;
    scanned += rows.length;
    console.log(`[backfill-org-hierarchy] Scanned ${scanned} rows (updated=${updated}, cursor=${lastId})`);
  }

  console.log(`[backfill-org-hierarchy] Done. Total updated: ${updated}`);
  await pool.end();
}

main().catch((err) => {
  console.error('[backfill-org-hierarchy] Fatal error:', err);
  process.exit(1);
});
