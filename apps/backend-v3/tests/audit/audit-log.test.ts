/**
 * Unit tests for the F-442 unified audit log service.
 *
 * Covers:
 *   - recordAuditLog: exact INSERT column list, JSON.stringify of jsonb
 *     fields, null handling, returns new id
 *   - listAuditLog: filter building, cursor encoding/decoding, limit
 *     clamping, row mapping
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock pool/client ────────────────────────────────────────────────────────

let lastSql = '';
let lastParams: unknown[] = [];
let nextRows: Record<string, unknown>[] = [];

const mockExec = {
  query: vi.fn(async (sql: string, params?: unknown[]) => {
    lastSql = sql;
    lastParams = params ?? [];
    return { rows: nextRows, rowCount: nextRows.length };
  }),
};

import {
  recordAuditLog,
  listAuditLog,
} from '../../src/services/audit/audit-log.js';
import type pg from 'pg';

beforeEach(() => {
  lastSql = '';
  lastParams = [];
  nextRows = [];
  mockExec.query.mockClear();
});

// ─── recordAuditLog ──────────────────────────────────────────────────────────

describe('recordAuditLog', () => {
  it('inserts the correct columns and returns the new id', async () => {
    nextRows = [{ id: 42 }];
    const id = await recordAuditLog(mockExec as unknown as pg.PoolClient, {
      action: 'match_suggestion_confirm',
      table_name: 'unified_opportunity_links',
      record_id: 7,
      record_ref: 'iid-1',
      old_values: { confidence: 'MEDIUM' },
      new_values: { confidence: 'CONFIRMED' },
      actor: 'user-42',
      user_id: null,
      ip_address: '127.0.0.1',
      user_agent: 'TestAgent/1.0',
      request_id: 'req-abc',
    });

    expect(id).toBe(42);
    expect(lastSql).toContain('INSERT INTO audit_log');
    expect(lastSql).toContain('action, table_name, record_id, record_ref');
    expect(lastSql).toContain('old_values, new_values');
    expect(lastSql).toContain('actor, user_id, ip_address, user_agent, request_id');
    expect(lastParams[0]).toBe('match_suggestion_confirm');
    expect(lastParams[1]).toBe('unified_opportunity_links');
    expect(lastParams[2]).toBe(7);
    expect(lastParams[3]).toBe('iid-1');
    expect(lastParams[4]).toBe(JSON.stringify({ confidence: 'MEDIUM' }));
    expect(lastParams[5]).toBe(JSON.stringify({ confidence: 'CONFIRMED' }));
    expect(lastParams[6]).toBe('user-42');
    expect(lastParams[7]).toBeNull();
    expect(lastParams[8]).toBe('127.0.0.1');
    expect(lastParams[9]).toBe('TestAgent/1.0');
    expect(lastParams[10]).toBe('req-abc');
  });

  it('passes null for jsonb values when old_values/new_values are null', async () => {
    nextRows = [{ id: 1 }];
    await recordAuditLog(mockExec as unknown as pg.PoolClient, {
      action: 'field_override_clear',
      table_name: 'unified_opportunity_field_overrides',
    });

    expect(lastParams[4]).toBeNull(); // old_values
    expect(lastParams[5]).toBeNull(); // new_values
    expect(lastParams[6]).toBeNull(); // actor
  });

  it('passes null for jsonb values when old_values/new_values are undefined', async () => {
    nextRows = [{ id: 2 }];
    await recordAuditLog(mockExec as unknown as pg.PoolClient, {
      action: 'field_override_set',
      table_name: 'unified_opportunity_field_overrides',
      old_values: undefined,
      new_values: undefined,
    });

    expect(lastParams[4]).toBeNull();
    expect(lastParams[5]).toBeNull();
  });

  it('coerces bigint id string from PG to number', async () => {
    nextRows = [{ id: '999' }];
    const id = await recordAuditLog(mockExec as unknown as pg.PoolClient, {
      action: 'test',
      table_name: 'test',
    });
    expect(id).toBe(999);
    expect(typeof id).toBe('number');
  });
});

// ─── listAuditLog ────────────────────────────────────────────────────────────

describe('listAuditLog', () => {
  it('applies table_name filter', async () => {
    nextRows = [];
    await listAuditLog(mockExec as unknown as pg.Pool, {
      table_name: 'unified_opportunity_links',
    });
    expect(lastSql).toContain('table_name = $1');
    expect(lastParams[0]).toBe('unified_opportunity_links');
  });

  it('applies all supported filters simultaneously', async () => {
    nextRows = [];
    await listAuditLog(mockExec as unknown as pg.Pool, {
      table_name: 'unified_opportunity_links',
      record_id: 7,
      record_ref: 'iid-1',
      action: 'match_suggestion_confirm',
      actor: 'user-42',
    });
    expect(lastSql).toContain('table_name = $1');
    expect(lastSql).toContain('record_id = $2');
    expect(lastSql).toContain('record_ref = $3');
    expect(lastSql).toContain('action = $4');
    expect(lastSql).toContain('actor = $5');
  });

  it('clamps limit to default 50 when omitted', async () => {
    nextRows = [];
    await listAuditLog(mockExec as unknown as pg.Pool, {});
    // LIMIT param is limit+1 = 51
    expect(lastParams[lastParams.length - 1]).toBe(51);
  });

  it('clamps limit above 200 to 200', async () => {
    nextRows = [];
    await listAuditLog(mockExec as unknown as pg.Pool, { limit: 999 });
    expect(lastParams[lastParams.length - 1]).toBe(201);
  });

  it('maps rows and coerces bigint ids to number', async () => {
    nextRows = [
      {
        id: '10',
        action: 'match_suggestion_confirm',
        table_name: 'unified_opportunity_links',
        record_id: '7',
        record_ref: 'iid-1',
        old_values: { confidence: 'MEDIUM' },
        new_values: { confidence: 'CONFIRMED' },
        actor: 'user-42',
        user_id: null,
        request_id: 'req-1',
        created_at: '2026-06-02T10:00:00Z',
      },
    ];
    const res = await listAuditLog(mockExec as unknown as pg.Pool, {});
    expect(res.items).toHaveLength(1);
    const item = res.items[0]!;
    expect(item.id).toBe(10);
    expect(typeof item.id).toBe('number');
    expect(item.record_id).toBe(7);
    expect(typeof item.record_id).toBe('number');
    expect(item.actor).toBe('user-42');
    expect(item.record_ref).toBe('iid-1');
  });

  it('returns hasMore + cursor when over the limit', async () => {
    nextRows = [
      { id: '3', action: 'a', table_name: 't', record_id: null, record_ref: null, old_values: null, new_values: null, actor: null, user_id: null, request_id: null, created_at: '2026-06-02T03:00:00Z' },
      { id: '2', action: 'a', table_name: 't', record_id: null, record_ref: null, old_values: null, new_values: null, actor: null, user_id: null, request_id: null, created_at: '2026-06-02T02:00:00Z' },
      { id: '1', action: 'a', table_name: 't', record_id: null, record_ref: null, old_values: null, new_values: null, actor: null, user_id: null, request_id: null, created_at: '2026-06-02T01:00:00Z' },
    ];
    const res = await listAuditLog(mockExec as unknown as pg.Pool, { limit: 2 });
    expect(res.items).toHaveLength(2);
    expect(res.pagination.hasMore).toBe(true);
    expect(res.pagination.cursor).toBeTypeOf('string');
    const decoded = JSON.parse(
      Buffer.from(res.pagination.cursor as string, 'base64').toString('utf-8'),
    );
    expect(decoded.id).toBe(2);
    expect(decoded.created_at).toBe('2026-06-02T02:00:00Z');
  });

  it('no cursor when results fit within the limit', async () => {
    nextRows = [
      { id: '1', action: 'a', table_name: 't', record_id: null, record_ref: null, old_values: null, new_values: null, actor: null, user_id: null, request_id: null, created_at: '2026-06-02T01:00:00Z' },
    ];
    const res = await listAuditLog(mockExec as unknown as pg.Pool, { limit: 50 });
    expect(res.pagination.hasMore).toBe(false);
    expect(res.pagination.cursor).toBeNull();
  });

  it('decodes a cursor and applies COALESCE-safe comparison', async () => {
    nextRows = [];
    const cursor = Buffer.from(
      JSON.stringify({ created_at: '2026-06-02T01:00:00Z', id: 5 }),
    ).toString('base64');
    await listAuditLog(mockExec as unknown as pg.Pool, { cursor });
    expect(lastSql).toContain('COALESCE(created_at');
    expect(lastSql).toContain('COALESCE($');
  });

  it('ignores an invalid cursor without throwing', async () => {
    nextRows = [];
    await listAuditLog(mockExec as unknown as pg.Pool, { cursor: 'not-valid-base64!@#' });
    // Should not throw, no cursor condition added
    expect(lastSql).not.toContain('COALESCE($');
  });

  it('handles null record_id and record_ref', async () => {
    nextRows = [
      { id: '1', action: 'a', table_name: 't', record_id: null, record_ref: null, old_values: null, new_values: null, actor: null, user_id: null, request_id: null, created_at: '2026-06-02T01:00:00Z' },
    ];
    const res = await listAuditLog(mockExec as unknown as pg.Pool, {});
    expect(res.items[0]!.record_id).toBeNull();
    expect(res.items[0]!.record_ref).toBeNull();
  });
});
