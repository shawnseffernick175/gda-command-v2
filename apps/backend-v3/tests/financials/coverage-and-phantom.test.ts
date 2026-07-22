/**
 * F-1142 — zero-touch financial ingestion.
 *
 *  - Bug 3: every uploaded doc must surface an explicit coverage result
 *    (INGESTED / SKIPPED-duplicate / NOT-INGESTED+reason / EXTRACTION-FAILED);
 *    no file may fail silently as a bare `no_handler`.
 *  - Bug 4: a period with no ingested actuals must never produce a monthly P&L
 *    row. An "orders-only" row (backlog/annual orders dumped into a month) has no
 *    P&L signal and must be rejected at ingest — the phantom-June guard.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyCoverage,
  primaryTypeOf,
  handlerMatched,
  isFullYearRollup,
  type CoverageDocInput,
} from '../../src/services/financials/coverage.js';
import { rejectReason } from '../../src/services/financials/ingest.js';

type FinancialRow = Parameters<typeof rejectReason>[0];

function row(partial: Partial<FinancialRow>): FinancialRow {
  return {
    period: 'FY26 Jun',
    fiscal_year: 2026,
    quarter: null,
    kind: 'actual',
    orders: null,
    sales: null,
    ebit: null,
    gross_margin: null,
    ros: null,
    ...partial,
  } as FinancialRow;
}

describe('primaryTypeOf / handlerMatched — coverage classification helpers', () => {
  const base = {
    is_financial: false,
    is_balance_sheet: false,
    is_cost_detail: false,
    is_sie: false,
    is_ap: false,
    is_ar: false,
    is_trial_balance: false,
    is_project_revenue: false,
  };

  it('names a specialized type over the generic P&L', () => {
    expect(primaryTypeOf({ ...base, is_trial_balance: true, is_financial: true })).toBe('trial_balance');
    expect(primaryTypeOf({ ...base, is_project_revenue: true })).toBe('project_revenue');
    expect(primaryTypeOf({ ...base, is_cost_detail: true })).toBe('cost_detail');
  });

  it('falls back to income_statement for a plain P&L', () => {
    expect(primaryTypeOf({ ...base, is_financial: true })).toBe('income_statement');
  });

  it('returns null and handlerMatched=false when nothing recognizes the doc', () => {
    expect(primaryTypeOf(base)).toBeNull();
    expect(handlerMatched(base)).toBe(false);
    expect(handlerMatched({ ...base, is_ar: true })).toBe(true);
  });
});

describe('isFullYearRollup', () => {
  it('flags full-year rollups but not monthly package files', () => {
    expect(isFullYearRollup('Full Proj Revenue Summary MAY-2026.xlsx')).toBe(true);
    expect(isFullYearRollup('FY26 Annual Rollup.xlsx')).toBe(true);
    expect(isFullYearRollup('YTD MAR-2026 GL Detail.xlsx')).toBe(false);
    expect(isFullYearRollup('L2 - TARGET - MAR-2026.xlsx')).toBe(false);
  });
});

describe('classifyCoverage — no doc fails silently', () => {
  it('marks a doc with landed rows as INGESTED', () => {
    const docs: CoverageDocInput[] = [
      { doc_id: 1, filename: 'Income Statement MAR-2026.xlsx', extraction_status: 'success', row_count: 12, primary_type: 'income_statement', period: 'FY26 Mar', handler_matched: true },
    ];
    expect(classifyCoverage(docs).get(1)).toMatchObject({ status: 'ingested', reason: null });
  });

  it('a re-uploaded doc of the same type+period is SKIPPED (duplicate), not a failure', () => {
    const docs: CoverageDocInput[] = [
      { doc_id: 1, filename: 'Income Statement MAR-2026.xlsx', extraction_status: 'success', row_count: 12, primary_type: 'income_statement', period: 'FY26 Mar', handler_matched: true },
      { doc_id: 2, filename: 'Income Statement MAR-2026 (re-upload).xlsx', extraction_status: 'success', row_count: 0, primary_type: 'income_statement', period: 'FY26 Mar', handler_matched: true },
    ];
    const v = classifyCoverage(docs);
    expect(v.get(1)!.status).toBe('ingested');
    expect(v.get(2)!.status).toBe('skipped_duplicate');
    expect(v.get(2)!.duplicate_of).toBe(1);
  });

  it('a PDF twin of an ingested xlsx is SKIPPED (duplicate)', () => {
    const docs: CoverageDocInput[] = [
      { doc_id: 10, filename: 'Aged AR MAY-2026.xlsx', extraction_status: 'success', row_count: 40, primary_type: 'ar', period: 'FY26 May', handler_matched: true },
      { doc_id: 11, filename: 'Aged AR MAY-2026.pdf', extraction_status: 'success', row_count: 0, primary_type: null, period: 'FY26 May', handler_matched: false },
    ];
    const v = classifyCoverage(docs);
    expect(v.get(11)!.status).toBe('skipped_duplicate');
    expect(v.get(11)!.duplicate_of).toBe(10);
  });

  it('a full-year rollup with ingested monthly siblings is SKIPPED (duplicate)', () => {
    const docs: CoverageDocInput[] = [
      { doc_id: 20, filename: 'Proj Revenue Summary MAY-2026.xlsx', extraction_status: 'success', row_count: 8, primary_type: 'project_revenue', period: 'FY26 May', handler_matched: true },
      { doc_id: 21, filename: 'Full Proj Revenue Summary.xlsx', extraction_status: 'success', row_count: 0, primary_type: 'project_revenue', period: null, handler_matched: true },
    ];
    expect(classifyCoverage(docs).get(21)!.status).toBe('skipped_duplicate');
  });

  it('a genuine miss with a matched handler is NOT-INGESTED reason=parse_error', () => {
    const docs: CoverageDocInput[] = [
      { doc_id: 30, filename: 'YTD MAR-2026 GL Detail.xlsx', extraction_status: 'success', row_count: 0, primary_type: 'cost_detail', period: 'FY26 Mar', handler_matched: true },
    ];
    expect(classifyCoverage(docs).get(30)).toMatchObject({ status: 'not_ingested', reason: 'parse_error' });
  });

  it('a genuine miss with no handler is NOT-INGESTED reason=no_handler (never silent)', () => {
    const docs: CoverageDocInput[] = [
      { doc_id: 40, filename: 'mystery-export.xlsx', extraction_status: 'success', row_count: 0, primary_type: null, period: null, handler_matched: false },
    ];
    expect(classifyCoverage(docs).get(40)).toMatchObject({ status: 'not_ingested', reason: 'no_handler' });
  });

  it('a doc whose text never extracted is EXTRACTION-FAILED', () => {
    const docs: CoverageDocInput[] = [
      { doc_id: 50, filename: 'scan.pdf', extraction_status: 'failed', row_count: 0, primary_type: null, period: null, handler_matched: false },
    ];
    expect(classifyCoverage(docs).get(50)!.status).toBe('extraction_failed');
  });

  it('every doc receives exactly one verdict (nothing dropped)', () => {
    const docs: CoverageDocInput[] = [
      { doc_id: 1, filename: 'a.xlsx', extraction_status: 'success', row_count: 3, primary_type: 'ar', period: 'FY26 May', handler_matched: true },
      { doc_id: 2, filename: 'b.xlsx', extraction_status: 'success', row_count: 0, primary_type: null, period: null, handler_matched: false },
      { doc_id: 3, filename: 'c.pdf', extraction_status: 'failed', row_count: 0, primary_type: null, period: null, handler_matched: false },
    ];
    const v = classifyCoverage(docs);
    expect(v.size).toBe(3);
    for (const d of docs) expect(v.has(d.doc_id)).toBe(true);
  });
});

describe('phantom-June guard — orders-only rows carry no P&L signal', () => {
  it('rejects a row with only orders (sales/ebit/gm all zero) — the phantom June', () => {
    const r = row({ period: 'FY26 Jun', orders: 107_279_341, sales: 0, ebit: 0, gross_margin: 0 });
    expect(rejectReason(r, r)).toMatch(/no usable signal/);
  });

  it('rejects an orders-only row when sales/ebit/gm are null', () => {
    const r = row({ orders: 107_279_341 });
    expect(rejectReason(r, r)).toMatch(/no usable signal/);
  });

  it('keeps a real monthly P&L row that has sales', () => {
    const r = row({ period: 'FY26 May', orders: 5_000_000, sales: 4_200_000, ebit: 300_000, gross_margin: 12 });
    expect(rejectReason(r, r)).toBeNull();
  });

  it('keeps a row that has EBIT even when sales is zero', () => {
    const r = row({ sales: 0, ebit: 250_000, gross_margin: 0 });
    expect(rejectReason(r, r)).toBeNull();
  });
});

describe('classifyCoverage — cumulative trended supersession (F-1142 Pillar 4)', () => {
  it('demotes an older monthly trended IS (0 rows) to a duplicate of the newest cumulative one', () => {
    const docs: CoverageDocInput[] = [
      { doc_id: 173, filename: 'Trended Income Statement MAR-2026.xlsx', extraction_status: 'success', row_count: 0, primary_type: 'income_statement', period: 'FY26 Mar', handler_matched: true },
      { doc_id: 221, filename: 'Trended Income Statement JUN-26.xlsx', extraction_status: 'success', row_count: 48, primary_type: 'income_statement', period: 'FY26 Jun', handler_matched: true },
    ];
    const v = classifyCoverage(docs);
    expect(v.get(221)!.status).toBe('ingested');
    expect(v.get(173)!.status).toBe('skipped_duplicate');
    expect(v.get(173)!.duplicate_of).toBe(221);
  });

  it('demotes a GL Detail (cost_detail, 0 rows) superseded by the trended IS umbrella', () => {
    const docs: CoverageDocInput[] = [
      { doc_id: 179, filename: 'YTD APR-2026 GL Detail.xlsx', extraction_status: 'success', row_count: 0, primary_type: 'cost_detail', period: 'FY26 Apr', handler_matched: true },
      { doc_id: 221, filename: 'Trended Income Statement JUN-26.xlsx', extraction_status: 'success', row_count: 48, primary_type: 'income_statement', period: 'FY26 Jun', handler_matched: true },
    ];
    const v = classifyCoverage(docs);
    expect(v.get(179)!.status).toBe('skipped_duplicate');
    expect(v.get(179)!.duplicate_of).toBe(221);
  });

  it('demotes a no-month trend rollup (null period) covered by the trended BS', () => {
    const docs: CoverageDocInput[] = [
      { doc_id: 82, filename: '2026 Trend Balance Sheet.xlsx', extraction_status: 'success', row_count: 0, primary_type: 'balance_sheet', period: null, handler_matched: true },
      { doc_id: 220, filename: 'Trended Balance Sheet JUN-26.xlsx', extraction_status: 'success', row_count: 6, primary_type: 'balance_sheet', period: 'FY26 Jun', handler_matched: true },
    ];
    expect(classifyCoverage(docs).get(82)!.status).toBe('skipped_duplicate');
  });

  it('does NOT demote a genuinely newer trended IS that failed (period beyond the keeper stays parse_error)', () => {
    const docs: CoverageDocInput[] = [
      { doc_id: 300, filename: 'Trended Income Statement JUL-2026.xlsx', extraction_status: 'success', row_count: 0, primary_type: 'income_statement', period: 'FY26 Jul', handler_matched: true },
      { doc_id: 221, filename: 'Trended Income Statement JUN-26.xlsx', extraction_status: 'success', row_count: 48, primary_type: 'income_statement', period: 'FY26 Jun', handler_matched: true },
    ];
    expect(classifyCoverage(docs).get(300)).toMatchObject({ status: 'not_ingested', reason: 'parse_error' });
  });
});
