#!/usr/bin/env tsx
/**
 * Backfill — auto-pass opportunities Envision cannot prime (#1126).
 *
 * Re-stamps existing opportunities whose set-aside eligibility resolves to
 * `team` (WOSB/EDWOSB/8(a)/HUBZone/SDVOSB/VOSB — no SBA cert) or `ineligible`
 * (SB set-aside where Envision is LARGE under the NAICS, or an unpriveable
 * "other"). These are not active pipeline work, so they must live in the
 * Passed view rather than the active Opportunities list.
 *
 * Mirrors cron/auto-pass-deadline.ts: sets relevance_status='auto_pass' AND
 * assessment_status='pass', writes an audit_log row, and is fully idempotent
 * (the WHERE clause only touches rows still NULL/'relevant', so a second run is
 * a no-op). manual_pass, off_profile, unknown_naics and already-auto_pass rows
 * are never touched.
 *
 * Uses the same doctrine resolver (resolveSetAsideEligibility) the display label
 * uses — no doctrine is duplicated here.
 *
 * Modes:
 *   --dry-run (default): reports what would change, no DB writes.
 *   --apply:             commits the re-stamp.
 *
 * Usage:
 *   npm run --workspace=apps/backend-v3 backfill:auto-pass-set-aside
 *   npm run --workspace=apps/backend-v3 backfill:auto-pass-set-aside -- --apply
 */

import { pool } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { recordAuditLog } from '../services/audit/audit-log.js';
import { resolveSetAsideEligibility } from '../services/opportunities/eligibility.js';
import fs from 'node:fs';
import path from 'node:path';

const BATCH_SIZE = 500;

interface CandidateRow {
  id: string;
  title: string;
  naics: string | null;
  set_aside: string | null;
  relevance_status: string | null;
  assessment_status: string | null;
}

interface BackfillReport {
  started_at: string;
  ended_at: string;
  mode: 'dry-run' | 'apply';
  scanned: number;
  auto_passed: number;
  left_relevant: number;
  breakdown: { team: number; ineligible: number };
  sample_changes: Array<{ id: string; title: string; set_aside: string | null; naics: string | null; reason: string }>;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');

  const startedAt = new Date().toISOString();
  logger.info({ isApply, startedAt }, '[backfill-auto-pass-set-aside] starting');

  const report: BackfillReport = {
    started_at: startedAt,
    ended_at: '',
    mode: isApply ? 'apply' : 'dry-run',
    scanned: 0,
    auto_passed: 0,
    left_relevant: 0,
    breakdown: { team: 0, ineligible: 0 },
    sample_changes: [],
  };

  let lastId = 0;

  while (true) {
    const { rows: batch } = await pool.query<CandidateRow>(
      `SELECT id::text, title, naics, set_aside,
              relevance_status, assessment_status
         FROM opportunities
        WHERE deleted_at IS NULL
          AND (relevance_status IS NULL OR relevance_status = 'relevant')
          AND id > $1
        ORDER BY id
        LIMIT $2`,
      [lastId, BATCH_SIZE],
    );

    if (batch.length === 0) break;

    for (const opp of batch) {
      lastId = Number(opp.id);
      report.scanned++;

      const eligibility = resolveSetAsideEligibility(opp.set_aside, opp.naics);
      if (eligibility.status !== 'team' && eligibility.status !== 'ineligible') {
        report.left_relevant++;
        continue;
      }

      report.auto_passed++;
      report.breakdown[eligibility.status]++;
      const reason = `auto_pass: set-aside not prime-able — ${eligibility.rationale}`;

      if (report.sample_changes.length < 20) {
        report.sample_changes.push({
          id: opp.id,
          title: opp.title,
          set_aside: opp.set_aside,
          naics: opp.naics,
          reason,
        });
      }

      if (!isApply) continue;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE opportunities
              SET relevance_status  = 'auto_pass',
                  relevance_reason  = $2,
                  assessment_status = 'pass',
                  assessment_reason = $2,
                  assessed_at       = NOW(),
                  updated_at        = NOW()
            WHERE id = $1
              AND deleted_at IS NULL
              AND (relevance_status IS NULL OR relevance_status = 'relevant')`,
          [opp.id, reason],
        );

        await recordAuditLog(client, {
          action: 'auto_pass_set_aside_backfill',
          table_name: 'opportunities',
          record_id: Number(opp.id),
          old_values: {
            relevance_status: opp.relevance_status,
            assessment_status: opp.assessment_status,
          },
          new_values: {
            relevance_status: 'auto_pass',
            assessment_status: 'pass',
          },
          actor: 'system:backfill-auto-pass-set-aside',
          source: 'system',
        });

        await client.query('COMMIT');
        logger.info(
          { opportunityId: opp.id, title: opp.title, eligibility: eligibility.status },
          '[backfill-auto-pass-set-aside] opportunity auto-passed (set-aside not prime-able)',
        );
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error(
          { opportunityId: opp.id, error: err instanceof Error ? err.message : String(err) },
          '[backfill-auto-pass-set-aside] failed to auto-pass opportunity',
        );
      } finally {
        client.release();
      }
    }

    if (report.scanned % 2000 === 0) {
      logger.info({ scanned: report.scanned }, '[backfill-auto-pass-set-aside] progress');
    }
  }

  report.ended_at = new Date().toISOString();

  const logsDir = path.resolve(import.meta.dirname, '..', '..', 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const reportPath = path.join(logsDir, `auto_pass_set_aside_backfill_${startedAt.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  logger.info(
    {
      mode: report.mode,
      scanned: report.scanned,
      auto_passed: report.auto_passed,
      left_relevant: report.left_relevant,
      breakdown: report.breakdown,
      reportPath,
    },
    '[backfill-auto-pass-set-aside] complete',
  );

  await pool.end();
}

main().catch((err) => {
  logger.error(
    { err: err instanceof Error ? err.message : String(err) },
    '[backfill-auto-pass-set-aside] fatal',
  );
  process.exit(1);
});
