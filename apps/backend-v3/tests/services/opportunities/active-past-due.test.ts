/**
 * Active view drops unworked past-due solicitations.
 *
 * Pins the rules the executive list depends on:
 *   - Active excludes a stated response date that has passed when nobody took
 *     the opportunity past interest
 *   - work in progress (qualified and beyond) survives a passed date
 *   - a missing response date is never treated as past due
 *   - include_past_due / due=past_due bring the stale rows back
 *   - other stage views are untouched
 *   - meta reports how many rows Active is hiding, so the tab badge can agree
 *     with the rows it lists
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/db.js', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { pool } from '../../../src/lib/db.js';
import { listOpportunitiesPaged } from '../../../src/services/opportunities/index.js';

const mockQuery = pool.query as ReturnType<typeof vi.fn>;

/** SQL of every query the call issued, in order. */
function sqlCalls(): string[] {
  return mockQuery.mock.calls.map(([sql]) => String(sql));
}

/** The data query (the one selecting opportunity rows for the page). */
function dataSql(): string {
  return sqlCalls().find((s) => s.includes('LIMIT $') && s.includes('OFFSET $')) ?? '';
}

/** The query counting rows Active hides. */
function hiddenCountSql(): string {
  return sqlCalls().find((s) => s.includes('NOT (NOT (')) ?? '';
}

const PAST_DUE_FRAGMENT = 'o.response_due_at < NOW()';

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockReset();
  // Every query in the paged path returns a benign shape: no opportunity rows,
  // so the test inspects the generated SQL rather than fixture data.
  mockQuery.mockResolvedValue({ rows: [{ total_count: 0, cnt: 7 }], rowCount: 1 });
});

describe('Active view — unworked past-due solicitations', () => {
  it('excludes a passed response date only when nothing moved past interest', async () => {
    await listOpportunitiesPaged({ stage: 'active', page: 1 });

    const sql = dataSql();
    expect(sql).toContain(PAST_DUE_FRAGMENT);
    // The exclusion is scoped by inaction: a card in any stage other than
    // interest keeps the row listed even after the date passes.
    expect(sql).toContain("pi3.stage <> 'interest'");
    // Missing is not past due.
    expect(sql).toContain('o.response_due_at IS NOT NULL');
  });

  it('keeps them when include_past_due is set', async () => {
    await listOpportunitiesPaged({ stage: 'active', page: 1, include_past_due: true });
    expect(dataSql()).not.toContain(PAST_DUE_FRAGMENT);
  });

  it('keeps them when the caller explicitly asks for the past-due view', async () => {
    await listOpportunitiesPaged({ stage: 'active', page: 1, due: 'past_due' });
    // due=past_due adds its own response_due_at bound; what must not happen is
    // the Active exclusion cancelling it out into an empty result.
    expect(dataSql()).not.toContain("pi3.stage <> 'interest'");
  });

  it('leaves other stage views alone', async () => {
    await listOpportunitiesPaged({ stage: 'won', page: 1 });
    expect(dataSql()).not.toContain("pi3.stage <> 'interest'");
  });

  it('reports the hidden count so the Active badge can match the list', async () => {
    const result = await listOpportunitiesPaged({ stage: 'active', page: 1 });

    // Counted over the stage-free base population, inverted to count exactly
    // the rows the list drops.
    expect(hiddenCountSql()).toContain(PAST_DUE_FRAGMENT);
    expect(result.meta?.active_past_due_hidden).toBe(7);
  });
});
