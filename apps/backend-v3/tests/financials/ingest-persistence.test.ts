/**
 * End-to-end persistence tests: parser output -> ingest mapper -> INSERT payload.
 *
 * These tests close the gap that let two live bugs ship while the parser-only
 * suite stayed green:
 *
 *  - BUG A ("ingested but no rows persisted"): parseProjectRevenueSummary
 *    returned rows, but rows whose derived margin_pct fell outside Postgres
 *    NUMERIC(7,2) (+/-99999.99) raised a numeric-field-overflow that the per-row
 *    try/catch swallowed, silently leaving project_revenue_actuals empty. A
 *    parser test alone could not catch this — only a test that inspects the
 *    payload handed to pool.query can.
 *
 *  - BUG B ("no_rows"): Trial Balance / Trend SIE returned no_rows on real
 *    multi-sheet workbooks because the content-based sheet picker mis-scored a
 *    decoy/cover sheet. Covered here by parsing with a decoy sheet prepended and
 *    asserting rows still map to a non-empty payload.
 *
 * pool.query is mocked so we capture the exact (sql, params) tuples without a DB.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const calls: Array<{ sql: string; params: unknown[] }> = [];

vi.mock('../../src/lib/db.js', () => {
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params: params ?? [] });
    return { rows: [], rowCount: 1 };
  });
  return {
    pool: {
      query,
      // AP/AR snapshot-replace ingest runs its DELETE+INSERTs on a pooled client
      // inside a transaction; hand back the same recording query fn.
      connect: vi.fn(async () => ({ query, release: vi.fn() })),
    },
  };
});

import {
  parseTrialBalance,
  parseTrendSie,
  parseProjectRevenueSummary,
  parseAgedAr,
} from '../../src/services/financials/deterministic-parsers.js';
import {
  ingestTrialBalanceRows,
  ingestSieRows,
  ingestProjectRevenueRows,
  ingestArRows,
  ingestFinancialRows,
} from '../../src/services/financials/ingest.js';

const FIXTURES = join(__dirname, '../fixtures/financials');

async function extractXlsxText(filepath: string): Promise<string> {
  const mod = (await import('exceljs')) as unknown as { default?: typeof import('exceljs') };
  const ExcelJS = (mod.default ?? mod) as typeof import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(readFileSync(filepath) as unknown as ArrayBuffer);
  const texts: string[] = [];
  workbook.eachSheet((sheet) => {
    const rows: string[] = [];
    sheet.eachRow((row) => {
      const values = (row.values as unknown[]).slice(1).map((v) => (v != null ? String(v) : ''));
      rows.push(values.join(','));
    });
    if (rows.length > 0) texts.push(`[Sheet: ${sheet.name}]\n${rows.join('\n')}`);
  });
  return texts.join('\n\n');
}

const insertCalls = () => calls.filter((c) => /INSERT INTO/i.test(c.sql));
const insertInto = (table: string) =>
  calls.filter((c) => new RegExp(`INSERT INTO\\s+${table}\\b`, 'i').test(c.sql));

describe('financial ingest persistence (parser -> mapper -> INSERT payload)', () => {
  let tbText: string;
  let sieText: string;
  let prText: string;
  let arText: string;

  beforeAll(async () => {
    [tbText, sieText, prText, arText] = await Promise.all([
      extractXlsxText(join(FIXTURES, 'trial-balance-may-2026.xlsx')),
      extractXlsxText(join(FIXTURES, 'trend-sie-may-2026.xlsx')),
      extractXlsxText(join(FIXTURES, 'proj-revenue-summary-may-2026.xlsx')),
      extractXlsxText(join(FIXTURES, 'aged-ar-may-2026.xlsx')),
    ]);
  });

  beforeEach(() => {
    calls.length = 0;
  });

  // --- BUG A: this is the test a parser-only suite cannot provide ------------
  it('parseProjectRevenueSummary output persists a non-empty payload with required NOT NULL columns', async () => {
    const parsed = parseProjectRevenueSummary(prText, 'proj-revenue-summary-may-2026.xlsx');
    expect(parsed).not.toBeNull();
    expect(parsed!.rows.length).toBeGreaterThan(0);

    const inserted = await ingestProjectRevenueRows(parsed!.rows, 1);
    const payloads = insertCalls();

    expect(inserted).toBe(parsed!.rows.length);
    expect(payloads.length).toBe(parsed!.rows.length);

    for (const { params } of payloads) {
      // VALUES order: period, fiscal_year, quarter, project_name, contract_number,
      //               revenue, cost, margin_pct, source_doc_id
      expect(params[0]).toBeTruthy(); // period NOT NULL
      expect(params[1]).toBeTruthy(); // fiscal_year NOT NULL
      expect(params[3]).toBeTruthy(); // project_name NOT NULL
      expect(typeof params[5]).toBe('number'); // revenue NUMERIC(15,2) NOT NULL
      expect(typeof params[6]).toBe('number'); // cost NUMERIC(15,2) NOT NULL
    }
  });

  it('BUG A regression: an out-of-range margin still persists, with margin_pct nulled to fit NUMERIC(7,2)', async () => {
    const parsed = parseProjectRevenueSummary(prText, 'proj-revenue-summary-may-2026.xlsx')!;
    // Force a guaranteed overflow row (loss project, tiny revenue, large cost).
    const overflowRow = {
      ...parsed.rows[0],
      project_name: 'OVERFLOW MARGIN PROJECT',
      revenue: 0.01,
      cost: 1_000_000,
      margin_pct: ((0.01 - 1_000_000) / 0.01) * 100, // ~ -9,999,999,900 — far outside NUMERIC(7,2)
    };

    const inserted = await ingestProjectRevenueRows([overflowRow], 1);
    const payloads = insertCalls();

    expect(inserted).toBe(1); // row is NOT dropped
    expect(payloads.length).toBe(1);
    // margin_pct param (index 7) must be null so Postgres won't raise numeric overflow.
    expect(payloads[0].params[7]).toBeNull();
    // revenue/cost remain intact (margin is recomputable from them).
    expect(payloads[0].params[5]).toBe(0.01);
    expect(payloads[0].params[6]).toBe(1_000_000);
  });

  it('an in-range margin is preserved unchanged', async () => {
    const parsed = parseProjectRevenueSummary(prText, 'proj-revenue-summary-may-2026.xlsx')!;
    const okRow = { ...parsed.rows[0], project_name: 'OK MARGIN', revenue: 1000, cost: 850, margin_pct: 15 };
    await ingestProjectRevenueRows([okRow], 1);
    expect(insertCalls()[0].params[7]).toBe(15);
  });

  it('Trial Balance fixture rows persist with required NOT NULL columns', async () => {
    const parsed = parseTrialBalance(tbText, 'trial-balance-may-2026.xlsx');
    expect(parsed).not.toBeNull();
    expect(parsed!.rows.length).toBeGreaterThan(0);

    const inserted = await ingestTrialBalanceRows(parsed!.rows, 1);
    const payloads = insertCalls();
    expect(inserted).toBe(parsed!.rows.length);
    expect(payloads.length).toBeGreaterThan(0);
    for (const { params } of payloads) {
      expect(params[0]).toBeTruthy(); // period
      expect(params[1]).toBeTruthy(); // fiscal_year
      expect(params[3]).toBeTruthy(); // account_code NOT NULL
    }
  });

  it('Trend SIE fixture rows persist with required NOT NULL columns', async () => {
    const parsed = parseTrendSie(sieText, 'trend-sie-may-2026.xlsx');
    expect(parsed).not.toBeNull();
    expect(parsed!.rows.length).toBeGreaterThan(0);

    const inserted = await ingestSieRows(parsed!.rows, 1);
    const payloads = insertCalls();
    expect(inserted).toBe(parsed!.rows.length);
    for (const { params } of payloads) {
      expect(params[0]).toBeTruthy(); // period
      expect(params[1]).toBeTruthy(); // fiscal_year
      expect(params[3]).toBeTruthy(); // pool NOT NULL
      expect(params[5]).toBeTruthy(); // account_name NOT NULL
    }
  });

  it('Aged AR fixture rows persist (regression guard: must not break existing AR path)', async () => {
    const parsed = parseAgedAr(arText, 'aged-ar-may-2026.xlsx');
    expect(parsed).not.toBeNull();
    expect(parsed!.rows.length).toBeGreaterThan(0);

    const inserted = await ingestArRows(parsed!.rows, 1);
    expect(inserted).toBe(parsed!.rows.length);
    for (const { params } of insertCalls()) {
      expect(params[0]).toBeTruthy(); // period
      expect(params[1]).toBeTruthy(); // fiscal_year
      expect(params[3]).toBeTruthy(); // customer_name NOT NULL
    }
  });

  // --- BUG B: multi-sheet decoy must not starve the real sheet ---------------
  it('BUG B regression: TB & SIE still map to non-empty payloads when a decoy cover sheet precedes the real sheet', async () => {
    const tbDecoy =
      `[Sheet: Cover]\nGL Account Summary by Organization\nAccount Range,100-000 to 999-999\n` +
      `Ending Balance Total,1234567.89\nReport Account Basis,Accrual\n`;
    const sieDecoy =
      `[Sheet: Cover]\nPool Number Listing,FY2026\nPool Name Reference,All Pools\nPrepared By,Finance\n`;

    const tbParsed = parseTrialBalance(tbDecoy + '\n\n' + tbText, 'trial-balance-may-2026.xlsx');
    const sieParsed = parseTrendSie(sieDecoy + '\n\n' + sieText, 'trend-sie-may-2026.xlsx');

    expect(tbParsed).not.toBeNull();
    expect(tbParsed!.rows.length).toBeGreaterThan(0);
    expect(sieParsed).not.toBeNull();
    expect(sieParsed!.rows.length).toBeGreaterThan(0);

    const tbInserted = await ingestTrialBalanceRows(tbParsed!.rows, 1);
    expect(tbInserted).toBeGreaterThan(0);
    calls.length = 0;
    const sieInserted = await ingestSieRows(sieParsed!.rows, 1);
    expect(sieInserted).toBeGreaterThan(0);
  });
});

/**
 * BUG 5: ingestFinancialRows must route company-P&L rows by their source-series,
 * not by kind alone. A TARGET company-P&L row arrives as kind 'plan' but carries
 * source 'l1_target'; it MUST land in financial_actuals (as source l1_target) so
 * the trend/variance path can read target (l1_target) against actual (l1_actual)
 * on the same natural key. Only generic budget/plan rows (no company-P&L source)
 * belong in financial_plan.
 */
describe('ingestFinancialRows — company-P&L source routing (BUG 5)', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  const mkRow = (over: Record<string, unknown>) => ({
    period: 'FY26 Jan',
    fiscal_year: 2026,
    quarter: 1,
    kind: 'actual' as const,
    orders: null,
    sales: 1000,
    ebit: 120,
    gross_margin: 30,
    ros: 12,
    ...over,
  });

  it('routes a TARGET row (kind plan, source l1_target) into financial_actuals, never financial_plan', async () => {
    const row = mkRow({ kind: 'plan', source: 'l1_target', sales: 76202, ebit: 76202 });
    const res = await ingestFinancialRows([row as never], 7);

    const actuals = insertInto('financial_actuals');
    const plans = insertInto('financial_plan');

    expect(res.actual).toBe(1);
    expect(res.plan).toBe(0);
    expect(actuals.length).toBe(1);
    expect(plans.length).toBe(0); // must NOT write to financial_plan
    expect(actuals[0].params[0]).toBe('l1_target'); // source column
    // source_doc_id is appended for financial_actuals writes.
    expect(actuals[0].params).toContain(7);
  });

  it('lands l1_actual and l1_target for the SAME period both in financial_actuals (variance can join them)', async () => {
    const actual = mkRow({ kind: 'actual', source: 'l1_actual', sales: 1000, ebit: 36024 });
    const target = mkRow({ kind: 'plan', source: 'l1_target', sales: 1200, ebit: 76202 });
    const res = await ingestFinancialRows([actual as never, target as never], 7);

    const actuals = insertInto('financial_actuals');
    const plans = insertInto('financial_plan');

    expect(res.actual).toBe(2);
    expect(res.plan).toBe(0);
    expect(plans.length).toBe(0);
    const sources = actuals.map((c) => c.params[0]).sort();
    expect(sources).toEqual(['l1_actual', 'l1_target']);
  });

  it('still routes a generic plan row (no company-P&L source) into financial_plan', async () => {
    const row = mkRow({ kind: 'plan', source: null, sales: 5000, ebit: 500 });
    const res = await ingestFinancialRows([row as never], null);

    const actuals = insertInto('financial_actuals');
    const plans = insertInto('financial_plan');

    expect(res.plan).toBe(1);
    expect(res.actual).toBe(0);
    expect(plans.length).toBe(1);
    expect(actuals.length).toBe(0);
    // resolveSource falls back to l1_target for a plan row with no explicit source.
    expect(plans[0].params[0]).toBe('l1_target');
  });

  it('still routes a generic income_statement actual into financial_actuals', async () => {
    const row = mkRow({ kind: 'actual', source: 'income_statement', sales: 2000, ebit: 200 });
    const res = await ingestFinancialRows([row as never], 3);

    expect(res.actual).toBe(1);
    expect(res.plan).toBe(0);
    expect(insertInto('financial_actuals').length).toBe(1);
    expect(insertInto('financial_plan').length).toBe(0);
    expect(insertInto('financial_actuals')[0].params[0]).toBe('income_statement');
  });
});
