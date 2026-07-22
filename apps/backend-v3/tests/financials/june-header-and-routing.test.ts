/**
 * Regression tests for #1142 June upload fixes (reingest side).
 *
 * BUG C: ExcelJS renders a carriage return inside a header cell as the literal
 * "_x000D_" (and sometimes a raw \r). The old normalizer dropped it to an EMPTY
 * string, so "Vendor_x000D_Name" became "vendorname" and header lookups missed,
 * yielding 0 rows. cleanHeaderText now replaces it with a SPACE.
 *
 * BUG B (reingest routing): every June Financial-Bible file must map to a parser
 * branch in classifyFinancialDoc so coverage returns an explicit verdict, never
 * a silent no_handler.
 */
import { describe, it, expect } from 'vitest';
import { cleanHeaderText } from '../../src/services/financials/deterministic-parsers.js';
import {
  classifyFinancialDoc,
  type FinancialDocClassification,
} from '../../src/services/financials/reingest-doc.js';

describe('cleanHeaderText — _x000D_ / carriage-return cleanup (Bug C)', () => {
  it('replaces _x000D_ with a space, not an empty string', () => {
    expect(cleanHeaderText('Vendor_x000D_Name')).toBe('Vendor Name');
  });
  it('is case-insensitive on the marker', () => {
    expect(cleanHeaderText('Ending_x000d_Balance')).toBe('Ending Balance');
  });
  it('strips raw carriage returns and collapses whitespace', () => {
    expect(cleanHeaderText('Prior Period(s)\r\n  YTD  Activity')).toBe('Prior Period(s) YTD Activity');
  });
  it('trims and leaves clean headers untouched', () => {
    expect(cleanHeaderText('  Amount  ')).toBe('Amount');
  });
});

describe('classifyFinancialDoc — every June Bible file hits a parser branch (Bug B)', () => {
  const anyHandler = (c: FinancialDocClassification): boolean =>
    c.is_financial || c.is_balance_sheet || c.is_cost_detail || c.is_sie ||
    c.is_ap || c.is_ar || c.is_trial_balance || c.is_project_revenue ||
    c.is_project_actuals_targets;

  const cases: Array<[string, keyof FinancialDocClassification]> = [
    ['YTD GL Detail JUN-26.xlsx', 'is_cost_detail'],
    ['Trended Income Statement JUN-26.xlsx', 'is_financial'],
    ['Revenue Summary by Cost Pool JUN-26.xlsx', 'is_project_revenue'],
    ['Trial Balance JUN-26.xlsx', 'is_trial_balance'],
    ['Trend SIE JUN-26.xlsx', 'is_sie'],
    ['Balance Sheet JUN-26.pdf', 'is_balance_sheet'],
  ];

  for (const [filename, expectedFlag] of cases) {
    it(`${filename} -> ${String(expectedFlag)} (handler matched)`, () => {
      const cls = classifyFinancialDoc(filename, '', 'financial');
      expect(cls[expectedFlag]).toBe(true);
      expect(anyHandler(cls)).toBe(true);
    });
  }

  it('Trended Income Statement is P&L, not a specialized type', () => {
    const cls = classifyFinancialDoc('Trended Income Statement JUN-26.xlsx', '', 'financial');
    expect(cls.is_financial).toBe(true);
    expect(cls.is_project_revenue).toBe(false);
    expect(cls.is_cost_detail).toBe(false);
  });
});
