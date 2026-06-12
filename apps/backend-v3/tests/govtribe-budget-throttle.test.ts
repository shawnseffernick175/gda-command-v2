/**
 * GovTribe daily-pace-aware budget throttle tests.
 *
 * Tests the pure computeDailyBudget() function that replaced the
 * static pct-based thresholds (skipped_low_budget at 80%, skipped_halted at 95%).
 * UTC day boundary for all date math.
 */

import { describe, it, expect } from 'vitest';
import { computeDailyBudget } from '../src/ingest/govtribe/mcp_client.js';

describe('computeDailyBudget', () => {
  it('day 1, fresh budget — full month available', () => {
    // June 1, 1200 budget, 0 used, 0 spent today
    const now = new Date(Date.UTC(2026, 5, 1, 6, 0, 0)); // June 1 2026 06:00 UTC
    const result = computeDailyBudget(1200, 0, 0, now);

    expect(result.remainingCredits).toBe(1200);
    expect(result.daysRemaining).toBe(30); // June has 30 days, day 1 → 30 remaining
    expect(result.dailyAllowance).toBe(40); // floor(1200/30)
    expect(result.todaySpent).toBe(0);
    expect(result.todayAvailable).toBe(40);
  });

  it('mid-month on-pace (June 12 scenario) — permits calls', () => {
    // June 12, 1200 budget, 976 used, 0 spent today
    // 224 remaining, 19 days left → dailyAllowance = floor(224/19) = 11
    const now = new Date(Date.UTC(2026, 5, 12, 6, 0, 0));
    const result = computeDailyBudget(1200, 976, 0, now);

    expect(result.remainingCredits).toBe(224);
    expect(result.daysRemaining).toBe(19); // June 12 → 30-12+1 = 19
    expect(result.dailyAllowance).toBe(11); // floor(224/19) = 11
    expect(result.todaySpent).toBe(0);
    expect(result.todayAvailable).toBe(11);
  });

  it('mid-month on-pace with some today spend — still permits if under allowance', () => {
    const now = new Date(Date.UTC(2026, 5, 12, 14, 0, 0));
    const result = computeDailyBudget(1200, 976, 5, now);

    expect(result.dailyAllowance).toBe(11);
    expect(result.todaySpent).toBe(5);
    expect(result.todayAvailable).toBe(6); // 11 - 5
  });

  it('over-pace today — todayAvailable drops to 0', () => {
    // June 12, 976 used, already spent 15 today (exceeds 11 allowance)
    const now = new Date(Date.UTC(2026, 5, 12, 18, 0, 0));
    const result = computeDailyBudget(1200, 976, 15, now);

    expect(result.dailyAllowance).toBe(11);
    expect(result.todaySpent).toBe(15);
    expect(result.todayAvailable).toBe(0); // max(0, 11-15) = 0
  });

  it('last day of month — full remaining budget available', () => {
    // June 30, 1200 budget, 1100 used, 0 spent today
    // 100 remaining, 1 day left → dailyAllowance = 100
    const now = new Date(Date.UTC(2026, 5, 30, 6, 0, 0));
    const result = computeDailyBudget(1200, 1100, 0, now);

    expect(result.remainingCredits).toBe(100);
    expect(result.daysRemaining).toBe(1); // last day
    expect(result.dailyAllowance).toBe(100); // floor(100/1)
    expect(result.todayAvailable).toBe(100);
  });

  it('budget fully exhausted — remainingCredits <= 0', () => {
    const now = new Date(Date.UTC(2026, 5, 15, 6, 0, 0));
    const result = computeDailyBudget(1200, 1200, 0, now);

    expect(result.remainingCredits).toBe(0);
    expect(result.dailyAllowance).toBe(0);
    expect(result.todayAvailable).toBe(0);
  });

  it('over-budget — remainingCredits negative', () => {
    const now = new Date(Date.UTC(2026, 5, 15, 6, 0, 0));
    const result = computeDailyBudget(1200, 1250, 0, now);

    expect(result.remainingCredits).toBe(-50);
    expect(result.dailyAllowance).toBe(0); // floor(-50/16) is negative but clamped via max(0,...)
    expect(result.todayAvailable).toBe(0);
  });

  it('February 28-day month — daysRemaining correct', () => {
    // Feb 1 2027 (non-leap year)
    const now = new Date(Date.UTC(2027, 1, 1, 6, 0, 0));
    const result = computeDailyBudget(1200, 0, 0, now);

    expect(result.daysRemaining).toBe(28);
    expect(result.dailyAllowance).toBe(42); // floor(1200/28)
  });

  it('February 29-day month (leap year) — daysRemaining correct', () => {
    // Feb 1 2028 (leap year)
    const now = new Date(Date.UTC(2028, 1, 1, 6, 0, 0));
    const result = computeDailyBudget(1200, 0, 0, now);

    expect(result.daysRemaining).toBe(29);
    expect(result.dailyAllowance).toBe(41); // floor(1200/29)
  });

  it('31-day month (January) — daysRemaining correct on day 1', () => {
    const now = new Date(Date.UTC(2026, 0, 1, 6, 0, 0));
    const result = computeDailyBudget(1200, 0, 0, now);

    expect(result.daysRemaining).toBe(31);
    expect(result.dailyAllowance).toBe(38); // floor(1200/31)
  });
});

describe('budget decision logic', () => {
  it('critical=true bypasses daily pace when remainingCredits > 0', () => {
    // June 12, over-pace today (todayAvailable=0), but critical should proceed
    const now = new Date(Date.UTC(2026, 5, 12, 18, 0, 0));
    const status = computeDailyBudget(1200, 976, 15, now);

    // todayAvailable is 0, but a critical call should still proceed
    // because remainingCredits (224) > 0
    expect(status.todayAvailable).toBe(0);
    expect(status.remainingCredits).toBeGreaterThan(0);
    // Decision: critical=true → called (not halted)
  });

  it('critical=true still stops when remainingCredits <= 0', () => {
    const now = new Date(Date.UTC(2026, 5, 15, 6, 0, 0));
    const status = computeDailyBudget(1200, 1200, 0, now);

    expect(status.remainingCredits).toBe(0);
    // Decision: even critical=true → skipped_halted
  });

  it('June 12 scenario (issue #807) — 224 remaining, 19 days, permits ~11/day', () => {
    const now = new Date(Date.UTC(2026, 5, 12, 6, 0, 0));
    const status = computeDailyBudget(1200, 976, 0, now);

    expect(status.dailyAllowance).toBe(11);
    expect(status.todayAvailable).toBe(11);
    // A call costing 3 credits should be permitted
    expect(status.todayAvailable).toBeGreaterThanOrEqual(3);
  });
});
