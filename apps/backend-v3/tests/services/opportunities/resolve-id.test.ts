/**
 * Unit tests for the ID resolution shim (Cleanup PR 3).
 *
 * Covers:
 *   - Bigint path: numeric string returns as-is (no DB call, no numeric conversion)
 *   - UUID path: valid UUID resolves via unified_opportunity_links lookup
 *   - UUID not found: valid UUID with no matching row returns null
 *   - Garbage string: returns null (no DB call)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveOpportunityId, UUID_RE } from '../../../src/services/opportunities/resolve-id.js';
import type pg from 'pg';

// ─── Mock pool ────────────────────────────────────────────────────────────────

let queryRows: Record<string, unknown>[] = [];
let lastQuerySql = '';
let lastQueryParams: unknown[] = [];

const mockPool = {
  query: vi.fn(async (sql: string, params?: unknown[]) => {
    lastQuerySql = sql;
    lastQueryParams = params ?? [];
    return { rows: queryRows, rowCount: queryRows.length };
  }),
} as unknown as pg.Pool;

beforeEach(() => {
  queryRows = [];
  lastQuerySql = '';
  lastQueryParams = [];
  mockPool.query = vi.fn(async (sql: string, params?: unknown[]) => {
    lastQuerySql = sql;
    lastQueryParams = params ?? [];
    return { rows: queryRows, rowCount: queryRows.length };
  });
});

// ─── UUID_RE export ───────────────────────────────────────────────────────────

describe('UUID_RE', () => {
  it('matches a valid lowercase UUID', () => {
    expect(UUID_RE.test('5c88bb80-e14d-4409-ba52-12b7445b25e3')).toBe(true);
  });

  it('matches a valid uppercase UUID', () => {
    expect(UUID_RE.test('5C88BB80-E14D-4409-BA52-12B7445B25E3')).toBe(true);
  });

  it('rejects non-UUID strings', () => {
    expect(UUID_RE.test('not-a-valid-id')).toBe(false);
    expect(UUID_RE.test('133532')).toBe(false);
    expect(UUID_RE.test('')).toBe(false);
  });
});

// ─── resolveOpportunityId ─────────────────────────────────────────────────────

describe('resolveOpportunityId', () => {
  it('bigint path: numeric string returns the string as-is without DB call', async () => {
    const result = await resolveOpportunityId(mockPool, '133532');
    expect(result).toBe('133532');
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('bigint path: large numeric string preserves precision (no parseInt)', async () => {
    const largeId = '9007199254740993';
    const result = await resolveOpportunityId(mockPool, largeId);
    expect(result).toBe(largeId);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('UUID path: valid UUID resolves to opportunity_id string via unified_opportunity_links', async () => {
    queryRows = [{ opportunity_id: 133532 }];
    const result = await resolveOpportunityId(mockPool, '5c88bb80-e14d-4409-ba52-12b7445b25e3');
    expect(result).toBe('133532');
    expect(mockPool.query).toHaveBeenCalledTimes(1);
    expect(lastQuerySql).toContain('unified_opportunity_links');
    expect(lastQueryParams).toEqual(['5c88bb80-e14d-4409-ba52-12b7445b25e3']);
  });

  it('UUID not found: valid UUID with no matching row returns null', async () => {
    queryRows = [];
    const result = await resolveOpportunityId(mockPool, '5c88bb80-e14d-4409-ba52-12b7445b25e3');
    expect(result).toBeNull();
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });

  it('garbage string: returns null without DB call', async () => {
    const result = await resolveOpportunityId(mockPool, 'not-an-id');
    expect(result).toBeNull();
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('empty string: returns null without DB call', async () => {
    const result = await resolveOpportunityId(mockPool, '');
    expect(result).toBeNull();
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('UUID-like but wrong length: returns null without DB call', async () => {
    const result = await resolveOpportunityId(mockPool, '5c88bb80-e14d-4409-ba52-12b7445b25e');
    expect(result).toBeNull();
    expect(mockPool.query).not.toHaveBeenCalled();
  });
});
