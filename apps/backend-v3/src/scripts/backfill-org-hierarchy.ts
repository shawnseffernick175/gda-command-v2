/**
 * One-time backfill: populates the 5 new org hierarchy columns
 * (department_name, agency_name, office, contracting_office, org_path)
 * on existing SAM.gov rows.
 *
 * Idempotent -- only touches rows where department_name IS NULL.
 * Batched in chunks of 500 to avoid long transactions.
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
  let offset = 0;

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
       ORDER BY id
       LIMIT $1 OFFSET $2`,
      [BATCH_SIZE, offset],
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

    offset += rows.length;
    console.log(`[backfill-org-hierarchy] Processed ${offset} rows (updated=${updated})`);
  }

  console.log(`[backfill-org-hierarchy] Done. Total updated: ${updated}`);
  await pool.end();
}

main().catch((err) => {
  console.error('[backfill-org-hierarchy] Fatal error:', err);
  process.exit(1);
});
