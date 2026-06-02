/**
 * Unit tests for the F-413 field-override service (with audit trail).
 *
 * Covers:
 *   - isOverridableField allow-list
 *   - setFieldOverrideWithAudit: set path (upsert + audit), clear path
 *     (delete + audit), old_value capture, 404 when opportunity missing,
 *     transaction BEGIN/COMMIT, ROLLBACK on error, merge cache invalidation
 *   - getFieldOverrideAudit: field filter, row mapping, ordering
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const invalidateSpy = vi.fn();
vi.mock('../../../src/services/opportunities/merge.js', () => ({
  invalidateMergeCache: (id: string) => invalidateSpy(id),
}));

import {
  setFieldOverrideWithAudit,
  getFieldOverrideAudit,
  isOverridableField,
  OVERRIDABLE_FIELDS,
} from '../../../src/services/opportunities/field-override.js';
import type pg from 'pg';

// ─── Mock client + pool ───────────────────────────────────────────────────────
// The service uses pool.connect() then client.query() with BEGIN/COMMIT. We
// drive responses with a queue keyed by a matcher on the SQL text.

interface Step {
  match: RegExp;
  rows?: Record<string, unknown>[];
  rowCount?: number;
  throws?: Error;
}

let steps: Step[] = [];
let executed: string[] = [];

function makeClient() {
  return {
    query: vi.fn(async (sql: string) => {
      executed.push(sql.trim().split('\n')[0]!.trim());
      // BEGIN/COMMIT/ROLLBACK pass through.
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      const step = steps.find((s) => s.match.test(sql));
      if (!step) {
        throw new Error('Unexpected SQL: ' + sql.slice(0, 60));
      }
      if (step.throws) throw step.throws;
      return { rows: step.rows ?? [], rowCount: step.rowCount ?? (step.rows?.length ?? 0) };
    }),
    release: vi.fn(),
  };
}

let client: ReturnType<typeof makeClient>;

// pool.query is used by getFieldOverrideAudit (no transaction).
let poolQueryRows: Record<string, unknown>[] = [];
let lastPoolSql = '';
let lastPoolParams: unknown[] = [];

const mockPool = {
  connect: vi.fn(async () => client),
  query: vi.fn(async (sql: string, params?: unknown[]) => {
    lastPoolSql = sql;
    lastPoolParams = params ?? [];
    return { rows: poolQueryRows, rowCount: poolQueryRows.length };
  }),
};

beforeEach(() => {
  steps = [];
  executed = [];
  poolQueryRows = [];
  lastPoolSql = '';
  lastPoolParams = [];
  client = makeClient();
  mockPool.connect.mockClear();
  mockPool.query.mockClear();
  invalidateSpy.mockClear();
});

// ─── isOverridableField ───────────────────────────────────────────────────────

describe('isOverridableField', () => {
  it('accepts allow-listed fields', () => {
    expect(isOverridableField('agency')).toBe(true);
    expect(isOverridableField('estimated_value_cents')).toBe(true);
    expect(OVERRIDABLE_FIELDS.has('title')).toBe(true);
  });

  it('rejects unknown or non-string fields', () => {
    expect(isOverridableField('id')).toBe(false);
    expect(isOverridableField('internal_id')).toBe(false);
    expect(isOverridableField('')).toBe(false);
    expect(isOverridableField(undefined)).toBe(false);
    expect(isOverridableField(42)).toBe(false);
  });
});

// ─── setFieldOverrideWithAudit: SET ───────────────────────────────────────────

describe('setFieldOverrideWithAudit — set', () => {
  it('upserts override + writes audit, captures old value, commits, invalidates cache', async () => {
    steps = [
      { match: /SELECT 1 FROM unified_opportunities/, rowCount: 1, rows: [{ '?column?': 1 }] },
      {
        match: /SELECT field_value_json FROM unified_opportunity_field_overrides/,
        rows: [{ field_value_json: 'Old Agency' }],
      },
      { match: /INSERT INTO unified_opportunity_field_overrides/, rowCount: 1 },
      {
        match: /INSERT INTO unified_opportunity_field_override_audit/,
        rows: [{ id: 99, created_at: '2026-06-02T10:00:00Z' }],
      },
    ];

    const res = await setFieldOverrideWithAudit(mockPool as unknown as pg.Pool, {
      internal_id: 'iid-1',
      field_name: 'agency',
      field_value: 'New Agency',
      set_by: 'user-7',
      reason: 'correction',
    });

    expect(res).not.toBeNull();
    expect(res!.action).toBe('set');
    expect(res!.field_value).toBe('New Agency');
    expect(res!.old_value).toBe('Old Agency');
    expect(res!.audit_id).toBe(99);
    expect(res!.set_by).toBe('user-7');
    expect(executed).toContain('BEGIN');
    expect(executed).toContain('COMMIT');
    expect(invalidateSpy).toHaveBeenCalledWith('iid-1');
  });

  it('records old_value null when no prior override existed', async () => {
    steps = [
      { match: /SELECT 1 FROM unified_opportunities/, rowCount: 1, rows: [{ '?column?': 1 }] },
      { match: /SELECT field_value_json FROM unified_opportunity_field_overrides/, rows: [] },
      { match: /INSERT INTO unified_opportunity_field_overrides/, rowCount: 1 },
      {
        match: /INSERT INTO unified_opportunity_field_override_audit/,
        rows: [{ id: 1, created_at: '2026-06-02T10:00:00Z' }],
      },
    ];

    const res = await setFieldOverrideWithAudit(mockPool as unknown as pg.Pool, {
      internal_id: 'iid-2',
      field_name: 'naics',
      field_value: '541512',
      set_by: 'u',
    });
    expect(res!.old_value).toBeNull();
    expect(res!.action).toBe('set');
  });
});

// ─── setFieldOverrideWithAudit: CLEAR ─────────────────────────────────────────

describe('setFieldOverrideWithAudit — clear', () => {
  it('deletes override + writes clear audit when field_value is null', async () => {
    steps = [
      { match: /SELECT 1 FROM unified_opportunities/, rowCount: 1, rows: [{ '?column?': 1 }] },
      {
        match: /SELECT field_value_json FROM unified_opportunity_field_overrides/,
        rows: [{ field_value_json: 'Prev' }],
      },
      { match: /DELETE FROM unified_opportunity_field_overrides/, rowCount: 1 },
      {
        match: /INSERT INTO unified_opportunity_field_override_audit/,
        rows: [{ id: 5, created_at: '2026-06-02T11:00:00Z' }],
      },
    ];

    const res = await setFieldOverrideWithAudit(mockPool as unknown as pg.Pool, {
      internal_id: 'iid-3',
      field_name: 'agency',
      field_value: null,
      set_by: 'u',
    });

    expect(res!.action).toBe('clear');
    expect(res!.field_value).toBeNull();
    expect(res!.old_value).toBe('Prev');
    expect(executed.some((s) => /DELETE FROM unified_opportunity_field_overrides/.test(s))).toBe(true);
    expect(executed.some((s) => /INSERT INTO unified_opportunity_field_overrides/.test(s))).toBe(false);
    expect(invalidateSpy).toHaveBeenCalledWith('iid-3');
  });
});

// ─── 404 + error handling ─────────────────────────────────────────────────────

describe('setFieldOverrideWithAudit — guards', () => {
  it('returns null and rolls back when the opportunity does not exist', async () => {
    steps = [{ match: /SELECT 1 FROM unified_opportunities/, rowCount: 0, rows: [] }];

    const res = await setFieldOverrideWithAudit(mockPool as unknown as pg.Pool, {
      internal_id: 'missing',
      field_name: 'agency',
      field_value: 'X',
      set_by: 'u',
    });

    expect(res).toBeNull();
    expect(executed).toContain('ROLLBACK');
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalled();
  });

  it('rolls back and rethrows when the audit insert fails', async () => {
    steps = [
      { match: /SELECT 1 FROM unified_opportunities/, rowCount: 1, rows: [{ '?column?': 1 }] },
      { match: /SELECT field_value_json FROM unified_opportunity_field_overrides/, rows: [] },
      { match: /INSERT INTO unified_opportunity_field_overrides/, rowCount: 1 },
      {
        match: /INSERT INTO unified_opportunity_field_override_audit/,
        throws: new Error('audit insert boom'),
      },
    ];

    await expect(
      setFieldOverrideWithAudit(mockPool as unknown as pg.Pool, {
        internal_id: 'iid-9',
        field_name: 'agency',
        field_value: 'X',
        set_by: 'u',
      }),
    ).rejects.toThrow('audit insert boom');

    expect(executed).toContain('ROLLBACK');
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalled();
  });
});

// ─── getFieldOverrideAudit ────────────────────────────────────────────────────

describe('getFieldOverrideAudit', () => {
  it('filters by field_name when provided', async () => {
    poolQueryRows = [];
    await getFieldOverrideAudit(mockPool as unknown as pg.Pool, 'iid-1', 'agency');
    expect(lastPoolParams).toEqual(['iid-1', 'agency']);
    expect(lastPoolSql).toContain('field_name = $2');
    expect(lastPoolSql).toContain('ORDER BY created_at DESC');
  });

  it('omits the field filter when not provided', async () => {
    poolQueryRows = [];
    await getFieldOverrideAudit(mockPool as unknown as pg.Pool, 'iid-1');
    expect(lastPoolParams).toEqual(['iid-1']);
    expect(lastPoolSql).not.toContain('field_name = $2');
  });

  it('maps rows including old/new values and action', async () => {
    poolQueryRows = [
      {
        id: 3,
        internal_id: 'iid-1',
        field_name: 'agency',
        action: 'set',
        old_value_json: 'A',
        new_value_json: 'B',
        set_by: 'u',
        reason: 'fix',
        created_at: '2026-06-02T12:00:00Z',
      },
    ];
    const res = await getFieldOverrideAudit(mockPool as unknown as pg.Pool, 'iid-1');
    expect(res).toHaveLength(1);
    expect(res[0]!.action).toBe('set');
    expect(res[0]!.old_value).toBe('A');
    expect(res[0]!.new_value).toBe('B');
    expect(res[0]!.id).toBe(3);
  });
});
