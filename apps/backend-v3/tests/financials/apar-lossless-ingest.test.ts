/**
 * Lossless AP/AR ingest (F-625, v3_144).
 *
 * The prior (source, period, vendor/customer, invoice) upsert key silently
 * MERGED two legitimately-distinct lines sharing a vendor+invoice — an April
 * Open-AP report has two such vouchers, so a $383.18 line was dropped (111 rows
 * parsed, 110 persisted). It also could not purge rows a prior mis-parse left
 * behind. The fix switches AP/AR to snapshot-replace keyed by a per-report line
 * ordinal (line_seq): the period is deleted, then every parsed line re-inserted.
 *
 * pool.connect() is mocked so we capture the exact ordered (sql, params) tuples
 * — DELETE before INSERTs, one line_seq per row — without a live DB.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

interface QCall {
  sql: string;
  params: unknown[];
}
const calls: QCall[] = [];
let failMatcher: ((sql: string) => boolean) | null = null;

vi.mock('../../src/lib/db.js', () => {
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params: params ?? [] });
    if (failMatcher && failMatcher(sql)) throw new Error('simulated insert failure');
    return { rows: [], rowCount: 1 };
  });
  return {
    pool: {
      query,
      connect: vi.fn(async () => ({ query, release: vi.fn() })),
    },
  };
});

import { ingestApRows, ingestArRows } from '../../src/services/financials/ingest.js';

const inserts = (table: string) =>
  calls.filter((c) => new RegExp(`INSERT INTO\\s+${table}\\b`, 'i').test(c.sql));
const deletes = (table: string) =>
  calls.filter((c) => new RegExp(`DELETE FROM\\s+${table}\\b`, 'i').test(c.sql));

// Column index of line_seq in each INSERT's params (last positional arg).
const AP_LINE_SEQ = 11;
const AP_AMOUNT = 7;
const AR_LINE_SEQ = 10;
const AR_AMOUNT = 7;

const apRow = (over: Record<string, unknown> = {}) => ({
  period: 'FY26 Apr',
  fiscal_year: 2026,
  quarter: 2,
  vendor_name: 'ACME Corp',
  invoice_number: 'INV-1',
  invoice_date: null,
  due_date: null,
  amount: 100,
  age_bucket: 'Current',
  status: null,
  ...over,
});

const arRow = (over: Record<string, unknown> = {}) => ({
  period: 'FY26 Jun',
  fiscal_year: 2026,
  quarter: 3,
  customer_name: 'DoD',
  invoice_number: 'AR-1',
  invoice_date: null,
  due_date: null,
  amount: 50,
  age_bucket: 'Current',
  ...over,
});

beforeEach(() => {
  calls.length = 0;
  failMatcher = null;
});

describe('lossless AP ingest — snapshot-replace with per-line ordinal', () => {
  it('preserves TWO distinct vouchers that share vendor + invoice (the April $383.18 bug)', async () => {
    const rows = [apRow({ amount: 6_917_200.19 }), apRow({ amount: 383.18 })];
    const count = await ingestApRows(rows as never, 174);

    const ins = inserts('ap_actuals');
    expect(count).toBe(2);
    expect(ins.length).toBe(2); // neither row merged away
    expect(ins.map((c) => c.params[AP_LINE_SEQ])).toEqual([0, 1]); // distinct identity
    expect(ins.map((c) => c.params[AP_AMOUNT]).sort()).toEqual([383.18, 6_917_200.19]);
  });

  it('deletes the whole period BEFORE inserting (stale rows from a prior parse self-clean)', async () => {
    await ingestApRows([apRow({})] as never, 174);

    const del = deletes('ap_actuals');
    expect(del.length).toBe(1);
    expect(del[0].params).toEqual(['FY26 Apr', 2026, 2]); // scoped to the period only
    const delIdx = calls.findIndex((c) => /DELETE FROM ap_actuals/i.test(c.sql));
    const insIdx = calls.findIndex((c) => /INSERT INTO ap_actuals/i.test(c.sql));
    expect(delIdx).toBeLessThan(insIdx);
  });

  it('is idempotent: re-ingesting the same batch replaces rather than duplicates', async () => {
    const batch = [apRow({}), apRow({ invoice_number: 'INV-2', amount: 200 })];
    await ingestApRows(batch as never, 174);
    calls.length = 0;

    const count = await ingestApRows(batch as never, 174);
    expect(count).toBe(2);
    expect(deletes('ap_actuals').length).toBe(1); // one snapshot delete
    expect(inserts('ap_actuals').length).toBe(2); // no accumulation
  });

  it('scopes line_seq per period when one call carries multiple months', async () => {
    const rows = [
      apRow({ period: 'FY26 Apr' }),
      apRow({ period: 'FY26 Apr', invoice_number: 'INV-2' }),
      apRow({ period: 'FY26 May', quarter: 3, invoice_number: 'INV-9' }),
    ];
    await ingestApRows(rows as never, 174);

    expect(deletes('ap_actuals').length).toBe(2); // one per period
    const ins = inserts('ap_actuals');
    const apr = ins.filter((c) => c.params[0] === 'FY26 Apr').map((c) => c.params[AP_LINE_SEQ]);
    const may = ins.filter((c) => c.params[0] === 'FY26 May').map((c) => c.params[AP_LINE_SEQ]);
    expect(apr).toEqual([0, 1]);
    expect(may).toEqual([0]); // independent 0-based sequence
  });

  it('rolls back a period on insert failure — no partial snapshot, prior rows kept', async () => {
    failMatcher = (sql) => /INSERT INTO ap_actuals/i.test(sql);
    const count = await ingestApRows([apRow({})] as never, 174);

    expect(count).toBe(0);
    expect(calls.some((c) => /ROLLBACK/i.test(c.sql))).toBe(true);
    expect(calls.some((c) => /COMMIT/i.test(c.sql))).toBe(false);
  });

  it('skips rows missing required fields and keeps line_seq contiguous', async () => {
    const rows = [apRow({}), apRow({ vendor_name: '' }), apRow({ invoice_number: 'INV-3' })];
    const count = await ingestApRows(rows as never, 174);

    const ins = inserts('ap_actuals');
    expect(count).toBe(2); // invalid row dropped
    expect(ins.map((c) => c.params[AP_LINE_SEQ])).toEqual([0, 1]);
  });
});

describe('lossless AR ingest — snapshot-replace', () => {
  it('preserves duplicate customer + invoice lines and snapshot-replaces the period', async () => {
    const rows = [arRow({ amount: 50 }), arRow({ amount: 75 })];
    const count = await ingestArRows(rows as never, 214);

    const ins = inserts('ar_actuals');
    expect(count).toBe(2);
    expect(ins.map((c) => c.params[AR_LINE_SEQ])).toEqual([0, 1]);
    expect(ins.map((c) => c.params[AR_AMOUNT]).sort()).toEqual([50, 75]);
    expect(deletes('ar_actuals').length).toBe(1);
  });

  it('re-ingesting a month replaces it (the June double-count can no longer happen)', async () => {
    const batch = [arRow({}), arRow({ invoice_number: 'AR-2', amount: 25 })];
    await ingestArRows(batch as never, 214);
    calls.length = 0;

    const count = await ingestArRows(batch as never, 214);
    expect(count).toBe(2);
    expect(deletes('ar_actuals').length).toBe(1);
    expect(inserts('ar_actuals').length).toBe(2);
  });
});
