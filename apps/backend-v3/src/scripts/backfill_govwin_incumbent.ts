#!/usr/bin/env tsx
/**
 * Backfill GovWin incumbent + competitors (#1145).
 *
 * Re-enriches every existing GovWin opportunity through the same path the ingest
 * job uses (`enrichGovWinOpportunityById`), then writes incumbent /
 * incumbent_confidence / incumbent_source / competitors. Works under whatever
 * GOVWIN_AUTH_MODE is configured — in prod that is CAS, so the NEO portal
 * session client performs the detail + companies/contracts fetches.
 *
 * The GovWin ID is recovered from `sam_notice_id` (`govwin-<id>`), which is how
 * the ingest job keys GovWin rows.
 *
 * Idempotent: safe to re-run. Only overwrites incumbent/competitors when the
 * enrichment actually produced a value, so a transient empty fetch never nulls
 * out previously-populated data.
 *
 * Modes:
 *   --dry-run (default): logs projected results, no DB writes.
 *   --apply:             commits enrichment results to the database.
 *
 * Usage:
 *   npx tsx src/scripts/backfill_govwin_incumbent.ts
 *   npx tsx src/scripts/backfill_govwin_incumbent.ts --apply
 */

import { pool } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import {
  enrichGovWinOpportunityById,
  getCallsThisHour,
  getHourlyLimit,
} from '../services/govwin/api_client.js';

/** Delay between opportunities to stay well under the discovery/rate caps. */
const REQUEST_DELAY_MS = parseInt(process.env['GOVWIN_BACKFILL_DELAY_MS'] ?? '250', 10);

interface GovWinRow {
  id: number;
  sam_notice_id: string;
}

function govwinIdFromNoticeId(samNoticeId: string): string | null {
  const m = /^govwin-(.+)$/.exec(samNoticeId);
  return m ? m[1]! : null;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const isApply = process.argv.slice(2).includes('--apply');
  const startedAt = new Date().toISOString();
  logger.info({ isApply, startedAt }, 'backfill_govwin_incumbent: starting');

  const { rows } = await pool.query<GovWinRow>(
    `SELECT id, sam_notice_id
       FROM opportunities
      WHERE data_source ILIKE '%govwin%'
        AND sam_notice_id LIKE 'govwin-%'
        AND deleted_at IS NULL
      ORDER BY id`,
  );

  let enriched = 0;
  let incumbentSet = 0;
  let competitorsSet = 0;
  let noData = 0;
  let errors = 0;
  let subEndpointCalls = 0;

  for (const row of rows) {
    const govwinId = govwinIdFromNoticeId(row.sam_notice_id);
    if (!govwinId) {
      continue;
    }

    try {
      const result = await enrichGovWinOpportunityById(govwinId);
      subEndpointCalls += result.subEndpointCalls;
      enriched += 1;

      const hasIncumbent = result.incumbent !== null;
      const hasCompetitors = result.competitors.length > 0;
      if (hasIncumbent) incumbentSet += 1;
      if (hasCompetitors) competitorsSet += 1;
      if (!hasIncumbent && !hasCompetitors) noData += 1;

      if (isApply && (hasIncumbent || hasCompetitors)) {
        await pool.query(
          `UPDATE opportunities
              SET incumbent = CASE WHEN $2::text IS NOT NULL THEN $2 ELSE incumbent END,
                  incumbent_confidence = CASE WHEN $2::text IS NOT NULL THEN $3 ELSE incumbent_confidence END,
                  incumbent_source = CASE WHEN $2::text IS NOT NULL THEN $4 ELSE incumbent_source END,
                  competitors = CASE WHEN jsonb_array_length($5::jsonb) > 0 THEN $5::jsonb ELSE competitors END,
                  updated_at = NOW()
            WHERE id = $1`,
          [
            row.id,
            result.incumbent,
            result.incumbent_confidence,
            result.incumbent_source,
            JSON.stringify(result.competitors),
          ],
        );
      }

      logger.info(
        {
          id: row.id,
          govwinId,
          incumbent: result.incumbent,
          competitors: result.competitors.length,
          subEndpointCalls: result.subEndpointCalls,
          applied: isApply && (hasIncumbent || hasCompetitors),
        },
        'backfill_govwin_incumbent: opp',
      );
    } catch (err) {
      errors += 1;
      logger.error(
        { id: row.id, govwinId, error: err instanceof Error ? err.message : String(err) },
        'backfill_govwin_incumbent: row error',
      );
    }

    await delay(REQUEST_DELAY_MS);
  }

  logger.info(
    {
      mode: isApply ? 'apply' : 'dry-run',
      total: rows.length,
      enriched,
      incumbentSet,
      competitorsSet,
      noData,
      errors,
      subEndpointCalls,
      callsThisHour: getCallsThisHour(),
      hourlyLimit: getHourlyLimit(),
    },
    'backfill_govwin_incumbent: complete',
  );

  await pool.end();
}

main().catch((err) => {
  logger.error(
    { err: err instanceof Error ? err.message : String(err) },
    'backfill_govwin_incumbent: fatal',
  );
  process.exit(1);
});
