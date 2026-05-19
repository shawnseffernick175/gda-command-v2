/**
 * SAM Verification Scheduler (F-004 closure)
 *
 * Runs daily:
 *   1. Count SAM.gov opportunities for the window (posted_date)
 *   2. Count our DB records for the same window
 *   3. If gap exceeds 1%, run backfill
 *   4. Re-count and confirm gap closed
 *   5. Store results in sam_verification_runs table
 *
 * First run triggers on startup (30s delay). Subsequent runs every 24h.
 */

import { getPool } from "./db";
import { log } from "./logger";
import { isSAMConfigured, searchOpportunities, toSAMDate } from "./sam-api";
import { syncSAMOpportunities } from "./feed-sync";
import crypto from "crypto";

const TOLERANCE_PERCENT = 1;
const DAYS_TO_CHECK = 90;

interface VerifyResult {
  samCount: number;
  dbCount: number;
  gapPct: number;
}

async function countSAMApi(from: Date, to: Date): Promise<number> {
  const result = await searchOpportunities({
    postedFrom: toSAMDate(from),
    postedTo: toSAMDate(to),
    limit: 1,
    offset: 0,
  });
  return result.totalRecords;
}

async function countDB(from: Date, to: Date): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);
  const { rows: [{ count }] } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM sam_opportunities
     WHERE posted_date >= $1::date AND posted_date <= $2::date + INTERVAL '1 day'`,
    [fromStr, toStr],
  );
  return count;
}

async function verify(from: Date, to: Date): Promise<VerifyResult> {
  const samCount = await countSAMApi(from, to);
  const dbCount = await countDB(from, to);
  const gapPct = samCount > 0 ? ((Math.abs(samCount - dbCount) / samCount) * 100) : 0;
  return { samCount, dbCount, gapPct };
}

export async function runVerifyAndBackfill(): Promise<void> {
  const pool = getPool();
  if (!pool) {
    log.warn("sam_verify_skip", { reason: "no database connection" });
    return;
  }

  if (!isSAMConfigured()) {
    log.warn("sam_verify_skip", { reason: "SAM_API_KEY not set" });
    return;
  }

  const start = Date.now();
  const id = `sv-${crypto.randomUUID()}`;
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - DAYS_TO_CHECK);

  let status: "pass" | "fail" | "error" = "pass";
  let errorMessage: string | null = null;
  let backfillRan = false;
  let backfillFetched: number | null = null;
  let backfillUpserted: number | null = null;
  let backfillErrors: number | null = null;
  let dbCountAfter: number | null = null;
  let gapAfterPct: number | null = null;

  try {
    log.info("sam_verify_start", { id, days: DAYS_TO_CHECK });

    // Step 1: Verify current state
    const before = await verify(from, to);
    log.info("sam_verify_before", {
      id,
      samCount: before.samCount,
      dbCount: before.dbCount,
      gapPct: before.gapPct.toFixed(1),
    });

    // Step 2: If gap exceeds tolerance, run backfill
    if (before.gapPct > TOLERANCE_PERCENT) {
      log.info("sam_verify_backfill_triggered", {
        id,
        gapPct: before.gapPct.toFixed(1),
        tolerance: TOLERANCE_PERCENT,
      });

      backfillRan = true;
      const syncResult = await syncSAMOpportunities(DAYS_TO_CHECK);
      backfillFetched = syncResult.fetched;
      backfillUpserted = syncResult.upserted;
      backfillErrors = syncResult.errors;

      log.info("sam_verify_backfill_complete", {
        id,
        fetched: syncResult.fetched,
        upserted: syncResult.upserted,
        errors: syncResult.errors,
      });

      // Step 3: Re-verify after backfill
      const after = await verify(from, to);
      dbCountAfter = after.dbCount;
      gapAfterPct = after.gapPct;

      log.info("sam_verify_after", {
        id,
        samCount: after.samCount,
        dbCount: after.dbCount,
        gapPct: after.gapPct.toFixed(1),
      });

      status = after.gapPct <= TOLERANCE_PERCENT ? "pass" : "fail";
    } else {
      status = "pass";
    }

    // Step 4: Store results
    await pool.query(
      `INSERT INTO sam_verification_runs (
        id, ran_at, days_checked, sam_count, db_count_before, db_count_after,
        gap_before_pct, gap_after_pct, backfill_ran, backfill_fetched,
        backfill_upserted, backfill_errors, status, error_message, duration_ms
      ) VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        id, DAYS_TO_CHECK, before.samCount, before.dbCount, dbCountAfter,
        parseFloat(before.gapPct.toFixed(2)), gapAfterPct !== null ? parseFloat(gapAfterPct.toFixed(2)) : null,
        backfillRan, backfillFetched, backfillUpserted, backfillErrors,
        status, errorMessage, Date.now() - start,
      ],
    );

    log.info("sam_verify_complete", { id, status, durationMs: Date.now() - start });
  } catch (e) {
    status = "error";
    errorMessage = (e as Error).message;
    log.error("sam_verify_error", { id, error: errorMessage });

    // Best-effort: store the error result
    try {
      await pool.query(
        `INSERT INTO sam_verification_runs (
          id, ran_at, days_checked, sam_count, db_count_before,
          gap_before_pct, backfill_ran, status, error_message, duration_ms
        ) VALUES ($1, NOW(), $2, 0, 0, 0, FALSE, 'error', $3, $4)`,
        [id, DAYS_TO_CHECK, errorMessage, Date.now() - start],
      );
    } catch { /* best effort */ }
  }
}

// ---------------------------------------------------------------------------
// Scheduler (setInterval-based, started from server.ts)
// ---------------------------------------------------------------------------

let verifyTimer: ReturnType<typeof setInterval> | null = null;

export function startVerifyScheduler(intervalHours = 24): void {
  if (verifyTimer) return;
  const intervalMs = intervalHours * 60 * 60 * 1000;

  log.info("sam_verify_scheduled", { intervalHours });

  // Run on startup after a 30s delay (let DB and feed sync settle)
  setTimeout(() => {
    runVerifyAndBackfill().catch((e) =>
      log.error("sam_verify_scheduler_error", { error: (e as Error).message }),
    );
  }, 30_000);

  verifyTimer = setInterval(() => {
    runVerifyAndBackfill().catch((e) =>
      log.error("sam_verify_scheduler_error", { error: (e as Error).message }),
    );
  }, intervalMs);
}

export function stopVerifyScheduler(): void {
  if (verifyTimer) {
    clearInterval(verifyTimer);
    verifyTimer = null;
  }
}
