#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * ============================================================================
 *  DESTRUCTIVE — MANUAL REVIEW REQUIRED BEFORE RUNNING
 * ============================================================================
 *
 * This script resets the opportunity pipeline to honour the owner's binding
 * rule: NOTHING enters the pipeline unless the user personally promotes it.
 *
 * It does TWO things:
 *
 *   1. CLASSIFY — stamps every opportunity currently sitting in
 *      assessment_status = 'intake' into 'pass' or 'ops_tracker' using the
 *      exact assessment rules in apps/backend-v3/src/services/assessment/rules.ts
 *      (no_naics / out_of_naics / deadline_lt_30d / commodity_purchase /
 *       low_pwin → pass; otherwise → ops_tracker, ranked by pWin/fit).
 *
 *   2. (REMOVED — F-600) Previously purged system/no_bid pipeline_items.
 *      Bulk DELETE on pipeline_items is now permanently blocked by the
 *      v3_106 BEFORE DELETE trigger. All pipeline items are owner-promoted
 *      decisions; terminal stages (no_bid, won, lost, gov_cancelled) are
 *      explicit owner verdicts, not junk. The trigger raises an exception
 *      on any DELETE unless SET LOCAL gda.allow_pipeline_delete = 'true'.
 *
 * SAFETY:
 *   - Runs in DRY-RUN by default: prints what WOULD change, writes nothing.
 *   - Requires the explicit flag  --apply  to mutate the database.
 *   - Requires a SECOND explicit flag  --i-understand-this-is-destructive
 *     before any DELETE is executed.
 *   - All writes run inside a single transaction; any error rolls back.
 *   - Do NOT wire this into a cron, the app boot path, or CI. Run it by hand,
 *     once, after Shawn has reviewed the dry-run output.
 *
 * USAGE:
 *   # 1) Review what would happen (no changes):
 *   DATABASE_URL=postgres://… pnpm tsx scripts/cleanup-pipeline-intake-reset.ts
 *
 *   # 2) Apply for real (only after reviewing the dry run):
 *   DATABASE_URL=postgres://… pnpm tsx scripts/cleanup-pipeline-intake-reset.ts \
 *     --apply --i-understand-this-is-destructive
 *
 * The classification logic below is intentionally INLINED (not imported from
 * the backend package) so this script is a self-contained, auditable artifact.
 * It must stay in sync with services/assessment/rules.ts — see that file for
 * the canonical version.
 * ============================================================================
 */

import pg from 'pg';

const { Client } = pg;

// ── Envision pursuit NAICS (mirror of constants/envision-naics.ts) ───────────
const ENVISION_NAICS = new Set<string>([
  '488111', '513210', '541310', '541330', '541511', '541512', '541513',
  '541519', '541611', '541618', '541690', '541715', '541990', '561110',
  '611430', '611512', '54151S', '54151HACS',
]);

const ASSESSMENT_DEADLINE_DAYS = 30;
const LOW_PWIN_THRESHOLD = 45;

type Status = 'pass' | 'ops_tracker';
interface Decision {
  status: Status;
  reason_code: string;
  reason: string;
  score: number | null;
}

interface OppRow {
  id: string;
  naics: string | null;
  response_due_at: string | null;
  psc: string | null;
  opportunity_type: string | null;
  part_number: string | null;
  quantity: number | null;
  pwin_score: number | null;
  pwin_band: string | null;
}

function isProductPsc(psc: string | null): boolean {
  const code = psc?.trim();
  if (!code) return false;
  return /^[0-9]/.test(code);
}

function isCommodityPurchase(r: OppRow): boolean {
  if (isProductPsc(r.psc)) return true;
  if (r.part_number && r.part_number.trim().length > 0) return true;
  if (r.quantity != null && !Number.isNaN(Number(r.quantity)) && Number(r.quantity) > 0) return true;
  const type = r.opportunity_type?.toLowerCase().trim();
  if (type && /(product|supply|supplies|commodit|goods|equipment|hardware|part)/.test(type)) return true;
  return false;
}

function assess(r: OppRow, now: Date): Decision {
  const naics = r.naics?.trim() || null;
  if (!naics) return { status: 'pass', reason_code: 'no_naics', reason: 'pass: no_naics', score: null };
  if (!ENVISION_NAICS.has(naics)) {
    return { status: 'pass', reason_code: 'out_of_naics', reason: `pass: out_of_naics (${naics})`, score: null };
  }
  if (r.response_due_at) {
    const days = Math.floor((new Date(r.response_due_at).getTime() - now.getTime()) / 86_400_000);
    if (!Number.isNaN(days) && days < ASSESSMENT_DEADLINE_DAYS) {
      return { status: 'pass', reason_code: 'deadline_lt_30d', reason: `pass: deadline_lt_30d (${days}d)`, score: null };
    }
  }
  if (isCommodityPurchase(r)) {
    return { status: 'pass', reason_code: 'commodity_purchase', reason: 'pass: commodity_purchase', score: null };
  }
  const score = typeof r.pwin_score === 'number' ? r.pwin_score : null;
  const band = r.pwin_band?.toLowerCase() ?? null;
  if (band === 'pass' || (score !== null && score < LOW_PWIN_THRESHOLD)) {
    return { status: 'pass', reason_code: 'low_pwin', reason: `pass: low_pwin${score !== null ? ` (${score})` : ''}`, score };
  }
  return {
    status: 'ops_tracker',
    reason_code: 'in_naics_good_fit',
    reason: `ops_tracker: in_naics_good_fit${score !== null ? ` (${score})` : ''}`,
    score,
  };
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const confirmed = process.argv.includes('--i-understand-this-is-destructive');
  const databaseUrl = process.env['DATABASE_URL'] ?? process.env['V3_DATABASE_URL'];

  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL (or V3_DATABASE_URL) must be set.');
    process.exit(1);
  }

  const mode = apply ? 'APPLY' : 'DRY-RUN';
  console.log(`=== Pipeline intake reset (${mode}) ===`);
  if (apply && !confirmed) {
    console.error(
      'REFUSING TO APPLY: pass --i-understand-this-is-destructive alongside --apply to proceed.',
    );
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const now = new Date();

  try {
    // ── 1. CLASSIFY intake opportunities ─────────────────────────────────────
    const { rows: intake } = await client.query<OppRow>(
      `SELECT id::text, naics, response_due_at::text, psc, opportunity_type,
              part_number, quantity,
              (analysis->'pwin'->>'score')::numeric AS pwin_score,
              (analysis->'pwin'->>'band')          AS pwin_band
         FROM opportunities
        WHERE deleted_at IS NULL AND assessment_status = 'intake'`,
    );

    const tally: Record<string, number> = {};
    let toPass = 0;
    let toOps = 0;
    for (const r of intake) {
      const d = assess(r, now);
      tally[d.reason_code] = (tally[d.reason_code] ?? 0) + 1;
      if (d.status === 'pass') toPass++;
      else toOps++;
    }

    console.log(`\n[classify] intake rows scanned: ${intake.length}`);
    console.log(`[classify]   → pass:        ${toPass}`);
    console.log(`[classify]   → ops_tracker: ${toOps}`);
    console.log(`[classify]   by reason: ${JSON.stringify(tally)}`);

    // ── 2. (REMOVED — F-600) pipeline_items DELETE is permanently blocked ──
    // Owner rule: every pipeline_item is an owner-promoted decision. The
    // v3_106 BEFORE DELETE trigger on pipeline_items raises an exception on
    // any DELETE. No automated/bulk process may remove rows from this table.
    // Stage transitions are the ONLY valid mutation — rows are NEVER removed.
    const { rows: pipelineCount } = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM pipeline_items`,
    );
    console.log(`\n[pipeline] total pipeline_items (protected by F-600 trigger): ${pipelineCount[0]?.n ?? '0'}`);

    if (!apply) {
      console.log('\nDRY-RUN complete. No changes written. Re-run with --apply --i-understand-this-is-destructive to commit.');
      return;
    }

    await client.query('BEGIN');

    let classified = 0;
    for (const r of intake) {
      const d = assess(r, now);
      await client.query(
        `UPDATE opportunities
            SET assessment_status = $1, assessment_reason = $2,
                assessment_score = $3, assessed_at = NOW(), updated_at = NOW()
          WHERE id = $4 AND deleted_at IS NULL`,
        [d.status, d.reason, d.score, r.id],
      );
      classified++;
    }

    await client.query('COMMIT');
    console.log(`\n[apply] classified ${classified} opportunities.`);
    console.log('[apply] pipeline_items untouched (F-600: DELETE permanently blocked).');
    console.log('APPLY complete.');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('FAILED — transaction rolled back:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

void main();
