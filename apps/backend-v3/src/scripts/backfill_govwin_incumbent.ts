#!/usr/bin/env tsx
/**
 * Backfill GovWin incumbent + competitors (#1145).
 *
 * Re-enriches existing GovWin opportunities by re-fetching the companies/
 * contracts sub-endpoints (via `enrichIncumbentCompetitors`, which dispatches on
 * GOVWIN_AUTH_MODE, so it works under CAS session auth). Writes incumbent /
 * incumbent_confidence / incumbent_source / competitors on rows where GovWin
 * provides the data. Idempotent: safe to re-run.
 *
 * Modes:
 *   --dry-run (default): fetches + reports projected updates, no DB writes.
 *   --apply:             commits enrichment results to the database.
 *   --all:               re-enrich every GovWin row (default: only rows missing
 *                        an incumbent).
 *
 * Usage:
 *   npx tsx src/scripts/backfill_govwin_incumbent.ts
 *   npx tsx src/scripts/backfill_govwin_incumbent.ts --apply
 *   npx tsx src/scripts/backfill_govwin_incumbent.ts --apply --all
 */

import { pool } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import {
  enrichIncumbentCompetitors,
  fetchOpportunityByIdApi,
} from '../services/govwin/api_client.js';
import fs from 'node:fs';
import path from 'node:path';

const REQUEST_DELAY_MS = 300;

interface BackfillEntry {
  opp_id: number;
  govwin_id: string;
  incumbent: string | null;
  competitors: number;
}

interface BackfillReport {
  started_at: string;
  ended_at: string;
  mode: 'dry-run' | 'apply';
  scope: 'missing-incumbent' | 'all';
  total_eligible: number;
  enriched: number;
  no_data: number;
  errors: number;
  sub_endpoint_calls: number;
  entries: BackfillEntry[];
}

/** Derive the GovWin opportunity id from sam_notice_id (`govwin-<id>`). */
function govwinIdFromNotice(samNoticeId: string | null): string | null {
  if (!samNoticeId) return null;
  const m = /^govwin-(.+)$/.exec(samNoticeId.trim());
  return m?.[1]?.trim() || null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const isAll = args.includes('--all');
  const startedAt = new Date().toISOString();

  const report: BackfillReport = {
    started_at: startedAt,
    ended_at: '',
    mode: isApply ? 'apply' : 'dry-run',
    scope: isAll ? 'all' : 'missing-incumbent',
    total_eligible: 0,
    enriched: 0,
    no_data: 0,
    errors: 0,
    sub_endpoint_calls: 0,
    entries: [],
  };

  const whereIncumbent = isAll ? '' : 'AND incumbent IS NULL';
  const { rows } = await pool.query<{
    id: number;
    sam_notice_id: string | null;
  }>(
    `SELECT id, sam_notice_id
       FROM opportunities
      WHERE data_source ILIKE '%govwin%'
        AND deleted_at IS NULL
        ${whereIncumbent}
      ORDER BY id`,
  );
  report.total_eligible = rows.length;
  logger.info(
    { total_eligible: report.total_eligible, mode: report.mode, scope: report.scope },
    'backfill_govwin_incumbent: starting',
  );

  for (const row of rows) {
    const govwinId = govwinIdFromNotice(row.sam_notice_id);
    if (!govwinId) {
      report.errors += 1;
      logger.warn({ opp_id: row.id, sam_notice_id: row.sam_notice_id }, 'backfill_govwin_incumbent: no govwin id');
      continue;
    }

    try {
      // Pull the detail record for inline incumbent/competitor fallbacks + links.
      const detail = await fetchOpportunityByIdApi(govwinId);
      if (detail) report.sub_endpoint_calls += 1;

      const result = await enrichIncumbentCompetitors(
        govwinId,
        detail?.links,
        detail?.incumbent ?? null,
        detail?.competitors ?? [],
      );
      report.sub_endpoint_calls += result.calls;

      const hasData = !!result.incumbent || result.competitors.length > 0;
      if (hasData) {
        if (isApply) {
          await pool.query(
            `UPDATE opportunities
                SET incumbent = COALESCE($1, incumbent),
                    incumbent_confidence = CASE WHEN $1 IS NOT NULL THEN 'high' ELSE incumbent_confidence END,
                    incumbent_source = CASE WHEN $1 IS NOT NULL THEN 'govwin' ELSE incumbent_source END,
                    competitors = CASE WHEN jsonb_array_length($2::jsonb) > 0 THEN $2::jsonb ELSE competitors END,
                    updated_at = NOW()
              WHERE id = $3`,
            [result.incumbent, JSON.stringify(result.competitors), row.id],
          );
        }
        report.enriched += 1;
        report.entries.push({
          opp_id: row.id,
          govwin_id: govwinId,
          incumbent: result.incumbent,
          competitors: result.competitors.length,
        });
      } else {
        report.no_data += 1;
      }
    } catch (err) {
      report.errors += 1;
      logger.error(
        { opp_id: row.id, govwin_id: govwinId, error: err instanceof Error ? err.message : String(err) },
        'backfill_govwin_incumbent: row error',
      );
    }

    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  }

  report.ended_at = new Date().toISOString();

  const logsDir = path.resolve(import.meta.dirname, '..', '..', 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const reportPath = path.join(
    logsDir,
    `govwin_incumbent_backfill_${startedAt.replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  logger.info(
    {
      mode: report.mode,
      scope: report.scope,
      total_eligible: report.total_eligible,
      enriched: report.enriched,
      no_data: report.no_data,
      errors: report.errors,
      sub_endpoint_calls: report.sub_endpoint_calls,
      reportPath,
    },
    'backfill_govwin_incumbent: complete',
  );

  await pool.end();
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'backfill_govwin_incumbent: fatal');
  process.exit(1);
});
