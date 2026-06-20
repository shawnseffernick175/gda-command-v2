#!/usr/bin/env tsx
/**
 * Clear assistant-seeded AOP plan rows from financial_plan.
 *
 * The FY26/FY27/FY28 AOP PLAN numbers with source = 'aop_seed' were seeded by an
 * assistant as benchmark guesses — they are NOT owner-/board-approved figures.
 * Owner rule: nothing exists in the tool unless the owner put it there. This
 * script lets the owner delete those seeded rows so the real board-approved AOP
 * can be entered in their place.
 *
 * SAFE BY DEFAULT: runs as a dry-run (counts only) unless --commit is passed.
 * Only ever touches rows WHERE source = 'aop_seed'. Owner-entered plan rows
 * (e.g. source = 'l1_target') are never affected.
 *
 * Usage:
 *   # Preview what would be deleted (no changes):
 *   npx tsx scripts/clear_aop_seed_plan.ts
 *
 *   # Actually delete the seeded rows:
 *   npx tsx scripts/clear_aop_seed_plan.ts --commit
 *
 *   # Limit to one fiscal year (optional):
 *   npx tsx scripts/clear_aop_seed_plan.ts --commit --fy=2026
 *
 * Environment:
 *   DATABASE_URL — Postgres connection string (defaults to local dev)
 */

import { pool } from '../src/lib/db.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const fyArg = args.find((a) => a.startsWith('--fy='));
  const fiscalYear = fyArg ? parseInt(fyArg.split('=')[1] ?? '', 10) : null;

  const where = ["source = 'aop_seed'"];
  const params: number[] = [];
  if (fiscalYear && !Number.isNaN(fiscalYear)) {
    params.push(fiscalYear);
    where.push(`fiscal_year = $${params.length}`);
  }
  const whereSql = where.join(' AND ');

  const { rows: preview } = await pool.query(
    `SELECT fiscal_year, COUNT(*)::int AS row_count
       FROM financial_plan
      WHERE ${whereSql}
      GROUP BY fiscal_year
      ORDER BY fiscal_year`,
    params,
  );

  const total = preview.reduce((s, r) => s + Number(r.row_count), 0);

  if (total === 0) {
    console.log('No source=\'aop_seed\' plan rows found. Nothing to clear.');
    await pool.end();
    return;
  }

  console.log(`Found ${total} source='aop_seed' plan row(s):`);
  for (const r of preview) {
    console.log(`  FY${Number(r.fiscal_year) % 100} (${r.fiscal_year}): ${r.row_count} row(s)`);
  }

  if (!commit) {
    console.log('\nDRY RUN — no rows deleted. Re-run with --commit to delete them.');
    await pool.end();
    return;
  }

  const { rowCount } = await pool.query(
    `DELETE FROM financial_plan WHERE ${whereSql}`,
    params,
  );
  console.log(`\nDeleted ${rowCount} source='aop_seed' plan row(s).`);
  console.log('Enter the board-approved AOP figures to replace them.');
  await pool.end();
}

main().catch((err) => {
  console.error('clear_aop_seed_plan failed:', err);
  process.exit(1);
});
