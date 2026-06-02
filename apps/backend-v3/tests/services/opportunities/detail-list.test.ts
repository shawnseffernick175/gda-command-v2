/**
 * Unit tests for the F-411 unified list + stage filtering.
 *
 * Covers:
 *   - resolveStages: single stage, group expansion, unknown token, undefined
 *   - listUnifiedOpportunities maps rows, coerces bigint/smallint
 *   - stage group filter passes the expanded array to the query
 *   - pagination: hasMore + nextCursor when over limit
 *   - limit clamping
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

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
  listUnifiedOpportunities,
  resolveStages,
  STAGE_GROUPS,
} from '../../../src/services/opportunities/detail.js';
import type pg from 'pg';

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    internal_id: 'iid-1',
    lifecycle_stage: 'solicitation',
    primary_source: 'sam',
    title: 'A Title',
    agency: 'Navy',
    naics: '541512',
    set_aside: 'SDVOSB',
    estimated_value_cents: '1000000', // pg returns bigint as string
    response_due_at: '2026-07-01T00:00:00Z',
    posted_at: '2026-06-01T00:00:00Z',
    pwin: 70,
    doctrine_status: 'qualified',
    updated_at: '2026-06-02T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  lastSql = '';
  lastParams = [];
  nextRows = [];
  mockPool.query.mockClear();
});

describe('resolveStages (F-411)', () => {
  it('returns null when no stage given', () => {
    expect(resolveStages(undefined)).toBeNull();
  });
  it('expands a known group', () => {
    expect(resolveStages('pipeline')).toEqual(['forecast', 'pre_sol']);
    expect(resolveStages('active')).toEqual(['solicitation']);
    expect(resolveStages('awarded')).toEqual(STAGE_GROUPS.awarded as string[]);
  });
  it('passes through a single valid lifecycle_stage', () => {
    expect(resolveStages('signal')).toEqual(['signal']);
    expect(resolveStages('closed')).toEqual(['closed']);
  });
  it('returns empty array for an unknown token (caller should 400)', () => {
    expect(resolveStages('bogus')).toEqual([]);
  });
});

describe('listUnifiedOpportunities (F-411)', () => {
  it('maps rows and coerces bigint/smallint to numbers', async () => {
    nextRows = [row()];
    const result = await listUnifiedOpportunities(mockPool as unknown as pg.Pool, {});
    expect(result.items).toHaveLength(1);
    expect(result.items[0].estimated_value_cents).toBe(1000000);
    expect(typeof result.items[0].estimated_value_cents).toBe('number');
    expect(result.items[0].pwin).toBe(70);
    expect(result.items[0].internal_id).toBe('iid-1');
  });

  it('passes the expanded stage group array to the query', async () => {
    nextRows = [];
    await listUnifiedOpportunities(mockPool as unknown as pg.Pool, { stage: 'pipeline' });
    expect(lastSql).toContain('lifecycle_stage = ANY');
    // first param should be the expanded group
    expect(lastParams[0]).toEqual(['forecast', 'pre_sol']);
  });

  it('passes a single stage value through', async () => {
    nextRows = [];
    await listUnifiedOpportunities(mockPool as unknown as pg.Pool, { stage: 'signal' });
    expect(lastParams[0]).toEqual(['signal']);
  });

  it('sets hasMore + nextCursor when results exceed limit', async () => {
    // limit 2 → request 3, return 3 → hasMore true, items sliced to 2
    nextRows = [
      row({ internal_id: 'a', updated_at: '2026-06-03T00:00:00Z' }),
      row({ internal_id: 'b', updated_at: '2026-06-02T00:00:00Z' }),
      row({ internal_id: 'c', updated_at: '2026-06-01T00:00:00Z' }),
    ];
    const result = await listUnifiedOpportunities(mockPool as unknown as pg.Pool, { limit: 2 });
    expect(result.items).toHaveLength(2);
    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.cursor).not.toBeNull();
    // cursor decodes to the last returned item (b)
    const decoded = JSON.parse(
      Buffer.from(result.pagination.cursor!, 'base64').toString('utf-8'),
    );
    expect(decoded.internal_id).toBe('b');
  });

  it('no nextCursor when results fit within limit', async () => {
    nextRows = [row()];
    const result = await listUnifiedOpportunities(mockPool as unknown as pg.Pool, { limit: 50 });
    expect(result.pagination.hasMore).toBe(false);
    expect(result.pagination.cursor).toBeNull();
  });

  it('falls back to default 50 when limit is non-numeric (NaN guard)', async () => {
    nextRows = [];
    // Simulates route passing Number('abc') === NaN through to the service.
    await listUnifiedOpportunities(mockPool as unknown as pg.Pool, { limit: NaN });
    // last param is limit+1; NaN must NOT propagate — defaults to 50 → 51.
    expect(lastParams[lastParams.length - 1]).toBe(51);
  });

  it('clamps limit to the 1..200 range', async () => {
    nextRows = [];
    await listUnifiedOpportunities(mockPool as unknown as pg.Pool, { limit: 9999 });
    // last param is limit+1; clamped 200 → 201
    expect(lastParams[lastParams.length - 1]).toBe(201);
  });
});
