/**
 * F-1142 Pillar 5 — ingestion-robustness regression suite.
 *
 * These lock in the cure's behavioural guarantees so a future refactor cannot
 * silently regress them. Each case asserts a CONCRETE outcome (row count, a
 * reconciling dollar sum, a classification, or an explicit verdict) against the
 * REAL trimmed vault fixtures — never a self-referential "parser agrees with
 * itself" check.
 *
 *   1. Rename tolerance   — the same GL content under three unrelated filenames
 *                           classifies + parses identically (content, not name).
 *   2. _x000D_ headers    — an ExcelJS carriage-return marker inside a header
 *                           cell still resolves the column (non-zero rows).
 *   3. Aged A/R           — grouped / blank-label rows extract non-zero and the
 *                           report classifies OPERATIONAL (never the Bible).
 *   4. Trended IS/BS      — the June trended statements reconcile to the printed
 *                           Total Direct Costs / Balance-Sheet subtotals.
 *   5. Supersede          — an older 0-row copy of an already-ingested period is
 *                           demoted to skipped_duplicate, pointing at the keeper.
 *   6. Explicit verdict   — every pipeline outcome maps to INGESTED /
 *                           NEEDS_REVIEW / SKIPPED / FAILED; nothing is silent.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseTrendedStatement,
  parseAgedAr,
  parseYtdGlDetail,
} from '../../src/services/financials/deterministic-parsers.js';
import { classifyFinancialContent } from '../../src/services/ingest/classifier.js';
import {
  classifyFinancialDoc,
  computeVerdict,
  type ReingestResult,
} from '../../src/services/financials/reingest-doc.js';
import {
  classifyCoverage,
  type CoverageDocInput,
} from '../../src/services/financials/coverage.js';

const ET = join(__dirname, '../fixtures/financials/extracted_text');
const readFix = (name: string): string => readFileSync(join(ET, name), 'utf-8');

const baseResult = (): ReingestResult => ({
  plan: 0, actual: 0, rejected: 0, balance_sheet: 0, cost_detail: 0, sie: 0,
  ap: 0, ar: 0, trial_balance: 0, project_revenue: 0, income_statement: 0,
  parsers_run: [], parsers_skipped: [], any_ingested: false, parse_warnings: [],
});

// ── 1. Rename tolerance — same GL content, three unrelated filenames ──────────
describe('rename tolerance — GL Detail classifies + parses by content, not filename', () => {
  const glText = readFix('gl-detail-ytd-may-2026.extracted.txt');
  const names = ['YTD GL Detail MAY-26.xlsx', 'random-export-2026.xlsx', 'ledger dump.csv'];

  it('classifies as the same financial_statement/gl_detail under every name', () => {
    for (const name of names) {
      const cc = classifyFinancialContent(name, glText);
      expect(cc.entity_type).toBe('financial_statement');
      expect(cc.doc_kind).toBe('gl_detail');
    }
  });

  it('routes to the cost_detail parser under every name (reingest classifier)', () => {
    for (const name of names) {
      expect(classifyFinancialDoc(name, glText, 'financial').is_cost_detail).toBe(true);
    }
  });

  it('parses to identical rows / periods / summed amount under every name', () => {
    const results = names.map((n) => parseYtdGlDetail(glText, n));
    for (const r of results) expect(r).not.toBeNull();
    const rowCounts = results.map((r) => r!.rows.length);
    const sums = results.map((r) =>
      r!.rows.reduce((a, row) => a + (row.actual_amount ?? 0), 0),
    );
    const periodSets = results.map((r) =>
      Array.from(new Set(r!.rows.map((row) => row.period))).sort().join(','),
    );
    expect(new Set(rowCounts).size).toBe(1);
    expect(new Set(sums.map((s) => s.toFixed(2))).size).toBe(1);
    expect(new Set(periodSets).size).toBe(1);
    // Concrete ground truth (independent of filename): five YTD periods.
    expect(rowCounts[0]).toBe(25);
    expect(sums[0]).toBeCloseTo(1549119.56, 2);
    expect(periodSets[0]).toBe('FY26 Apr,FY26 Feb,FY26 Jan,FY26 Mar,FY26 May');
  });
});

// ── 2. _x000D_ carriage-return markers inside header cells ────────────────────
describe('_x000D_ header markers — columns still resolve (Aged A/R)', () => {
  const arText = readFix('aged-ar-may-2026.extracted.txt');
  const injected = arText
    .replace('31 to 60', '31 to_x000D_60')
    .replace('Balance Due', 'Balance_x000D_Due');

  it('parses the same non-zero rows with or without _x000D_ in the header', () => {
    const clean = parseAgedAr(arText, 'aged-ar-may-2026.xlsx');
    const dirty = parseAgedAr(injected, 'aged-ar-may-2026.xlsx');
    expect(clean).not.toBeNull();
    expect(dirty).not.toBeNull();
    const sumClean = clean!.rows.reduce((a, r) => a + (r.amount ?? 0), 0);
    const sumDirty = dirty!.rows.reduce((a, r) => a + (r.amount ?? 0), 0);
    expect(dirty!.rows.length).toBe(clean!.rows.length);
    expect(sumDirty).toBeCloseTo(sumClean, 2);
    expect(sumDirty).toBeGreaterThan(0);
  });
});

// ── 3. Aged A/R — grouped/blank rows extract, and it is OPERATIONAL ───────────
describe('Aged A/R — grouped/blank-label rows extract non-zero; classified operational', () => {
  const arText = readFix('aged-ar-may-2026.extracted.txt');

  it('extracts a non-zero receivables balance from grouped/blank rows', () => {
    const ar = parseAgedAr(arText, 'aged-ar-may-2026.xlsx');
    expect(ar).not.toBeNull();
    expect(ar!.rows.length).toBe(35);
    const total = ar!.rows.reduce((a, r) => a + (r.amount ?? 0), 0);
    expect(total).toBeCloseTo(3809204.70, 2);
  });

  it('classifies as operational_finance (never the Financial Bible)', () => {
    const cc = classifyFinancialContent('aged-ar-may-2026.xlsx', arText);
    expect(cc.entity_type).toBe('operational_finance');
    expect(cc.doc_kind).toBe('aged_ar');
    // Reingest classifier keeps it on the A/R surface, not any Bible parser.
    const cls = classifyFinancialDoc('Aged AR MAY-26.xlsx', arText, 'financial');
    expect(cls.is_ar).toBe(true);
    expect(cls.is_financial).toBe(false);
    expect(cls.is_income_statement).toBe(false);
    expect(cls.is_balance_sheet).toBe(false);
  });
});

// ── 4. Trended IS / BS reconcile to the printed statement subtotals ───────────
describe('Trended statements reconcile to the printed subtotals', () => {
  it('June Trended Income Statement owns only its closing quarter (Apr–Jun) and reconciles per month', () => {
    const is = parseTrendedStatement(
      readFix('income-statement-jun-2026.extracted.txt'),
      'income-statement-jun-2026.xlsx',
    );
    expect(is).not.toBeNull();
    expect(is!.kind).toBe('income_statement');
    const byPeriod: Record<string, number> = {};
    for (const r of is!.costDetail) byPeriod[r.period] = (byPeriod[r.period] ?? 0) + (r.actual_amount ?? 0);
    // #1142 quarter-end ownership: the JUN snapshot restates Jan..Jun but owns
    // cost_detail only for Q2 (Apr/May/Jun). Q1 (Jan/Feb/Mar) is owned by the MAR
    // snapshot, so the same figure is never written from two docs.
    const expected: Record<string, number> = {
      'FY26 Apr': 4094976.59,
      'FY26 May': 1426578.86,
      'FY26 Jun': 2043031.87,
    };
    for (const [period, amt] of Object.entries(expected)) {
      expect(byPeriod[period]).toBeCloseTo(amt, 2);
    }
    // Q1 months are NOT emitted by the June snapshot (owned by the MAR snapshot).
    expect(byPeriod['FY26 Jan']).toBeUndefined();
    expect(byPeriod['FY26 Feb']).toBeUndefined();
    expect(byPeriod['FY26 Mar']).toBeUndefined();
  });

  it('June Trended Balance Sheet subtotals reconcile (FY26 Jan)', () => {
    const bs = parseTrendedStatement(
      readFix('balance-sheet-jun-2026.extracted.txt'),
      'balance-sheet-jun-2026.xlsx',
    );
    expect(bs).not.toBeNull();
    expect(bs!.kind).toBe('balance_sheet');
    const jan = bs!.balanceSheet.find((r) => r.period === 'FY26 Jan');
    expect(jan).toBeDefined();
    expect(jan!.cash).toBeCloseTo(787916.05, 2);
    expect(jan!.total_current_assets).toBeCloseTo(7253154.71, 2);
    expect(jan!.total_assets).toBeCloseTo(7517825.69, 2);
    expect(jan!.accounts_payable).toBeCloseTo(3784518.71, 2);
    expect(jan!.total_equity).toBeCloseTo(515381.38, 2);
  });
});

// ── 5. Supersede — older 0-row copy demoted to skipped_duplicate ──────────────
describe('duplicate supersede — newest ingested kept, older empty copy skipped', () => {
  it('demotes the older 0-row re-upload to skipped_duplicate pointing at the keeper', () => {
    const docs: CoverageDocInput[] = [
      { doc_id: 10, filename: 'Trended IS MAY-26.xlsx', extraction_status: 'success',
        row_count: 48, primary_type: 'income_statement', period: 'FY26 May', handler_matched: true },
      { doc_id: 7, filename: 'Trended IS MAY-26 (old).xlsx', extraction_status: 'success',
        row_count: 0, primary_type: 'income_statement', period: 'FY26 May', handler_matched: true },
    ];
    const verdicts = classifyCoverage(docs);
    expect(verdicts.get(10)!.status).toBe('ingested');
    const older = verdicts.get(7)!;
    expect(older.status).toBe('skipped_duplicate');
    expect(older.duplicate_of).toBe(10);
  });
});

// ── 6. Explicit verdict — no outcome is silent ────────────────────────────────
describe('computeVerdict — every outcome is explicit (Pillar 4)', () => {
  it('rows landed -> INGESTED with a detail breakdown', () => {
    const r = baseResult();
    r.cost_detail = 48; r.sie = 12; r.any_ingested = true; r.parsers_run = ['income_statement_extract'];
    const v = computeVerdict(r);
    expect(v.verdict).toBe('INGESTED');
    expect(v.detail).toContain('cost_detail=48');
  });

  it('handler ran but produced 0 rows -> NEEDS_REVIEW (never swallowed)', () => {
    const r = baseResult();
    r.parsers_run = ['cost_detail_extract'];
    r.parse_warnings = ['cost_detail_extract: 0 rows (header/row detection failed)'];
    const v = computeVerdict(r);
    expect(v.verdict).toBe('NEEDS_REVIEW');
    expect(v.detail).toContain('0 rows');
  });

  it('no handler recognized the file -> SKIPPED', () => {
    const v = computeVerdict(baseResult());
    expect(v.verdict).toBe('SKIPPED');
  });
});
