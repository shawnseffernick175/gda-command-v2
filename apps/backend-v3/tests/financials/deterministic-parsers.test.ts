/**
 * Regression tests for the 4 deterministic financial parsers using REAL .xlsx fixtures.
 * F-627: ensures each parser returns ≥1 row with correct key fields from actual vault files.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseAgedAr,
  parseTrialBalance,
  parseTrendSie,
  parseProjectRevenueSummary,
} from '../../src/services/financials/deterministic-parsers.js';

const FIXTURES = join(__dirname, '../fixtures/financials');

/** Extracts text from .xlsx the same way the production parser.ts does. */
async function extractXlsxText(filepath: string): Promise<string> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const buffer = readFileSync(filepath);
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const texts: string[] = [];

  workbook.eachSheet((sheet) => {
    const rows: string[] = [];
    sheet.eachRow((row) => {
      const values = (row.values as unknown[])
        .slice(1)
        .map((v) => (v != null ? String(v) : ''));
      rows.push(values.join(','));
    });
    if (rows.length > 0) {
      texts.push(`[Sheet: ${sheet.name}]\n${rows.join('\n')}`);
    }
  });

  return texts.join('\n\n');
}

describe('deterministic-parsers (real fixture files)', () => {
  let arText: string;
  let tbText: string;
  let sieText: string;
  let prText: string;

  beforeAll(async () => {
    [arText, tbText, sieText, prText] = await Promise.all([
      extractXlsxText(join(FIXTURES, 'aged-ar-may-2026.xlsx')),
      extractXlsxText(join(FIXTURES, 'trial-balance-may-2026.xlsx')),
      extractXlsxText(join(FIXTURES, 'trend-sie-may-2026.xlsx')),
      extractXlsxText(join(FIXTURES, 'proj-revenue-summary-may-2026.xlsx')),
    ]);
  });

  describe('parseAgedAr', () => {
    it('returns ≥1 row from the real Aged AR fixture', () => {
      const result = parseAgedAr(arText, 'aged-ar-may-2026.xlsx');
      expect(result).not.toBeNull();
      expect(result!.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('correctly extracts customer_name from Customer Account group headers', () => {
      const result = parseAgedAr(arText, 'aged-ar-may-2026.xlsx')!;
      const customers = [...new Set(result.rows.map((r) => r.customer_name))];
      expect(customers.length).toBeGreaterThan(1);
      expect(customers.some((c) => /army|booz|caci|gsa|nakupuna/i.test(c))).toBe(true);
    });

    it('populates key fields correctly', () => {
      const result = parseAgedAr(arText, 'aged-ar-may-2026.xlsx')!;
      const row = result.rows[0];
      expect(row.period).toBe('FY26 May');
      expect(row.fiscal_year).toBe(2026);
      expect(row.quarter).toBe(2);
      expect(row.invoice_number).toBeTruthy();
      expect(row.amount).not.toBe(0);
      expect(['Current', '31-60', '61-90', 'Over 90']).toContain(row.age_bucket);
    });

    it('parses due_date in ISO format', () => {
      const result = parseAgedAr(arText, 'aged-ar-may-2026.xlsx')!;
      const withDate = result.rows.find((r) => r.due_date);
      expect(withDate).toBeTruthy();
      expect(withDate!.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('parseTrialBalance', () => {
    it('returns ≥1 row from the real Trial Balance fixture', () => {
      const result = parseTrialBalance(tbText, 'trial-balance-may-2026.xlsx');
      expect(result).not.toBeNull();
      expect(result!.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('returns a large number of GL accounts (~150+)', () => {
      const result = parseTrialBalance(tbText, 'trial-balance-may-2026.xlsx')!;
      expect(result.rows.length).toBeGreaterThanOrEqual(100);
    });

    it('populates key fields correctly', () => {
      const result = parseTrialBalance(tbText, 'trial-balance-may-2026.xlsx')!;
      const row = result.rows[0];
      expect(row.period).toBe('FY26 May');
      expect(row.fiscal_year).toBe(2026);
      expect(row.quarter).toBe(2);
      expect(row.account_code).toMatch(/^\d{3}-\d{3}$/);
      expect(row.account_name).toBeTruthy();
      expect(typeof row.debit).toBe('number');
      expect(typeof row.credit).toBe('number');
    });
  });

  describe('parseTrendSie', () => {
    it('returns ≥1 row from the real Trend SIE fixture', () => {
      const result = parseTrendSie(sieText, 'trend-sie-may-2026.xlsx');
      expect(result).not.toBeNull();
      expect(result!.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('extracts all 5 known cost pools', () => {
      const result = parseTrendSie(sieText, 'trend-sie-may-2026.xlsx')!;
      expect(result.rows.length).toBe(5);
      const pools = result.rows.map((r) => r.pool);
      expect(pools).toContain('Fringe');
      expect(pools).toContain('OH Offsite');
      expect(pools).toContain('OH Onsite');
      expect(pools).toContain('MHx');
      expect(pools).toContain('G&A');
    });

    it('populates key fields correctly with the May rate', () => {
      const result = parseTrendSie(sieText, 'trend-sie-may-2026.xlsx')!;
      const fringe = result.rows.find((r) => r.pool === 'Fringe')!;
      expect(fringe.period).toBe('FY26 May');
      expect(fringe.fiscal_year).toBe(2026);
      expect(fringe.quarter).toBe(2);
      expect(fringe.account_code).toBe('100');
      expect(fringe.current_period_actual).toBeGreaterThan(0);
    });

    it('uses positional month column for correct rate extraction', () => {
      const result = parseTrendSie(sieText, 'trend-sie-may-2026.xlsx')!;
      const fringe = result.rows.find((r) => r.pool === 'Fringe')!;
      // May is column index 6 (2+4); Fringe ACT MAY-2026 rate = 0.45054537
      expect(fringe.current_period_actual).toBeCloseTo(0.45054537, 5);
    });
  });

  describe('parseProjectRevenueSummary', () => {
    it('returns ≥1 row from the real Project Revenue fixture', () => {
      const result = parseProjectRevenueSummary(prText, 'proj-revenue-summary-may-2026.xlsx');
      expect(result).not.toBeNull();
      expect(result!.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('returns many project rows (100+)', () => {
      const result = parseProjectRevenueSummary(prText, 'proj-revenue-summary-may-2026.xlsx')!;
      expect(result.rows.length).toBeGreaterThanOrEqual(100);
    });

    it('populates key fields correctly', () => {
      const result = parseProjectRevenueSummary(prText, 'proj-revenue-summary-may-2026.xlsx')!;
      const row = result.rows[0];
      expect(row.period).toBe('FY26 May');
      expect(row.fiscal_year).toBe(2026);
      expect(row.quarter).toBe(2);
      expect(row.project_name).toBeTruthy();
      expect(row.contract_number).toBeTruthy();
      expect(typeof row.revenue).toBe('number');
      expect(typeof row.cost).toBe('number');
    });

    it('correctly extracts known projects', () => {
      const result = parseProjectRevenueSummary(prText, 'proj-revenue-summary-may-2026.xlsx')!;
      const projectNames = result.rows.map((r) => r.project_name);
      expect(projectNames).toContain('OY4');
    });
  });
});
