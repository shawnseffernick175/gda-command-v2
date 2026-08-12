/**
 * Route test for GET /v3/financials/cost-pool-summary — the API behind the
 * Financial Bible's "Revenue by Cost Pool" tab.
 *
 * The tab's trustworthiness rests on this route, so the contract is pinned:
 * only the official monthly rows are read (never the book's own pre-summed
 * Q/YTD rows, which would double-count), quarter and YTD are derived from
 * those months, attribute filters scope the chart series and the totals
 * identically, the offered filter options do not shrink when one is applied,
 * and a value the book never stated stays null instead of becoming $0.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;

const queryImpl = { fn: vi.fn() as unknown as QueryFn };
const seen: { sql: string; params?: unknown[] }[] = [];

vi.mock('../../src/lib/db.js', () => ({
  pool: {
    query: (sql: string, params?: unknown[]) => {
      seen.push({ sql, params });
      return queryImpl.fn(sql, params);
    },
  },
}));

process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'test-secret-test-secret-test-secret-1234';
process.env['DATABASE_URL'] = 'postgres://test:test@localhost:5432/test';

import Fastify, { type FastifyInstance } from 'fastify';
import { requestIdHook } from '../../src/middleware/requestId.js';

/** One book row. Anything omitted is a pool the book left blank. */
function bookRow(over: Record<string, unknown>): Record<string, unknown> {
  return {
    period: 'FY26 Jan',
    project_id: '4510.002',
    project_name: 'FOFC Option Yr 2',
    contract_number: '4510',
    division: 'Envision',
    contract_label: 'FOFC',
    prime_or_sub: 'PRIME',
    proj_type: 'CPFF',
    org_id: '1.01',
    pop_start: null,
    pop_end: null,
    is_active: true,
    revenue: null,
    direct_cost: null,
    indirect_cost: null,
    cost: null,
    profit: null,
    gross_profit: null,
    total_indirect_tgt: null,
    rate_variance: null,
    dc_dl_offsite: null,
    dc_dl_onsite: null,
    dc_direct_travel: null,
    dc_subk_labor: null,
    dc_subk_travel: null,
    dc_subk_material: null,
    dc_consultant_labor: null,
    dc_consultant_travel: null,
    dc_direct_material: null,
    dc_direct_odc: null,
    ind_oh_offsite: null,
    ind_oh_onsite: null,
    ind_mhx: null,
    ind_gna: null,
    itd_value: null,
    itd_funding: null,
    actual_itd_revenue: null,
    source_doc_id: 224,
    ...over,
  };
}

// Two months of one prime contract plus one month of a sub contract. Jan states
// a real $0 travel pool; no row anywhere states MHx.
const BOOK = [
  bookRow({
    period: 'FY26 Jan',
    revenue: 100_000, direct_cost: 60_000, gross_profit: 40_000,
    indirect_cost: 30_000, total_indirect_tgt: 28_000, rate_variance: 2_000,
    profit: 10_000, dc_dl_offsite: 60_000, dc_direct_travel: 0, ind_gna: 30_000,
  }),
  bookRow({
    period: 'FY26 Feb',
    revenue: 210_000, direct_cost: 92_000, gross_profit: 118_000,
    indirect_cost: 96_000, total_indirect_tgt: 92_000, rate_variance: 4_000,
    profit: 22_000, dc_dl_offsite: 92_000, ind_gna: 96_000,
  }),
  bookRow({
    period: 'FY26 Feb',
    project_id: '4600.001', project_name: 'RS3 STEP', contract_number: '4600',
    contract_label: 'RS3 - STEP', prime_or_sub: 'CACI', proj_type: 'T&M',
    division: 'Envision',
    revenue: 50_000, direct_cost: 30_000, gross_profit: 20_000,
    indirect_cost: 15_000, total_indirect_tgt: 15_000, rate_variance: 0,
    profit: 5_000, dc_subk_labor: 30_000, ind_gna: 15_000,
    source_doc_id: 224,
  }),
];

interface Figures {
  revenue: number | null;
  direct_cost: number | null;
  indirect_cost: number | null;
  profit: number | null;
  rate_variance: number | null;
  dc_direct_travel: number | null;
  ind_mhx: number | null;
  margin_pct: number | null;
  source_doc_ids: number[];
}

interface Payload {
  rows: Array<{ project_name: string; prime_or_sub: string | null } & Figures>;
  totals: Figures;
  by_period: Array<{ period: string; revenue: number | null }>;
  filters: {
    contract_labels: string[];
    prime_or_subs: string[];
    proj_types: string[];
    divisions: string[];
  };
  available_months: string[];
  available_quarters: string[];
  selected_period: string;
  meta: { table: string; row_count: number; project_count: number; source: string };
}

describe('GET /v3/financials/cost-pool-summary', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    seen.length = 0;
    queryImpl.fn = vi.fn(async () => ({ rows: BOOK, rowCount: BOOK.length })) as unknown as QueryFn;
    const { financialsRoutes } = await import('../../src/routes/financials.js');
    app = Fastify();
    app.addHook('onRequest', requestIdHook);
    await app.register(financialsRoutes);
    await app.ready();
  });

  async function get(qs: string): Promise<Payload> {
    const res = await app.inject({
      method: 'GET',
      url: `/v3/financials/cost-pool-summary${qs}`,
    });
    expect(res.statusCode).toBe(200);
    return (JSON.parse(res.body) as { data: Payload }).data;
  }

  it('reads only the official monthly rows, never the book\'s own Q/YTD rows', async () => {
    await get('');
    const sql = seen.map((s) => s.sql).join('\n');
    expect(sql).toContain("period NOT LIKE '%Q%'");
    expect(sql).toContain("period <> 'YTD'");
    expect(sql).toContain("source = 'proj_revenue'");
  });

  it('derives YTD by summing the monthly rows', async () => {
    const d = await get('');
    expect(d.selected_period).toBe('YTD');
    expect(d.totals.revenue).toBe(360_000);
    expect(d.totals.direct_cost).toBe(182_000);
    expect(d.totals.indirect_cost).toBe(141_000);
    expect(d.totals.profit).toBe(37_000);
    // Margin is derived from the summed dollars, not averaged from the rows
    // (an average of 10.0% / 10.5% / 10.0% would not equal 10.28%).
    expect(d.totals.margin_pct).toBeCloseTo((37_000 / 360_000) * 100, 1);
    expect(d.totals.source_doc_ids).toEqual([224]);
    expect(d.meta.table).toBe('project_revenue_actuals');
    expect(d.meta.source).toBe('Revenue Summary by Cost Pool');
  });

  it('scopes to a single month when one is selected', async () => {
    const d = await get('?period=FY26%20Jan');
    expect(d.selected_period).toBe('FY26 Jan');
    expect(d.totals.revenue).toBe(100_000);
    expect(d.rows).toHaveLength(1);
    // The chart still trends every ingested month, so the slice has context.
    expect(d.by_period.map((p) => p.period)).toEqual(['FY26 Jan', 'FY26 Feb']);
  });

  it('sums the calendar months of a selected quarter', async () => {
    const d = await get('?period=Q1');
    expect(d.selected_period).toBe('Q1');
    expect(d.totals.revenue).toBe(360_000);
    expect(d.available_quarters).toEqual(['Q1']);
    expect(d.available_months).toEqual(['FY26 Jan', 'FY26 Feb']);
  });

  it('keeps a stated $0 distinct from a pool the book never stated', async () => {
    const d = await get('');
    // Direct travel: stated as zero in January only — a real zero.
    expect(d.totals.dc_direct_travel).toBe(0);
    // MHx: never stated by any row — must stay null so the UI shows "—".
    expect(d.totals.ind_mhx).toBeNull();
  });

  it('scopes totals AND the chart series with the same attribute filter', async () => {
    const d = await get('?prime_or_sub=CACI');
    expect(d.rows.map((r) => r.project_name)).toEqual(['RS3 STEP']);
    expect(d.totals.revenue).toBe(50_000);
    // The trend must follow the filter: January has no CACI row at all.
    expect(d.by_period.map((p) => p.period)).toEqual(['FY26 Feb']);
    expect(d.by_period[0]?.revenue).toBe(50_000);
  });

  it('still offers every filter value the book states while one filter is applied', async () => {
    const d = await get('?prime_or_sub=CACI');
    expect(d.filters.prime_or_subs).toEqual(['CACI', 'PRIME']);
    expect(d.filters.contract_labels).toEqual(['FOFC', 'RS3 - STEP']);
    expect(d.filters.proj_types).toEqual(['CPFF', 'T&M']);
    expect(d.filters.divisions).toEqual(['Envision']);
  });

  it('combines filters and reports an empty scope honestly', async () => {
    const d = await get('?prime_or_sub=CACI&proj_type=CPFF');
    expect(d.rows).toEqual([]);
    // No fabricated zeros for a scope the book has no rows for.
    expect(d.totals.revenue).toBeNull();
    expect(d.totals.profit).toBeNull();
    expect(d.meta.project_count).toBe(0);
  });

  it('passes the selected contracts to the query', async () => {
    await get('?projects=FOFC%20Option%20Yr%202%7C4600');
    const call = seen.find((s) => s.sql.includes('project_revenue_actuals'));
    expect(call?.params?.[0]).toEqual(['FOFC Option Yr 2', '4600']);
  });
});
