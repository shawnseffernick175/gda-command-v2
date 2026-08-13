/**
 * Regression tests for Labor Distribution (payroll's monthly Wages book).
 *
 * parseWageDistribution — one row per employee per fiscal period, carrying the
 *   book's own pool columns (Direct-CO/CL, Fringe, IND-OH/MHx/G&A, V-H-P-S,
 *   UCOT, UNALLOW-or-UNBILL, Total Wages). It must: key rows by (FY, PD,
 *   employee ID), read the money columns from the END of each row so the
 *   comma-split "Last, First" name does not shift them, keep UCOT's credit
 *   NEGATIVE, and DROP the workbook's "Overall - Total" footer so the totals
 *   the tab sums are never double-counted.
 *
 * classifyFinancialDoc — a Wages book must route to is_wage_distribution and
 *   NOT be fed to the generic financial-statement (P&L) parser.
 *
 * The fixture is the real JUL-26 Wages workbook run through the same
 * exceljs extraction the vault uses, so these assert against payroll's own
 * numbers rather than the parser against itself.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWageDistribution } from '../../src/services/financials/deterministic-parsers.js';
import { classifyFinancialDoc } from '../../src/services/financials/reingest-doc.js';

const ET = join(__dirname, '../fixtures/financials/extracted_text');
const wagesText = readFileSync(join(ET, 'wages-jul-2026.extracted.txt'), 'utf8');
const FILENAME = 'JUL-26 Wages.xlsx';

// Totals as stated on the workbook's own "Overall - Total" footer row.
const STATED = {
  direct_co: 77317.66,
  direct_cl: 694479.82,
  fringe_excl_vhps: 0,
  ind_oh: 39034.25,
  ind_mhx: 19166.48,
  ind_ga: 111484.86,
  vhps: 182507.82,
  ucot: -67196.82,
  unallow_unbill: 164.2,
  total_wages: 1056958.27,
} as const;

describe('parseWageDistribution (monthly Wages book — labor by cost pool)', () => {
  const out = parseWageDistribution(wagesText, FILENAME);

  it('recognizes the FY/PD/ID/Name + Total Wages grid', () => {
    expect(out).not.toBeNull();
    expect(out!.is_wage_distribution).toBe(true);
    expect(out!.model_used).toBe('deterministic');
  });

  it('emits one row per employee (90) and no "Overall - Total" footer row', () => {
    expect(out!.rows.length).toBe(90);
    // The footer carries the book's grand total; if it leaked in as a row the
    // summed total would be exactly double the stated total.
    const sum = out!.rows.reduce((s, r) => s + r.total_wages, 0);
    expect(Math.round(sum * 100) / 100).toBe(STATED.total_wages);
  });

  it('stamps every row with the period stated in the book (FY2026 PD7)', () => {
    for (const r of out!.rows) {
      expect(r.fiscal_year).toBe(2026);
      expect(r.month_num).toBe(7);
      expect(r.quarter).toBe(3);
      // Same "FY26 Jul" period vocabulary the rest of the Bible speaks.
      expect(r.period).toBe('FY26 Jul');
    }
  });

  it('sums each pool column to the total stated by payroll', () => {
    for (const [key, expected] of Object.entries(STATED)) {
      const field = key as keyof typeof STATED;
      const sum = out!.rows.reduce((s, r) => s + r[field], 0);
      expect(Math.round(sum * 100) / 100, `column ${field}`).toBe(expected);
    }
  });

  it('reads the pool columns from the row END, so the comma-split name never shifts them', () => {
    // "2026,7,000061,Desruisseaux, Cheryl,3882.35,0,..." — the name spans two
    // comma-separated cells, so a left-anchored column index would be off by one.
    const r = out!.rows.find((x) => x.employee_id === '000061');
    expect(r).toBeDefined();
    expect(r!.employee_name).toBe('Desruisseaux, Cheryl');
    expect(r!.direct_co).toBe(3882.35);
    expect(r!.direct_cl).toBe(0);
    expect(r!.ind_mhx).toBe(4657.35);
    expect(r!.ind_ga).toBe(3970.2);
    expect(r!.vhps).toBe(1374.3);
    expect(r!.unallow_unbill).toBe(164.2);
    expect(r!.total_wages).toBe(13234);
  });

  it('keeps UCOT signed as the book states it (credits negative, corrections positive)', () => {
    expect(out!.rows.find((x) => x.employee_id === '000061')!.ucot).toBe(-814.4);
    // Nearly every UCOT figure is a negative credit, but the book also carries
    // positive reversals — neither sign may be normalized away.
    expect(out!.rows.some((x) => x.ucot < 0)).toBe(true);
    expect(out!.rows.some((x) => x.ucot > 0)).toBe(true);
  });

  it('preserves an employee whose wages sit entirely in one indirect pool', () => {
    const r = out!.rows.find((x) => x.employee_id === '000445');
    expect(r!.employee_name).toBe('Jones, Joyce');
    expect(r!.ind_oh).toBe(1661.4);
    expect(r!.total_wages).toBe(1661.4);
    expect(r!.ucot).toBe(0);
  });

  it('keys by (FY, PD, employee) so a re-extracted book cannot duplicate an employee', () => {
    const keys = out!.rows.map((r) => `${r.fiscal_year}|${r.month_num}|${r.employee_id}`);
    expect(new Set(keys).size).toBe(keys.length);
    // Parsing the same text twice yields the same row count (no accumulation).
    expect(parseWageDistribution(wagesText, FILENAME)!.rows.length).toBe(out!.rows.length);
  });

  it('returns null for a book that has no FY/PD wage grid', () => {
    expect(parseWageDistribution('[Sheet: Sheet1]\nfoo,bar\n1,2', 'Something Else.xlsx')).toBeNull();
  });
});

/**
 * The FY26 books are a monthly series, and the earlier ones differ from JUL in
 * two ways that must not matter: the sheet is named "Page1" rather than
 * "Period N", and APR states one employee TWICE (a mid-period name change).
 */
describe('parseWageDistribution (APR-26 — "Page1" sheet, duplicated employee)', () => {
  const aprText = readFileSync(join(ET, 'wages-apr-2026.extracted.txt'), 'utf8');
  const out = parseWageDistribution(aprText, 'APR-26 Wages.xlsx');

  it('parses the book regardless of the sheet name, taking the period from the rows', () => {
    expect(out).not.toBeNull();
    expect(new Set(out!.rows.map((r) => r.month_num))).toEqual(new Set([4]));
    expect(out!.rows[0].period).toBe('FY26 Apr');
    expect(out!.rows[0].quarter).toBe(2);
  });

  it('accumulates an employee stated twice in one period instead of dropping wages', () => {
    // Payroll pays 000407 as "Huntley, Veronica P" (9,531.25) and "Parker,
    // Veronica P" (1,562.50) in PD4 — the same person, both real.
    const r = out!.rows.filter((x) => x.employee_id === '000407');
    expect(r.length).toBe(1);
    expect(r[0].total_wages).toBe(11093.75);
    expect(r[0].direct_cl).toBe(10718.75);
    expect(r[0].vhps).toBe(375);
  });

  it('still totals to the amount payroll states for the month', () => {
    const sum = out!.rows.reduce((s, r) => s + r.total_wages, 0);
    expect(Math.round(sum * 100) / 100).toBe(700626.81);
  });
});

describe('classifyFinancialDoc (Wages book routing)', () => {
  const head = wagesText.slice(0, 4000);

  it('routes a Wages book to the wage-distribution parser', () => {
    const cls = classifyFinancialDoc(FILENAME, head, 'financial');
    expect(cls.is_wage_distribution).toBe(true);
  });

  it('recognizes the book by its header signature even when the name says nothing', () => {
    const cls = classifyFinancialDoc('Period 7 Export.xlsx', head, 'financial');
    expect(cls.is_wage_distribution).toBe(true);
  });

  it('keeps the generic P&L parser away from it (no phantom income statement)', () => {
    const cls = classifyFinancialDoc(FILENAME, head, 'financial');
    expect(cls.is_financial).toBe(false);
  });

  it('does not claim an unrelated book is a wage distribution', () => {
    const cls = classifyFinancialDoc(
      'Trial Balance MAY-2026.xlsx',
      'Account ID,Account Name,Beginning Balance,Ending Balance',
      'financial',
    );
    expect(cls.is_wage_distribution).toBe(false);
  });
});
