import { describe, it, expect } from 'vitest';

/**
 * Tests the auto-No-Bid threshold logic from the analysis worker.
 * We test the date math independently since the full worker requires pg-boss + DB.
 */

const AUTO_NO_BID_DAYS_THRESHOLD = 30;

function shouldAutoNoBid(responseDueAt: string | null, now: Date = new Date()): { isAutoNoBid: boolean; daysTodue: number | null } {
  if (!responseDueAt) return { isAutoNoBid: false, daysTodue: null };
  const daysTodue = Math.floor(
    (new Date(responseDueAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (daysTodue >= 0 && daysTodue < AUTO_NO_BID_DAYS_THRESHOLD) {
    return { isAutoNoBid: true, daysTodue };
  }
  return { isAutoNoBid: false, daysTodue };
}

describe('auto-No-Bid threshold', () => {
  const now = new Date('2026-06-07T12:00:00Z');

  it('triggers auto-No-Bid at 29 days (< 30)', () => {
    const due = new Date(now.getTime() + 29 * 24 * 60 * 60 * 1000).toISOString();
    const result = shouldAutoNoBid(due, now);
    expect(result.isAutoNoBid).toBe(true);
    expect(result.daysTodue).toBe(29);
  });

  it('does NOT trigger at 31 days (>= 30)', () => {
    const due = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000).toISOString();
    const result = shouldAutoNoBid(due, now);
    expect(result.isAutoNoBid).toBe(false);
  });

  it('triggers at exactly 0 days (due today)', () => {
    const due = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(); // 6h from now
    const result = shouldAutoNoBid(due, now);
    expect(result.isAutoNoBid).toBe(true);
    expect(result.daysTodue).toBe(0);
  });

  it('does NOT trigger for past-due opportunities (negative days)', () => {
    const due = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const result = shouldAutoNoBid(due, now);
    expect(result.isAutoNoBid).toBe(false);
    expect(result.daysTodue).toBe(-5);
  });

  it('does NOT trigger when response_due_at is null', () => {
    const result = shouldAutoNoBid(null, now);
    expect(result.isAutoNoBid).toBe(false);
    expect(result.daysTodue).toBeNull();
  });

  it('does NOT trigger at exactly 30 days (boundary)', () => {
    const due = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = shouldAutoNoBid(due, now);
    expect(result.isAutoNoBid).toBe(false);
  });

  it('triggers at 1 day', () => {
    const due = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString();
    const result = shouldAutoNoBid(due, now);
    expect(result.isAutoNoBid).toBe(true);
    expect(result.daysTodue).toBe(1);
  });
});
