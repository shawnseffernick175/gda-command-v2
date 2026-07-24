/**
 * Regression tests for the per-contract "Revenue Summary by Cost Pool" ingest.
 *
 * parseRevenueSummaryByCostPool — the authoritative per-contract actuals book.
 *   One workbook carries every fiscal period as its own sheet (## Sheet: 1..6)
 *   plus a "YTD" rollup sheet. Each row is one contract for that period, keyed by
 *   L2 Proj ID. The parser must: detect the cost-pool header, iterate every
 *   monthly sheet, SKIP the YTD sheet and "Period N Total" subtotal rows, map
 *   Pd → month/quarter, preserve project id/name (never collapsing distinct
 *   contracts that share a name), preserve signed values, compute fully-burdened
 *   cost (Total Direct + Total Indirect-ACT), map Op Income-ACT to profit, and
 *   convert Op Profit % from a fraction to percentage points.
 *
 * ingestProjectCostPoolRows — derives YTD by CUMULATIVELY summing the official
 *   monthly rows per contract (never from ITD), and leaves target/plan columns
 *   at their defaults (unavailable).
 *
 * classifyFinancialDoc — a cost-pool book must route to is_project_cost_pool and
 *   NOT to is_project_revenue (the 29-col ITD parser) or the generic P&L parser.
 *
 * The fixture mirrors the real trimmed vault extract (pipe-delimited "## Sheet:"
 * format) with two monthly sheets, a YTD sheet, subtotal rows, a negative
 * Op Income row, and two distinct contracts that share one Project Name.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const calls: Array<{ sql: string; params: unknown[] }> = [];

// pool.query / pooled client are mocked so we capture the exact INSERT payloads
// without a DB. The itd-presence SELECT returns 0 rows so every period is treated
// as "cost-pool-only" (snapshot-replace + INSERT) — the June-style path.
vi.mock('../../src/lib/db.js', () => {
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params: params ?? [] });
    if (/SELECT 1 FROM project_revenue_actuals/i.test(sql)) {
      return { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 1 };
  });
  return {
    pool: { query, connect: vi.fn(async () => ({ query, release: vi.fn() })) },
  };
});

import {
  parseRevenueSummaryByCostPool,
} from '../../src/services/financials/deterministic-parsers.js';
import { ingestProjectCostPoolRows } from '../../src/services/financials/ingest.js';
import { classifyFinancialDoc } from '../../src/services/financials/reingest-doc.js';

const ET = join(__dirname, '../fixtures/financials/extracted_text');
const text = readFileSync(
  join(ET, 'revenue-summary-cost-pool-jun-2026.extracted.txt'),
  'utf8',
);
const FILE = 'Revenue Summary by Cost Pool JUN-26.xlsx';

describe('parseRevenueSummaryByCostPool', () => {
  const out = parseRevenueSummaryByCostPool(text, FILE);

  it('parses the cost-pool header and returns rows', () => {
    expect(out).not.toBeNull();
    expect(out!.is_project_cost_pool).toBe(true);
    expect(out!.rows.length).toBeGreaterThan(0);
  });

  it('emits only the monthly sheets (Jan, Feb) — never the YTD rollup sheet', () => {
    const periods = [...new Set(out!.rows.map((r) => r.period))].sort();
    expect(periods).toEqual(['FY26 Feb', 'FY26 Jan']);
    // The YTD sheet's inflated Mega II figure (22332.04) must never appear as a row.
    expect(out!.rows.some((r) => r.revenue === 22332.04)).toBe(false);
  });

  it('skips "Period N Total" subtotal rows', () => {
    expect(out!.rows.some((r) => /total/i.test(r.project_name))).toBe(false);
    expect(out!.rows.some((r) => /total/i.test(r.project_id))).toBe(false);
  });

  it('maps Pd to month/quarter and preserves project identity', () => {
    const jan = out!.rows.find(
      (r) => r.period === 'FY26 Jan' && r.project_id === '1039.005',
    );
    expect(jan).toBeDefined();
    expect(jan!.project_name).toBe('Mega II OY5');
    expect(jan!.contract_number).toBe('1039.005');
    expect(jan!.fiscal_year).toBe(2026);
    expect(jan!.month_num).toBe(1);
    expect(jan!.quarter).toBe(1);
  });

  it('maps revenue, fully-burdened cost (direct + indirect), and Op Income profit', () => {
    const jan = out!.rows.find(
      (r) => r.period === 'FY26 Jan' && r.project_id === '1039.005',
    )!;
    expect(jan.revenue).toBeCloseTo(12332.04, 2);
    expect(jan.direct_cost).toBeCloseTo(9258.4, 2);
    expect(jan.indirect_cost).toBeCloseTo(199.32, 2);
    expect(jan.cost).toBeCloseTo(9457.72, 2); // 9258.40 + 199.32
    expect(jan.profit).toBeCloseTo(2874.32, 2); // Op Income-ACT, == revenue - cost
    expect(jan.revenue - jan.cost).toBeCloseTo(jan.profit, 2);
  });

  it('converts Op Profit % from a fraction to percentage points', () => {
    const jan = out!.rows.find(
      (r) => r.period === 'FY26 Jan' && r.project_id === '1039.005',
    )!;
    expect(jan.margin_pct).toBeCloseTo(23.31, 2); // 0.233077... × 100
  });

  it('preserves negative Op Income / margin', () => {
    const neg = out!.rows.find((r) => r.project_id === '1047.031')!;
    expect(neg.profit).toBeCloseTo(-91.88, 2);
    expect(neg.margin_pct!).toBeLessThan(0);
  });

  it('keeps distinct contracts that share a Project Name separate (by L2 Proj ID)', () => {
    const jan = out!.rows.filter(
      (r) => r.period === 'FY26 Jan' && r.project_name === 'Shared Program Name',
    );
    expect(jan).toHaveLength(2);
    expect(new Set(jan.map((r) => r.project_id))).toEqual(
      new Set(['5001.001', '5001.002']),
    );
    expect(jan.find((r) => r.project_id === '5001.001')!.revenue).toBeCloseTo(10000, 2);
    expect(jan.find((r) => r.project_id === '5001.002')!.revenue).toBeCloseTo(20000, 2);
  });
});

describe('ingestProjectCostPoolRows — YTD derived by summing official months', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('accumulates actual_ytd_* per contract across Jan..Feb and preserves signs', async () => {
    const out = parseRevenueSummaryByCostPool(text, FILE)!;
    const n = await ingestProjectCostPoolRows(out.rows, 219);
    expect(n).toBeGreaterThan(0);

    const inserts = calls.filter((c) => /INSERT INTO project_revenue_actuals/i.test(c.sql));
    // Param layout: [period, fy, quarter, name, contract, project_id, revenue,
    //   cost, margin, actual_period_revenue, actual_period_costs,
    //   actual_period_profit, actual_ytd_revenue, actual_ytd_costs,
    //   actual_ytd_profit, source_doc_id]
    const find = (period: string, contract: string) =>
      inserts.find((c) => c.params[0] === period && c.params[4] === contract)!;

    const janMega = find('FY26 Jan', '1039.005');
    expect(janMega.params[12]).toBeCloseTo(12332.04, 2); // ytd revenue = Jan only
    expect(janMega.params[15]).toBe(219); // source_doc_id preserved (R1)

    const febMega = find('FY26 Feb', '1039.005');
    expect(febMega.params[9]).toBeCloseTo(10000, 2); // period revenue = Feb
    expect(febMega.params[12]).toBeCloseTo(22332.04, 2); // ytd = Jan + Feb

    // Cumulative YTD for a contract present in both months.
    const febShared = find('FY26 Feb', '5001.001');
    expect(febShared.params[12]).toBeCloseTo(20000, 2); // 10000 + 10000

    // A contract present only in Jan keeps that month as its YTD.
    const janSharedB = find('FY26 Jan', '5001.002');
    expect(janSharedB.params[12]).toBeCloseTo(20000, 2);

    // Negative Op Income flows through to the stored profit.
    const janNeg = find('FY26 Jan', '1047.031');
    expect(janNeg.params[11]).toBeCloseTo(-91.88, 2);
  });

  it('does not write any target/plan columns (they stay unavailable)', async () => {
    const out = parseRevenueSummaryByCostPool(text, FILE)!;
    await ingestProjectCostPoolRows(out.rows, 219);
    const inserts = calls.filter((c) => /INSERT INTO project_revenue_actuals/i.test(c.sql));
    for (const c of inserts) {
      expect(c.sql).not.toMatch(/target_/i);
    }
  });
});

describe('classifyFinancialDoc — cost-pool routing', () => {
  it('routes the cost-pool book to is_project_cost_pool, not is_project_revenue', () => {
    const cls = classifyFinancialDoc(FILE, text, 'financial');
    expect(cls.is_project_cost_pool).toBe(true);
    expect(cls.is_project_revenue).toBe(false);
    expect(cls.is_financial).toBe(false); // generic P&L suppressed
  });

  it('classifies by header signature even when the filename is generic', () => {
    const cls = classifyFinancialDoc('report.xlsx', text, 'financial');
    expect(cls.is_project_cost_pool).toBe(true);
    expect(cls.is_project_revenue).toBe(false);
  });
});
