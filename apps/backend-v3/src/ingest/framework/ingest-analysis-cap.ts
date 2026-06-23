/**
 * F-620: Daily circuit-breaker for ingest-triggered analysis enqueues.
 *
 * Prevents runaway cost if a regression re-opens the firehose.
 * Uses a simple in-memory counter that resets at midnight UTC.
 */

import { logger } from '../../lib/logger.js';

/** Hard daily cap on ingest-triggered analysis enqueues. */
const DAILY_CAP = 500;

let enqueueCount = 0;
let currentDay = todayUTC();

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Returns true if the daily cap has been exceeded (caller should skip enqueue).
 * Increments the counter on each call that returns false.
 */
export function checkIngestAnalysisDailyCap(): boolean {
  const today = todayUTC();
  if (today !== currentDay) {
    enqueueCount = 0;
    currentDay = today;
  }

  if (enqueueCount >= DAILY_CAP) {
    return true;
  }

  enqueueCount++;

  if (enqueueCount === DAILY_CAP) {
    logger.error(
      { cap: DAILY_CAP, day: currentDay },
      'F-620 CIRCUIT BREAKER: ingest analysis daily cap reached — all further ingest enqueues blocked until midnight UTC',
    );
  }

  return false;
}

/** Exposed for testing. */
export function resetDailyCap(): void {
  enqueueCount = 0;
  currentDay = todayUTC();
}
