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

const recordAuditSpy = vi.fn(async () => 1);
vi.mock('../../../src/services/audit/audit-log.js', () => ({
  recordAuditLog: (...args: unknown[]) => recordAuditSpy(...args),
}));

// ─── Mock pool ───────────────────────────────────────────────────────────────

let lastSql = '';
let lastParams: unknown[] = [];
let nextRows: Record<string, unknown>[] = [];

// Steps queue for the transactional decideMatchSuggestion path.
interface Step {
  match: RegExp;
  rows?: Record<string, unknown>[];
  rowCount?: number;
}
let clientSteps: Step[] = [];
let clientExecuted: string[] = [];

function makeClient() {
  return {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      clientExecuted.push(sql.trim().split('\n')[0]!.trim());
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      const step = clientSteps.find((s) => s.match.test(sql));
      if (step) {
        return { rows: step.rows ?? [], rowCount: step.rowCount ?? (step.rows?.length ?? 0) };
      }
      // fallback for list queries (non-transactional)
      lastSql = sql;
      lastParams = params ?? [];
      return { rows: nextRows, rowCount: nextRows.length };
    }),
    release: vi.fn(),
  };
}

let client: ReturnType<typeof makeClient>;

const mockPool = {
  query: vi.fn(async (sql: string, params?: unknown[]) => {
    lastSql = sql;
    lastParams = params ?? [];
    return { rows: nextRows, rowCount: nextRows.length };
  }),
  connect: vi.fn(async () => client),
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
  clientSteps = [];
  clientExecuted = [];
  client = makeClient();
  mockPool.query.mockClear();
  mockPool.connect.mockClear();
  invalidateSpy.mockClear();
  recordAuditSpy.mockClear();
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

  it('emits a cursor encoding a NULL matched_at when the last row has none', async () => {
    // Regression (Devin finding): rows whose matched_at is NULL must still
    // produce a usable cursor; the encoded value is null and the SQL must
    // COALESCE both sides so the next page does not silently return zero rows.
    nextRows = [
      suggestionRow({ link_id: 3, matched_at: null }),
      suggestionRow({ link_id: 2, matched_at: null }),
    ];
    const res = await listMatchSuggestions(mockPool as unknown as pg.Pool, { limit: 1 });
    expect(res.pagination.hasMore).toBe(true);
    const decoded = JSON.parse(
      Buffer.from(res.pagination.cursor as string, 'base64').toString('utf-8'),
    );
    expect(decoded.matched_at).toBeNull();
    expect(decoded.link_id).toBe(3);
  });

  it('COALESCEs both sides of the cursor comparison for NULL safety', async () => {
    nextRows = [];
    const cursor = Buffer.from(
      JSON.stringify({ matched_at: null, link_id: 5 }),
    ).toString('base64');
    await listMatchSuggestions(mockPool as unknown as pg.Pool, { cursor });
    // Both column and parameter sides must be wrapped in COALESCE(...'-infinity').
    const coalesceCount = (lastSql.match(/COALESCE\(/g) ?? []).length;
    expect(coalesceCount).toBeGreaterThanOrEqual(3); // ORDER BY + both cursor sides
    expect(lastSql).toContain("COALESCE($");
  });
});

// ─── decideMatchSuggestion ────────────────────────────────────────────────────

describe('decideMatchSuggestion', () => {
  function setupConfirmSteps(overrides: Record<string, unknown> = {}) {
    clientSteps = [
      {
        match: /SELECT confidence.*FROM unified_opportunity_links/,
        rows: [{ confidence: overrides.priorConfidence ?? 'MEDIUM' }],
      },
      {
        match: /UPDATE unified_opportunity_links/,
        rows: [{
          link_id: overrides.link_id ?? 7,
          internal_id: overrides.internal_id ?? 'iid-1',
          source: overrides.source ?? 'govtribe',
          source_native_id: overrides.source_native_id ?? 'gt-123',
          confidence: overrides.confidence ?? 'CONFIRMED',
          confirmed_by: overrides.confirmed_by ?? 'user-42',
          confirmed_at: overrides.confirmed_at ?? '2026-06-02T01:00:00Z',
        }],
      },
    ];
  }

  it('confirm sets confidence=CONFIRMED and stamps confirmed_by', async () => {
    setupConfirmSteps();
    const res = await decideMatchSuggestion(mockPool as unknown as pg.Pool, {
      link_id: 7,
      action: 'confirm',
      decided_by: 'user-42',
    });
    expect(res).not.toBeNull();
    expect(res!.confidence).toBe('CONFIRMED');
    expect(res!.confirmed_by).toBe('user-42');
    expect(clientExecuted).toContain('BEGIN');
    expect(clientExecuted).toContain('COMMIT');
    expect(recordAuditSpy).toHaveBeenCalledOnce();
  });

  it('reject sets confidence=REJECTED', async () => {
    setupConfirmSteps({
      link_id: 8, internal_id: 'iid-2', source: 'sam',
      source_native_id: 's-9', confidence: 'REJECTED',
      confirmed_by: 'user-1',
    });
    const res = await decideMatchSuggestion(mockPool as unknown as pg.Pool, {
      link_id: 8,
      action: 'reject',
      decided_by: 'user-1',
    });
    expect(res!.confidence).toBe('REJECTED');
  });

  it('guards the UPDATE to pending tiers only', async () => {
    setupConfirmSteps();
    await decideMatchSuggestion(mockPool as unknown as pg.Pool, {
      link_id: 7,
      action: 'confirm',
      decided_by: 'u',
    });
    const updateCall = client.query.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && /UPDATE unified_opportunity_links/.test(c[0] as string),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![0]).toContain("confidence IN ('MEDIUM', 'LOW')");
  });

  it('returns null when no pending link matches (unknown or already decided)', async () => {
    clientSteps = [
      { match: /SELECT confidence.*FROM unified_opportunity_links/, rows: [] },
    ];
    const res = await decideMatchSuggestion(mockPool as unknown as pg.Pool, {
      link_id: 999,
      action: 'confirm',
      decided_by: 'u',
    });
    expect(res).toBeNull();
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(recordAuditSpy).not.toHaveBeenCalled();
  });

  it('invalidates the merge cache for the affected internal_id on success', async () => {
    setupConfirmSteps({ internal_id: 'iid-77' });
    await decideMatchSuggestion(mockPool as unknown as pg.Pool, {
      link_id: 7,
      action: 'confirm',
      decided_by: 'u',
    });
    expect(invalidateSpy).toHaveBeenCalledWith('iid-77');
  });

  it('calls recordAuditLog with correct action and old/new values', async () => {
    setupConfirmSteps({ priorConfidence: 'LOW' });
    await decideMatchSuggestion(mockPool as unknown as pg.Pool, {
      link_id: 7,
      action: 'confirm',
      decided_by: 'user-42',
      request_id: 'req-1',
    });
    expect(recordAuditSpy).toHaveBeenCalledOnce();
    const entry = recordAuditSpy.mock.calls[0]![1] as Record<string, unknown>;
    expect(entry.action).toBe('match_suggestion_confirm');
    expect(entry.table_name).toBe('unified_opportunity_links');
    expect(entry.old_values).toEqual({ confidence: 'LOW' });
    expect(entry.new_values).toEqual({ confidence: 'CONFIRMED' });
    expect(entry.actor).toBe('user-42');
    expect(entry.request_id).toBe('req-1');
  });
});
