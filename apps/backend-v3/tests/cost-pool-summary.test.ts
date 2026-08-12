/**
 * Aggregation rules for the "Revenue Summary by Cost Pool" Financial Bible tab.
 *
 * The tab lets an executive slice the official book by period, contract/vehicle,
 * prime-vs-sub and contract type. Those slices are only trustworthy if the
 * aggregation is exact:
 *   - pools SUM across the months in scope;
 *   - a pool the book never stated stays null ("—"), so it can never be read as
 *     a real $0 (R1 / missing-vs-zero);
 *   - percentages RE-DERIVE from summed dollars (a margin cannot be averaged);
 *   - Contract Value / Total Funded / ITD Revenue are standing per-contract
 *     figures restated on every monthly row, so they must NOT be multiplied by
 *     the month count — they sum across contracts, not across months.
 */
import { describe, it, expect } from 'vitest';
import {
  aggregateCostPoolRows,
  buildCostPoolProjectRows,
  buildCostPoolPeriodSeries,
  costPoolIdentity,
  COST_POOL_DOLLAR_FIELDS,
  type CostPoolSourceRow,
} from '../src/lib/cost-pool-summary.js';

function row(overrides: Partial<CostPoolSourceRow> = {}): CostPoolSourceRow {
  const base = {
    period: 'FY26 Jan',
    month_num: 1,
    project_id: null,
    project_name: 'X',
    contract_number: null,
    division: null,
    contract_label: null,
    prime_or_sub: null,
    proj_type: null,
    org_id: null,
    pop_start: null,
    pop_end: null,
    is_active: null,
    source_doc_id: null,
  } as CostPoolSourceRow;
  for (const f of COST_POOL_DOLLAR_FIELDS) base[f] = null;
  return { ...base, ...overrides };
}

describe('aggregateCostPoolRows', () => {
  it('sums pools across months and re-derives the percentages', () => {
    const totals = aggregateCostPoolRows([
      row({ month_num: 1, revenue: 100_000, direct_cost: 60_000, gross_profit: 40_000, indirect_cost: 30_000, profit: 10_000, dc_dl_onsite: 60_000 }),
      row({ period: 'FY26 Feb', month_num: 2, revenue: 300_000, direct_cost: 200_000, gross_profit: 100_000, indirect_cost: 70_000, profit: 30_000, dc_dl_onsite: 200_000 }),
    ]);
    expect(totals.revenue).toBe(400_000);
    expect(totals.direct_cost).toBe(260_000);
    expect(totals.dc_dl_onsite).toBe(260_000);
    expect(totals.profit).toBe(40_000);
    // 40,000 / 400,000 — NOT the average of 10% and 10%.
    expect(totals.margin_pct).toBeCloseTo(10, 2);
    expect(totals.gross_profit_pct).toBeCloseTo(35, 2); // 140,000 / 400,000
  });

  it('re-derives a blended margin rather than averaging month margins', () => {
    const totals = aggregateCostPoolRows([
      row({ month_num: 1, revenue: 100, profit: 50 }), // 50%
      row({ period: 'FY26 Feb', month_num: 2, revenue: 900, profit: 90 }), // 10%
    ]);
    // 140 / 1000 = 14%, not (50 + 10) / 2 = 30%.
    expect(totals.margin_pct).toBeCloseTo(14, 2);
  });

  it('keeps a pool null when no row stated it, and a real 0 as 0', () => {
    const totals = aggregateCostPoolRows([
      row({ revenue: 1000, dc_dl_onsite: 0, dc_subk_labor: null }),
    ]);
    expect(totals.dc_dl_onsite).toBe(0);
    expect(totals.dc_subk_labor).toBeNull();
  });

  it('does not multiply standing contract figures by the month count', () => {
    const totals = aggregateCostPoolRows([
      row({ month_num: 1, project_id: 'A', revenue: 10, contract_value: 500_000, total_funded: 400_000, itd_revenue: 250_000 }),
      row({ period: 'FY26 Feb', month_num: 2, project_id: 'A', revenue: 10, contract_value: 500_000, total_funded: 400_000, itd_revenue: 260_000 }),
    ]);
    expect(totals.contract_value).toBe(500_000);
    expect(totals.total_funded).toBe(400_000);
    // The latest month's statement is the current ITD, not the sum of both.
    expect(totals.itd_revenue).toBe(260_000);
    expect(totals.revenue).toBe(20);
  });

  it('sums standing contract figures across contracts', () => {
    const totals = aggregateCostPoolRows([
      row({ project_id: 'A', contract_value: 500_000 }),
      row({ project_id: 'B', contract_value: 250_000 }),
    ]);
    expect(totals.contract_value).toBe(750_000);
  });

  it('leaves margin null when revenue is zero rather than dividing by zero', () => {
    const totals = aggregateCostPoolRows([row({ revenue: 0, profit: -500 })]);
    expect(totals.margin_pct).toBeNull();
    expect(totals.profit).toBe(-500);
  });

  it('preserves a signed rate variance', () => {
    const totals = aggregateCostPoolRows([
      row({ rate_variance: 1632.23, total_indirect_tgt: 12_709.91 }),
      row({ period: 'FY26 Feb', month_num: 2, rate_variance: -36.76, total_indirect_tgt: 236.08 }),
    ]);
    expect(totals.rate_variance).toBeCloseTo(1595.47, 2);
    expect(totals.total_indirect_tgt).toBeCloseTo(12_945.99, 2);
  });

  it('collects the source documents backing the figures (R1)', () => {
    const totals = aggregateCostPoolRows([
      row({ source_doc_id: 224 }),
      row({ source_doc_id: 219 }),
      row({ source_doc_id: 224 }),
    ]);
    expect(totals.source_doc_ids).toEqual([219, 224]);
  });

  it('returns all-null totals for an empty scope instead of zeros', () => {
    const totals = aggregateCostPoolRows([]);
    expect(totals.revenue).toBeNull();
    expect(totals.direct_cost).toBeNull();
    expect(totals.margin_pct).toBeNull();
    expect(totals.source_doc_ids).toEqual([]);
  });
});

describe('buildCostPoolProjectRows', () => {
  const rows = [
    row({ project_id: '1039.005', project_name: 'Mega II OY5', month_num: 1, revenue: 12_332.04, contract_label: 'MEGA', prime_or_sub: 'CACI', proj_type: 'T&M' }),
    row({ project_id: '1039.005', project_name: 'Mega II OY5', period: 'FY26 Feb', month_num: 2, revenue: 10_000 }),
    row({ project_id: '1047.008', project_name: 'W56KGY22F0028', month_num: 1, revenue: 712_123.64, contract_label: 'RS3 - SETA IEW&S', prime_or_sub: 'PRIME', proj_type: 'CPFF' }),
  ];

  it('folds a contract\'s months into one row, revenue-descending', () => {
    const out = buildCostPoolProjectRows(rows);
    expect(out).toHaveLength(2);
    expect(out[0].project_id).toBe('1047.008');
    expect(out[1].revenue).toBeCloseTo(22_332.04, 2);
  });

  it('carries attributes from whichever month states them', () => {
    // The February row omits them; the folded row must still be filterable.
    const out = buildCostPoolProjectRows(rows);
    const mega = out.find((r) => r.project_id === '1039.005')!;
    expect(mega.contract_label).toBe('MEGA');
    expect(mega.prime_or_sub).toBe('CACI');
    expect(mega.proj_type).toBe('T&M');
  });

  it('keeps distinct contracts that share a project name separate', () => {
    const out = buildCostPoolProjectRows([
      row({ project_id: '5001.001', project_name: 'Shared', revenue: 10_000 }),
      row({ project_id: '5001.002', project_name: 'Shared', revenue: 20_000 }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.revenue)).toEqual([20_000, 10_000]);
  });

  it('identifies a contract by id, then contract number, then name', () => {
    expect(costPoolIdentity({ ...row({ project_id: 'A', contract_number: 'B', project_name: 'C' }) })).toBe('A');
    expect(costPoolIdentity({ ...row({ project_id: null, contract_number: 'B', project_name: 'C' }) })).toBe('B');
    expect(costPoolIdentity({ ...row({ project_id: null, contract_number: null, project_name: 'C' }) })).toBe('C');
  });
});

describe('buildCostPoolPeriodSeries', () => {
  it('orders the trend by fiscal month and totals each month', () => {
    const series = buildCostPoolPeriodSeries([
      row({ period: 'FY26 Feb', month_num: 2, revenue: 300 }),
      row({ period: 'FY26 Jan', month_num: 1, revenue: 100 }),
      row({ period: 'FY26 Jan', month_num: 1, revenue: 50 }),
    ]);
    expect(series.map((p) => p.period)).toEqual(['FY26 Jan', 'FY26 Feb']);
    expect(series[0].revenue).toBe(150);
    expect(series[1].revenue).toBe(300);
  });
});
