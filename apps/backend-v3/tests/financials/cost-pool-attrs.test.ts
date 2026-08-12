/**
 * Regression tests for the CURRENT layout of the "Revenue Summary by Cost Pool"
 * book, which the earlier parser could only partly read.
 *
 * The book now states, on every monthly sheet, the per-contract attributes
 * Finance groups by — Division, Contract (vehicle/program), Prime or Sub, Proj
 * Type, period of performance, Contract Value, Total Funded and ITD Revenue —
 * and it heads onsite direct labor "DL - CL Onsite" (client-site) and revenue
 * "Pd <n> Revenue". Against that layout the old parser silently dropped every
 * attribute and, worse, read onsite direct labor as "not available" because it
 * only knew the "DL - CO Onsite" spelling.
 *
 * The fixture is a faithful trim of the real June book (header + 3 contracts +
 * the "Period N Total" subtotal row per sheet, plus the YTD rollup sheet), in
 * the pipe-delimited "## Sheet:" shape the vault extractor produces.
 *
 * The older layout must keep parsing identically — covered by
 * revenue-cost-pool.test.ts against its own fixture.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const calls: Array<{ sql: string; params: unknown[] }> = [];

// DB mocked so the exact INSERT payload is observable. The itd-presence SELECT
// returns no rows, so every period is "cost-pool-only" (the INSERT path).
vi.mock('../../src/lib/db.js', () => {
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params: params ?? [] });
    if (/SELECT 1 FROM project_revenue_actuals/i.test(sql)) return { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 1 };
  });
  return { pool: { query, connect: vi.fn(async () => ({ query, release: vi.fn() })) } };
});

import { parseRevenueSummaryByCostPool } from '../../src/services/financials/deterministic-parsers.js';
import { ingestProjectCostPoolRows } from '../../src/services/financials/ingest.js';

const text = readFileSync(
  join(__dirname, '../fixtures/financials/extracted_text/revenue-summary-cost-pool-attrs-jun-2026.extracted.txt'),
  'utf8',
);
const FILE = 'Revenue Summary by Cost Pool JUN-26.xlsx';

const out = parseRevenueSummaryByCostPool(text, FILE)!;
const mega = out.rows.find((r) => r.period === 'FY26 Jan' && r.project_id === '1039.005')!;
const seta = out.rows.find((r) => r.period === 'FY26 Jan' && r.project_id === '1047.008')!;

describe('parseRevenueSummaryByCostPool — current book layout', () => {
  it('parses the wider header and emits only the monthly sheets', () => {
    expect(out.is_project_cost_pool).toBe(true);
    const periods = [...new Set(out.rows.map((r) => r.period))].sort();
    expect(periods).toEqual(['FY26 Feb', 'FY26 Jan']);
    expect(out.rows.some((r) => /total/i.test(r.project_name))).toBe(false);
  });

  it('reads "Pd <n> Revenue" as the period revenue, never ITD Revenue-ACT', () => {
    // The book states Pd 1 Revenue 12,332.04 and ITD Revenue-ACT 126,780.20 on
    // the same row; a substring header match could pick the wrong one.
    expect(mega.revenue).toBeCloseTo(12332.04, 2);
    expect(mega.itd_revenue).toBeCloseTo(126780.2, 2);
  });

  it('reads onsite direct labor headed "DL - CL Onsite"', () => {
    expect(seta.dc_dl_onsite).toBeCloseTo(216618.61, 2);
    expect(seta.dc_dl_offsite).toBeCloseTo(5104.8, 2);
    // A contract with genuinely no onsite labor keeps a real 0, not null.
    expect(mega.dc_dl_onsite).toBe(0);
  });

  it('captures the per-contract attributes the tab groups and filters by', () => {
    expect(mega.division).toBe('Envision');
    expect(mega.contract_label).toBe('MEGA');
    expect(mega.prime_or_sub).toBe('CACI');
    expect(mega.proj_type).toBe('T&M');
    expect(mega.org_id).toBe('1.01.01.01');
    expect(mega.is_active).toBe(true);

    expect(seta.contract_label).toBe('RS3 - SETA IEW&S');
    expect(seta.prime_or_sub).toBe('PRIME');
    expect(seta.proj_type).toBe('CPFF');
  });

  it('does not confuse "Contract" with "Contract Value"', () => {
    // Adjacent columns; an exact-match-only lookup keeps them apart.
    expect(mega.contract_label).toBe('MEGA');
    expect(mega.contract_value).toBeCloseTo(158939.08, 2);
    expect(mega.total_funded).toBeCloseTo(158939.08, 2);
    // Funded below contract value must survive as stated (partially funded TO).
    expect(seta.contract_value).toBeCloseTo(9644887.03, 2);
    expect(seta.total_funded).toBeCloseTo(8991057.37, 2);
  });

  it('parses period of performance as ISO dates', () => {
    expect(mega.pop_start).toBe('2025-04-07');
    expect(mega.pop_end).toBe('2026-04-06');
  });

  it('still maps the roll-ups and signed rate variance', () => {
    expect(mega.direct_cost).toBeCloseTo(9258.4, 2);
    expect(mega.indirect_cost).toBeCloseTo(199.32, 2);
    expect(mega.gross_profit).toBeCloseTo(3073.64, 2);
    expect(mega.profit).toBeCloseTo(2874.32, 2);
    expect(mega.margin_pct).toBeCloseTo(23.31, 2);
    expect(mega.total_indirect_tgt).toBeCloseTo(236.08, 2);
    expect(mega.rate_variance).toBeCloseTo(-36.76, 2);
  });

  it('leaves attributes null for an older layout that omits them', () => {
    const legacy = readFileSync(
      join(__dirname, '../fixtures/financials/extracted_text/revenue-summary-cost-pool-jun-2026.extracted.txt'),
      'utf8',
    );
    const old = parseRevenueSummaryByCostPool(legacy, FILE)!;
    const row = old.rows.find((r) => r.project_id === '1039.005')!;
    expect(row.contract_label).toBeNull();
    expect(row.prime_or_sub).toBeNull();
    expect(row.pop_start).toBeNull();
    expect(row.contract_value).toBeNull();
    expect(row.itd_revenue).toBeNull();
    // Proj Type / Organization ID / Active exist in both layouts.
    expect(row.proj_type).toBe('T&M');
    // The older spelling of onsite direct labor is still read.
    expect(row.dc_dl_onsite).toBe(0);
    expect(old.rows.find((r) => r.project_id === '5001.001')!.dc_dl_onsite).toBeCloseTo(4000, 2);
  });
});

describe('ingestProjectCostPoolRows — attributes persisted', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('writes the contract attributes and standing figures with the row', async () => {
    await ingestProjectCostPoolRows(out.rows, 224);
    const insert = calls
      .filter((c) => /INSERT INTO project_revenue_actuals/i.test(c.sql))
      .find((c) => c.params[0] === 'FY26 Jan' && c.params[4] === '1039.005')!;

    expect(insert.sql).toMatch(/contract_label/);
    // attrs occupy $37..$44 (params 36..43), itd $45..$47 (params 44..46).
    expect(insert.params[36]).toBe('Envision');
    expect(insert.params[37]).toBe('MEGA');
    expect(insert.params[38]).toBe('CACI');
    expect(insert.params[39]).toBe('T&M');
    expect(insert.params[41]).toBe('2025-04-07');
    expect(insert.params[42]).toBe('2026-04-06');
    expect(insert.params[43]).toBe(true);
    expect(insert.params[44]).toBeCloseTo(158939.08, 2); // Contract Value
    expect(insert.params[46]).toBeCloseTo(126780.2, 2); // ITD Revenue-ACT
  });

  it('never overwrites a Full-Proj-sourced ITD figure with the cost-pool book', async () => {
    await ingestProjectCostPoolRows(out.rows, 224);
    const insert = calls
      .filter((c) => /INSERT INTO project_revenue_actuals/i.test(c.sql))[0];
    // Full Proj Revenue Summary owns itd_value / itd_funding /
    // actual_itd_revenue; this book only fills them where it left them unset.
    expect(insert.sql).toMatch(/itd_value = COALESCE\(NULLIF\(project_revenue_actuals\.itd_value, 0\), EXCLUDED\.itd_value\)/);
    expect(insert.sql).toMatch(/actual_itd_revenue = COALESCE\(NULLIF\(project_revenue_actuals\.actual_itd_revenue, 0\), EXCLUDED\.actual_itd_revenue\)/);
  });
});
