/**
 * Unit tests for the F-412 match-suggestions queue service.
 *
 * Covers:
 *   - clampLimit: default, clamp low/high, NaN guard, truncation
 *   - isValidAction: confirm/reject accepted, others rejected
 *   - listMatchSuggestions: default tier filter (MEDIUM+LOW), single-tier,
 *     internal_id filter, row mapping/coercion, pagination + cursor,
 *     terminal-tier guard returns empty
 *   - decideMatchSuggestion: confirm/reject set confidence + stamp,
 *     SQL guards on pending tiers, null when no row, cache invalidation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock merge cache invalidation ───────────────────────────────────────────

const invalidateSpy = vi.fn();
vi.mock('../../../src/services/opportunities/merge.js', () => ({
  invalidateMergeCache: (id: string) => invalidateSpy(id),
}));

// ─── Mock pool ───────────────────────────────────────────────────────────────

let lastSql = '';
let lastParams: unknown[] = [];
let nextRows: Record<string, unknown>[] = [];

const mockPool = {
  query: vi.fn(async (sql: string, params?: unknown[]) => {
    lastSql = sql;
    lastParams = params ?? [];
    return { rows: nextRows, rowCount: nextRows.length };
  }),
};

import {
  listMatchSuggestions,
  decideMatchSuggestion,
  clampLimit,
  isValidAction,
  PENDING_CONFIDENCES,
} from '../../../src/services/opportunities/match-suggestions.js';
import type pg from 'pg';

function suggestionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    link_id: 7,
    internal_id: 'iid-1',
    source: 'govtribe',
    source_native_id: 'gt-123',
    confidence: 'MEDIUM',
    match_method: 'fuzzy_title_agency',
    matched_at: '2026-06-01T00:00:00Z',
    lifecycle_stage: 'solicitation',
    primary_source: 'sam',
    title: 'A Title',
    agency: 'Navy',
    naics: '541512',
    estimated_value_cents: '1000000', // pg bigint as string
    response_due_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  lastSql = '';
  lastParams = [];
  nextRows = [];
  mockPool.query.mockClear();
  invalidateSpy.mockClear();
});

// ─── clampLimit ───────────────────────────────────────────────────────────────

describe('clampLimit', () => {
  it('defaults to 50 when undefined', () => {
    expect(clampLimit(undefined)).toBe(50);
  });

  it('coerces numeric strings', () => {
    expect(clampLimit('25')).toBe(25);
  });

  it('clamps below 1 up to 1', () => {
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(-10)).toBe(1);
  });

  it('clamps above 200 down to 200', () => {
    expect(clampLimit(9999)).toBe(200);
  });

  it('guards NaN from non-numeric input (regression)', () => {
    expect(clampLimit('abc')).toBe(50);
    expect(clampLimit(NaN)).toBe(50);
    expect(clampLimit(Infinity)).toBe(50);
  });

  it('truncates fractional values', () => {
    expect(clampLimit(10.9)).toBe(10);
  });
});

// ─── isValidAction ────────────────────────────────────────────────────────────

describe('isValidAction', () => {
  it('accepts confirm and reject', () => {
    expect(isValidAction('confirm')).toBe(true);
    expect(isValidAction('reject')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isValidAction('delete')).toBe(false);
    expect(isValidAction('')).toBe(false);
    expect(isValidAction(undefined)).toBe(false);
    expect(isValidAction(42)).toBe(false);
  });
});

// ─── listMatchSuggestions ─────────────────────────────────────────────────────

describe('listMatchSuggestions', () => {
  it('defaults to both pending tiers (MEDIUM + LOW)', async () => {
    nextRows = [suggestionRow()];
    await listMatchSuggestions(mockPool as unknown as pg.Pool, {});
    expect(lastParams[0]).toEqual([...PENDING_CONFIDENCES]);
    expect(lastSql).toContain('= ANY(');
  });

  it('narrows to a single tier when confidence supplied', async () => {
    nextRows = [];
    await listMatchSuggestions(mockPool as unknown as pg.Pool, { confidence: 'medium' });
    expect(lastParams[0]).toBe('MEDIUM'); // upper-cased
    expect(lastSql).toContain('l.confidence = $1');
  });

  it('returns empty page for a terminal/unknown tier without querying rows', async () => {
    const res = await listMatchSuggestions(mockPool as unknown as pg.Pool, {
      confidence: 'CONFIRMED',
    });
    expect(res.items).toEqual([]);
    expect(res.pagination.hasMore).toBe(false);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('applies an internal_id filter', async () => {
    nextRows = [];
    await listMatchSuggestions(mockPool as unknown as pg.Pool, { internal_id: 'iid-9' });
    expect(lastParams).toContain('iid-9');
    expect(lastSql).toContain('l.internal_id =');
  });

  it('maps rows and coerces bigint to number', async () => {
    nextRows = [suggestionRow()];
    const res = await listMatchSuggestions(mockPool as unknown as pg.Pool, {});
    expect(res.items).toHaveLength(1);
    const item = res.items[0]!;
    expect(item.link_id).toBe(7);
    expect(item.confidence).toBe('MEDIUM');
    expect(item.opportunity.estimated_value_cents).toBe(1000000);
    expect(typeof item.opportunity.estimated_value_cents).toBe('number');
    expect(item.opportunity.title).toBe('A Title');
  });

  it('sets hasMore + nextCursor when over the limit', async () => {
    nextRows = [
      suggestionRow({ link_id: 3 }),
      suggestionRow({ link_id: 2 }),
      suggestionRow({ link_id: 1 }),
    ];
    const res = await listMatchSuggestions(mockPool as unknown as pg.Pool, { limit: 2 });
    expect(res.items).toHaveLength(2);
    expect(res.pagination.hasMore).toBe(true);
    expect(res.pagination.cursor).toBeTypeOf('string');
    const decoded = JSON.parse(
      Buffer.from(res.pagination.cursor as string, 'base64').toString('utf-8'),
    );
    expect(decoded.link_id).toBe(2); // last item in the returned slice
  });

  it('no nextCursor when results fit within the limit', async () => {
    nextRows = [suggestionRow()];
    const res = await listMatchSuggestions(mockPool as unknown as pg.Pool, { limit: 50 });
    expect(res.pagination.hasMore).toBe(false);
    expect(res.pagination.cursor).toBeNull();
  });
});

// ─── decideMatchSuggestion ────────────────────────────────────────────────────

describe('decideMatchSuggestion', () => {
  it('confirm sets confidence=CONFIRMED and stamps confirmed_by', async () => {
    nextRows = [
      {
        link_id: 7,
        internal_id: 'iid-1',
        source: 'govtribe',
        source_native_id: 'gt-123',
        confidence: 'CONFIRMED',
        confirmed_by: 'user-42',
        confirmed_at: '2026-06-02T01:00:00Z',
      },
    ];
    const res = await decideMatchSuggestion(mockPool as unknown as pg.Pool, {
      link_id: 7,
      action: 'confirm',
      decided_by: 'user-42',
    });
    expect(res).not.toBeNull();
    expect(res!.confidence).toBe('CONFIRMED');
    expect(res!.confirmed_by).toBe('user-42');
    expect(lastParams[0]).toBe('CONFIRMED');
    expect(lastParams[1]).toBe('user-42');
    expect(lastParams[2]).toBe(7);
  });

  it('reject sets confidence=REJECTED', async () => {
    nextRows = [
      {
        link_id: 8,
        internal_id: 'iid-2',
        source: 'sam',
        source_native_id: 's-9',
        confidence: 'REJECTED',
        confirmed_by: 'user-1',
        confirmed_at: '2026-06-02T01:00:00Z',
      },
    ];
    const res = await decideMatchSuggestion(mockPool as unknown as pg.Pool, {
      link_id: 8,
      action: 'reject',
      decided_by: 'user-1',
    });
    expect(res!.confidence).toBe('REJECTED');
    expect(lastParams[0]).toBe('REJECTED');
  });

  it('guards the UPDATE to pending tiers only', async () => {
    nextRows = [
      {
        link_id: 7,
        internal_id: 'iid-1',
        source: 'govtribe',
        source_native_id: 'gt-123',
        confidence: 'CONFIRMED',
        confirmed_by: 'u',
        confirmed_at: '2026-06-02T01:00:00Z',
      },
    ];
    await decideMatchSuggestion(mockPool as unknown as pg.Pool, {
      link_id: 7,
      action: 'confirm',
      decided_by: 'u',
    });
    expect(lastSql).toContain("confidence IN ('MEDIUM', 'LOW')");
  });

  it('returns null when no pending link matches (unknown or already decided)', async () => {
    nextRows = [];
    const res = await decideMatchSuggestion(mockPool as unknown as pg.Pool, {
      link_id: 999,
      action: 'confirm',
      decided_by: 'u',
    });
    expect(res).toBeNull();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('invalidates the merge cache for the affected internal_id on success', async () => {
    nextRows = [
      {
        link_id: 7,
        internal_id: 'iid-77',
        source: 'govtribe',
        source_native_id: 'gt-123',
        confidence: 'CONFIRMED',
        confirmed_by: 'u',
        confirmed_at: '2026-06-02T01:00:00Z',
      },
    ];
    await decideMatchSuggestion(mockPool as unknown as pg.Pool, {
      link_id: 7,
      action: 'confirm',
      decided_by: 'u',
    });
    expect(invalidateSpy).toHaveBeenCalledWith('iid-77');
  });
});
