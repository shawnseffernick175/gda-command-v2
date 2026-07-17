/**
 * Regression tests for issue #1142 financial ingestion fixes.
 *
 * Bug 1  — parseYtdGlDetail must emit rows for EVERY period (PD1..PD5) in a
 *          YTD-cumulative GL Detail file, not just a single filename-derived one.
 * Bug 1b — cost_element comes from Account NAME (not Account ID), and Amount is
 *          read from the end of each row so comma-shifted ("ragged") rows parse.
 * Bug 2  — parseProjectActualsTargets parses L2/L1 ACTUAL & TARGET company P&L
 *          files (sheet DataSetLandTbl) and routes ACTUAL -> l1_actual (actual)
 *          / TARGET -> l1_target (plan) so KPI/trend variance columns populate;
 *          classifyFinancialDoc routes these files correctly and away from the
 *          generic P&L and 29-column project-revenue parsers.
 *
 * Fixtures are trimmed slices of the REAL vault files, rendered in the exact
 * comma-delimited "[Sheet: X]" format the RAG parseXlsx produces. The paired
 * expected.json files were computed by an INDEPENDENT oracle (see the fixture
 * generator), so these tests check the parser against ground truth, not itself.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseYtdGlDetail,
  parseProjectActualsTargets,
} from '../../src/services/financials/deterministic-parsers.js';
import { classifyFinancialDoc } from '../../src/services/financials/reingest-doc.js';
import { primaryTypeOf, handlerMatched } from '../../src/services/financials/coverage.js';

const FIX = join(__dirname, '../fixtures/financials');
const ET = join(FIX, 'extracted_text');
const readFix = (name: string): string => readFileSync(join(ET, name), 'utf-8');
const readExpected = (name: string): any => JSON.parse(readFileSync(join(FIX, name), 'utf-8'));

describe('parseYtdGlDetail — multi-period YTD (Bug 1 / 1b)', () => {
  const text = readFix('gl-detail-ytd-may-2026.extracted.txt');
  const expected = readExpected('gl-detail-ytd-may-2026.expected.json');
  const result = parseYtdGlDetail(text, expected.source_filename);

  it('parses the GL fixture', () => {
    expect(result).not.toBeNull();
    expect(result!.rows.length).toBeGreaterThan(0);
  });

  it('emits rows for ALL five periods present, not just the filename month', () => {
    const periods = Array.from(new Set(result!.rows.map((r) => r.period))).sort();
    expect(periods).toEqual([...expected.periods].sort());
  });

  it('per-period Direct Labor totals match the independent oracle', () => {
    for (const period of expected.periods) {
      const sum = result!.rows
        .filter((r) => r.period === period && /direct labor/i.test(r.cost_element))
        .reduce((a, r) => a + (r.actual_amount ?? 0), 0);
      expect(sum).toBeCloseTo(expected.directLaborActualByPeriod[period], 2);
    }
  });

  it('per-period total actual matches the independent oracle', () => {
    for (const period of expected.periods) {
      const sum = result!.rows
        .filter((r) => r.period === period)
        .reduce((a, r) => a + (r.actual_amount ?? 0), 0);
      expect(sum).toBeCloseTo(expected.totalActualByPeriod[period], 2);
    }
  });

  it('uses Account NAME as cost_element, never a bare Account ID (Bug 1b)', () => {
    // e.g. "Direct Labor OFFSITE", not "500-001".
    const looksLikeId = result!.rows.filter((r) => /^\d{3}-\d{3}$/.test(r.cost_element.trim()));
    expect(looksLikeId).toHaveLength(0);
    expect(result!.rows.some((r) => /direct labor/i.test(r.cost_element))).toBe(true);
  });

  it('tags each period with the correct fiscal_year and quarter', () => {
    for (const r of result!.rows) {
      expect(r.fiscal_year).toBe(2026);
      const monthIdx = ['Jan', 'Feb', 'Mar', 'Apr', 'May'].findIndex((m) => r.period.endsWith(m));
      expect(r.quarter).toBe(Math.ceil((monthIdx + 1) / 3));
    }
  });
});

describe('parseProjectActualsTargets — L2/L1 ACTUAL & TARGET (Bug 2)', () => {
  const expected = readExpected('project-actuals-targets.expected.json');

  for (const key of Object.keys(expected)) {
    const exp = expected[key];
    it(`parses ${exp.source_filename} into one ${exp.kind}/${exp.source} company row`, () => {
      const text = readFix(exp.file);
      const result = parseProjectActualsTargets(text, exp.source_filename);
      expect(result).not.toBeNull();
      expect(result!.rows).toHaveLength(1);
      const row = result!.rows[0];
      expect(row.kind).toBe(exp.kind);
      expect(row.source).toBe(exp.source);
      expect(row.sales).toBeCloseTo(exp.sales_revenue, 2);
      expect(row.ebit).toBeCloseTo(exp.ebit_profit, 2);
    });
  }

  it('populates variance: ACTUAL and TARGET land on distinct series for the same month', () => {
    const actual = parseProjectActualsTargets(
      readFix('l2-actual-jan-2026.extracted.txt'),
      'L2 - ACTUAL - JAN-2026.xlsx',
    );
    const target = parseProjectActualsTargets(
      readFix('l2-target-jan-2026.extracted.txt'),
      'L2 - TARGET - JAN-2026.xlsx',
    );
    expect(actual!.rows[0].source).toBe('l1_actual');
    expect(actual!.rows[0].kind).toBe('actual');
    expect(target!.rows[0].source).toBe('l1_target');
    expect(target!.rows[0].kind).toBe('plan');
    expect(actual!.rows[0].period).toBe(target!.rows[0].period);
    // Different figures => a non-zero variance will render.
    expect(actual!.rows[0].sales).not.toBeCloseTo(target!.rows[0].sales!, 0);
  });
});

describe('classifyFinancialDoc — routing (Bug 2 / Bug 3)', () => {
  const l2 = readFix('l2-actual-jan-2026.extracted.txt');
  const l1 = readFix('l1-actual-mar-2026.extracted.txt');
  const gl = readFix('gl-detail-ytd-may-2026.extracted.txt');

  it('routes "L2 - ACTUAL" to project_actuals_targets, not project_revenue or generic P&L', () => {
    const cls = classifyFinancialDoc('L2 - ACTUAL - JAN-2026.xlsx', l2);
    expect(cls.is_project_actuals_targets).toBe(true);
    expect(cls.is_project_revenue).toBe(false);
    expect(cls.is_financial).toBe(false);
    expect(primaryTypeOf(cls)).toBe('project_actuals_targets');
    expect(handlerMatched(cls)).toBe(true);
  });

  it('routes "L2 - TARGET" to project_actuals_targets', () => {
    const cls = classifyFinancialDoc('L2 - TARGET - MAY-2026.xlsx', l2);
    expect(cls.is_project_actuals_targets).toBe(true);
    expect(cls.is_project_revenue).toBe(false);
  });

  it('routes "L1-ACTUAL Proj Revenue Summary" to project_actuals_targets (7-col), NOT project_revenue', () => {
    const cls = classifyFinancialDoc('L1-ACTUAL Proj Revenue Summary MAR-26.xlsx', l1);
    expect(cls.is_project_actuals_targets).toBe(true);
    expect(cls.is_project_revenue).toBe(false);
    expect(cls.is_financial).toBe(false);
  });

  it('still routes a plain "Full Proj Revenue Summary" to project_revenue', () => {
    const cls = classifyFinancialDoc('Full Proj Revenue Summary.xlsx', '');
    expect(cls.is_project_actuals_targets).toBe(false);
    expect(cls.is_project_revenue).toBe(true);
  });

  it('still routes a GL Detail file to cost_detail', () => {
    const cls = classifyFinancialDoc('YTD MAY-2026 GL Detail.xlsx', gl);
    expect(cls.is_cost_detail).toBe(true);
    expect(cls.is_project_actuals_targets).toBe(false);
  });

  it('gives an unknown file an explicit no_handler verdict (Bug 3)', () => {
    const cls = classifyFinancialDoc('random-notes.txt', 'hello world');
    expect(handlerMatched(cls)).toBe(false);
    expect(primaryTypeOf(cls)).toBeNull();
  });
});
