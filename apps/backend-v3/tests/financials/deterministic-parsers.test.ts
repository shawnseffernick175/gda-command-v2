/**
 * Regression tests for the 4 deterministic financial parsers using REAL .xlsx fixtures.
 * F-627: ensures each parser returns ≥1 row with correct key fields from actual vault files.
 * F-629: adds Jan fixtures (sheet=JAN-2026) to verify content-based sheet selection.
 * F-632: adds extracted_text tests (pipe-delimited production format).
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
  // May fixtures (sheet names: DataSetLandTbl / Page1)
  let arTextMay: string;
  let tbTextMay: string;
  let sieTextMay: string;
  let prTextMay: string;
  // Jan fixtures (sheet names: JAN-2026 / Page1)
  let arTextJan: string;
  let tbTextJan: string;
  let sieTextJan: string;
  let prTextJan: string;

  beforeAll(async () => {
    [arTextMay, tbTextMay, sieTextMay, prTextMay, arTextJan, tbTextJan, sieTextJan, prTextJan] =
      await Promise.all([
        extractXlsxText(join(FIXTURES, 'aged-ar-may-2026.xlsx')),
        extractXlsxText(join(FIXTURES, 'trial-balance-may-2026.xlsx')),
        extractXlsxText(join(FIXTURES, 'trend-sie-may-2026.xlsx')),
        extractXlsxText(join(FIXTURES, 'proj-revenue-summary-may-2026.xlsx')),
        extractXlsxText(join(FIXTURES, 'aged-ar-jan-2026.xlsx')),
        extractXlsxText(join(FIXTURES, 'trial-balance-jan-2026.xlsx')),
        extractXlsxText(join(FIXTURES, 'trend-sie-jan-2026.xlsx')),
        extractXlsxText(join(FIXTURES, 'proj-revenue-summary-jan-2026.xlsx')),
      ]);
  });

  describe('parseAgedAr', () => {
    it('returns ≥1 row from the May fixture (sheet=DataSetLandTbl)', () => {
      const result = parseAgedAr(arTextMay, 'aged-ar-may-2026.xlsx');
      expect(result).not.toBeNull();
      expect(result!.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('returns ≥1 row from the Jan fixture (sheet=JAN-2026)', () => {
      const result = parseAgedAr(arTextJan, 'aged-ar-jan-2026.xlsx');
      expect(result).not.toBeNull();
      expect(result!.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('correctly extracts customer_name from Customer Account group headers', () => {
      const result = parseAgedAr(arTextMay, 'aged-ar-may-2026.xlsx')!;
      const customers = [...new Set(result.rows.map((r) => r.customer_name))];
      expect(customers.length).toBeGreaterThan(1);
      expect(customers.some((c) => /army|booz|caci|gsa|nakupuna/i.test(c))).toBe(true);
    });

    it('populates key fields correctly (May)', () => {
      const result = parseAgedAr(arTextMay, 'aged-ar-may-2026.xlsx')!;
      const row = result.rows[0];
      expect(row.period).toBe('FY26 May');
      expect(row.fiscal_year).toBe(2026);
      expect(row.quarter).toBe(2);
      expect(row.invoice_number).toBeTruthy();
      expect(row.amount).not.toBe(0);
      expect(['Current', '31-60', '61-90', 'Over 90']).toContain(row.age_bucket);
    });

    it('populates key fields correctly (Jan)', () => {
      const result = parseAgedAr(arTextJan, 'aged-ar-jan-2026.xlsx')!;
      const row = result.rows[0];
      expect(row.period).toBe('FY26 Jan');
      expect(row.fiscal_year).toBe(2026);
      expect(row.quarter).toBe(1);
      expect(row.amount).not.toBe(0);
      expect(['Current', '31-60', '61-90', 'Over 90']).toContain(row.age_bucket);
    });

    it('parses due_date in ISO format', () => {
      const result = parseAgedAr(arTextMay, 'aged-ar-may-2026.xlsx')!;
      const withDate = result.rows.find((r) => r.due_date);
      expect(withDate).toBeTruthy();
      expect(withDate!.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('parseTrialBalance', () => {
    it('returns ≥1 row from the May fixture (sheet=DataSetLandTbl)', () => {
      const result = parseTrialBalance(tbTextMay, 'trial-balance-may-2026.xlsx');
      expect(result).not.toBeNull();
      expect(result!.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('returns ≥1 row from the Jan fixture (sheet=JAN-2026)', () => {
      const result = parseTrialBalance(tbTextJan, 'trial-balance-jan-2026.xlsx');
      expect(result).not.toBeNull();
      expect(result!.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('returns a large number of GL accounts (~150+) from May', () => {
      const result = parseTrialBalance(tbTextMay, 'trial-balance-may-2026.xlsx')!;
      expect(result.rows.length).toBeGreaterThanOrEqual(100);
    });

    it('returns a large number of GL accounts (~150+) from Jan', () => {
      const result = parseTrialBalance(tbTextJan, 'trial-balance-jan-2026.xlsx')!;
      expect(result.rows.length).toBeGreaterThanOrEqual(100);
    });

    it('populates key fields correctly (May)', () => {
      const result = parseTrialBalance(tbTextMay, 'trial-balance-may-2026.xlsx')!;
      const row = result.rows[0];
      expect(row.period).toBe('FY26 May');
      expect(row.fiscal_year).toBe(2026);
      expect(row.quarter).toBe(2);
      expect(row.account_code).toMatch(/^\d{3}-\d{3}$/);
      expect(row.account_name).toBeTruthy();
      expect(typeof row.debit).toBe('number');
      expect(typeof row.credit).toBe('number');
    });

    it('populates key fields correctly (Jan)', () => {
      const result = parseTrialBalance(tbTextJan, 'trial-balance-jan-2026.xlsx')!;
      const row = result.rows[0];
      expect(row.period).toBe('FY26 Jan');
      expect(row.fiscal_year).toBe(2026);
      expect(row.quarter).toBe(1);
      expect(row.account_code).toMatch(/^\d{3}-\d{3}$/);
      expect(row.account_name).toBeTruthy();
    });
  });

  describe('parseTrendSie', () => {
    it('returns ≥1 row from the May fixture', () => {
      const result = parseTrendSie(sieTextMay, 'trend-sie-may-2026.xlsx');
      expect(result).not.toBeNull();
      expect(result!.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('returns ≥1 row from the Jan fixture', () => {
      const result = parseTrendSie(sieTextJan, 'trend-sie-jan-2026.xlsx');
      expect(result).not.toBeNull();
      expect(result!.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('extracts all 5 known cost pools (May)', () => {
      const result = parseTrendSie(sieTextMay, 'trend-sie-may-2026.xlsx')!;
      expect(result.rows.length).toBe(5);
      const pools = result.rows.map((r) => r.pool);
      expect(pools).toContain('Fringe');
      expect(pools).toContain('OH Offsite');
      expect(pools).toContain('OH Onsite');
      expect(pools).toContain('MHx');
      expect(pools).toContain('G&A');
    });

    it('extracts all 5 known cost pools (Jan)', () => {
      const result = parseTrendSie(sieTextJan, 'trend-sie-jan-2026.xlsx')!;
      expect(result.rows.length).toBe(5);
      const pools = result.rows.map((r) => r.pool);
      expect(pools).toContain('Fringe');
      expect(pools).toContain('OH Offsite');
      expect(pools).toContain('OH Onsite');
      expect(pools).toContain('MHx');
      expect(pools).toContain('G&A');
    });

    it('populates key fields correctly with the May rate', () => {
      const result = parseTrendSie(sieTextMay, 'trend-sie-may-2026.xlsx')!;
      const fringe = result.rows.find((r) => r.pool === 'Fringe')!;
      expect(fringe.period).toBe('FY26 May');
      expect(fringe.fiscal_year).toBe(2026);
      expect(fringe.quarter).toBe(2);
      expect(fringe.account_code).toBe('100');
      expect(fringe.current_period_actual).toBeGreaterThan(0);
    });

    it('populates key fields correctly with the Jan rate', () => {
      const result = parseTrendSie(sieTextJan, 'trend-sie-jan-2026.xlsx')!;
      const fringe = result.rows.find((r) => r.pool === 'Fringe')!;
      expect(fringe.period).toBe('FY26 Jan');
      expect(fringe.fiscal_year).toBe(2026);
      expect(fringe.quarter).toBe(1);
      expect(fringe.account_code).toBe('100');
      expect(fringe.current_period_actual).toBeGreaterThan(0);
    });

    it('uses positional month column for correct rate extraction (May)', () => {
      const result = parseTrendSie(sieTextMay, 'trend-sie-may-2026.xlsx')!;
      const fringe = result.rows.find((r) => r.pool === 'Fringe')!;
      // May is column index 6 (2+4); Fringe ACT MAY-2026 rate = 0.45054537
      expect(fringe.current_period_actual).toBeCloseTo(0.45054537, 5);
    });

    it('uses positional month column for correct rate extraction (Jan)', () => {
      const result = parseTrendSie(sieTextJan, 'trend-sie-jan-2026.xlsx')!;
      const fringe = result.rows.find((r) => r.pool === 'Fringe')!;
      // Jan is column index 2 (2+0); Fringe ACT JAN-2026 rate = 0.47933993
      expect(fringe.current_period_actual).toBeCloseTo(0.47933993, 5);
    });
  });

  describe('parseProjectRevenueSummary', () => {
    it('returns ≥1 row from the May fixture (sheet=Page1)', () => {
      const result = parseProjectRevenueSummary(prTextMay, 'proj-revenue-summary-may-2026.xlsx');
      expect(result).not.toBeNull();
      expect(result!.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('returns ≥1 row from the Jan fixture (sheet=JAN-2026)', () => {
      const result = parseProjectRevenueSummary(prTextJan, 'proj-revenue-summary-jan-2026.xlsx');
      expect(result).not.toBeNull();
      expect(result!.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('returns many project rows (100+) from May', () => {
      const result = parseProjectRevenueSummary(prTextMay, 'proj-revenue-summary-may-2026.xlsx')!;
      expect(result.rows.length).toBeGreaterThanOrEqual(100);
    });

    it('returns many project rows (100+) from Jan', () => {
      const result = parseProjectRevenueSummary(prTextJan, 'proj-revenue-summary-jan-2026.xlsx')!;
      expect(result.rows.length).toBeGreaterThanOrEqual(100);
    });

    it('populates key fields correctly (May)', () => {
      const result = parseProjectRevenueSummary(prTextMay, 'proj-revenue-summary-may-2026.xlsx')!;
      const row = result.rows[0];
      expect(row.period).toBe('FY26 May');
      expect(row.fiscal_year).toBe(2026);
      expect(row.quarter).toBe(2);
      expect(row.project_name).toBeTruthy();
      expect(row.contract_number).toBeTruthy();
      expect(typeof row.revenue).toBe('number');
      expect(typeof row.cost).toBe('number');
    });

    it('populates key fields correctly (Jan)', () => {
      const result = parseProjectRevenueSummary(prTextJan, 'proj-revenue-summary-jan-2026.xlsx')!;
      const row = result.rows[0];
      expect(row.period).toBe('FY26 Jan');
      expect(row.fiscal_year).toBe(2026);
      expect(row.quarter).toBe(1);
      expect(row.project_name).toBeTruthy();
      expect(row.contract_number).toBeTruthy();
    });

    it('correctly extracts known projects', () => {
      const result = parseProjectRevenueSummary(prTextMay, 'proj-revenue-summary-may-2026.xlsx')!;
      const projectNames = result.rows.map((r) => r.project_name);
      expect(projectNames).toContain('OY4');
    });
  });
});

// ---------------------------------------------------------------------------
// F-632: extracted_text (pipe-delimited) fixtures — the production format
// ---------------------------------------------------------------------------
const EXTRACTED_TEXT_DIR = join(FIXTURES, 'extracted_text');

describe('deterministic-parsers (extracted_text pipe-delimited format)', () => {
  let arText: string;
  let tbText: string;
  let sieText: string;
  let prText: string;

  beforeAll(() => {
    arText = readFileSync(join(EXTRACTED_TEXT_DIR, 'aged-ar-may-2026.extracted.txt'), 'utf-8');
    tbText = readFileSync(join(EXTRACTED_TEXT_DIR, 'trial-balance-may-2026.extracted.txt'), 'utf-8');
    sieText = readFileSync(join(EXTRACTED_TEXT_DIR, 'trend-sie-may-2026.extracted.txt'), 'utf-8');
    prText = readFileSync(join(EXTRACTED_TEXT_DIR, 'proj-revenue-may-2026.extracted.txt'), 'utf-8');
  });

  describe('parseAgedAr (extracted_text)', () => {
    it('returns ≥1 row from extracted_text fixture', () => {
      const result = parseAgedAr(arText, 'aged-ar-may-2026.extracted.txt');
      expect(result).not.toBeNull();
      expect(result!.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('correctly carries down customer name from group headers', () => {
      const result = parseAgedAr(arText, 'aged-ar-may-2026.extracted.txt')!;
      const customers = [...new Set(result.rows.map((r) => r.customer_name))];
      expect(customers.length).toBeGreaterThan(1);
      expect(customers.some((c) => /army|booz|caci|gsa|nakupuna/i.test(c))).toBe(true);
    });

    it('skips subtotal and total rows', () => {
      const result = parseAgedAr(arText, 'aged-ar-may-2026.extracted.txt')!;
      for (const row of result.rows) {
        expect(row.invoice_number).not.toMatch(/^Total/i);
      }
    });

    it('populates key fields correctly', () => {
      const result = parseAgedAr(arText, 'aged-ar-may-2026.extracted.txt')!;
      const row = result.rows[0];
      expect(row.period).toBe('FY26 May');
      expect(row.fiscal_year).toBe(2026);
      expect(row.invoice_number).toBeTruthy();
      expect(row.amount).not.toBe(0);
      expect(['Current', '31-60', '61-90', 'Over 90']).toContain(row.age_bucket);
    });
  });

  describe('parseTrialBalance (extracted_text)', () => {
    it('returns ≥1 row from extracted_text fixture', () => {
      const result = parseTrialBalance(tbText, 'trial-balance-may-2026.extracted.txt');
      expect(result).not.toBeNull();
      expect(result!.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('handles wrapped headers (Prior Period(s) / YTD Activity split across 2 lines)', () => {
      const result = parseTrialBalance(tbText, 'trial-balance-may-2026.extracted.txt')!;
      expect(result.rows.length).toBeGreaterThanOrEqual(100);
    });

    it('populates key fields correctly', () => {
      const result = parseTrialBalance(tbText, 'trial-balance-may-2026.extracted.txt')!;
      const row = result.rows[0];
      expect(row.period).toBe('FY26 May');
      expect(row.fiscal_year).toBe(2026);
      expect(row.account_code).toMatch(/^\d{3}-\d{3}$/);
      expect(row.account_name).toBeTruthy();
      expect(typeof row.debit).toBe('number');
      expect(typeof row.credit).toBe('number');
    });
  });

  describe('parseTrendSie (extracted_text)', () => {
    it('returns ≥1 row from extracted_text fixture', () => {
      const result = parseTrendSie(sieText, 'trend-sie-may-2026.extracted.txt');
      expect(result).not.toBeNull();
      expect(result!.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('extracts all 5 cost pools', () => {
      const result = parseTrendSie(sieText, 'trend-sie-may-2026.extracted.txt')!;
      expect(result.rows.length).toBe(5);
      const pools = result.rows.map((r) => r.pool);
      expect(pools).toContain('Fringe');
      expect(pools).toContain('OH Offsite');
      expect(pools).toContain('OH Onsite');
      expect(pools).toContain('MHx');
      expect(pools).toContain('G&A');
    });

    it('correctly extracts the May rate by name-based column matching', () => {
      const result = parseTrendSie(sieText, 'trend-sie-may-2026.extracted.txt')!;
      const fringe = result.rows.find((r) => r.pool === 'Fringe')!;
      expect(fringe.current_period_actual).toBeCloseTo(0.45054537, 5);
    });

    it('stops at POOL DETAIL section', () => {
      const result = parseTrendSie(sieText, 'trend-sie-may-2026.extracted.txt')!;
      expect(result.rows.length).toBe(5);
    });
  });

  describe('parseProjectRevenueSummary (extracted_text)', () => {
    it('returns ≥1 row from extracted_text fixture', () => {
      const result = parseProjectRevenueSummary(prText, 'proj-revenue-may-2026.extracted.txt');
      expect(result).not.toBeNull();
      expect(result!.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('handles empty spacer columns and maps by header name', () => {
      const result = parseProjectRevenueSummary(prText, 'proj-revenue-may-2026.extracted.txt')!;
      expect(result.rows.length).toBeGreaterThanOrEqual(50);
    });

    it('populates key fields correctly', () => {
      const result = parseProjectRevenueSummary(prText, 'proj-revenue-may-2026.extracted.txt')!;
      const row = result.rows[0];
      expect(row.period).toBe('FY26 May');
      expect(row.fiscal_year).toBe(2026);
      expect(row.project_name).toBeTruthy();
      expect(row.contract_number).toBeTruthy();
      expect(typeof row.revenue).toBe('number');
      expect(typeof row.cost).toBe('number');
    });

    it('correctly extracts known projects', () => {
      const result = parseProjectRevenueSummary(prText, 'proj-revenue-may-2026.extracted.txt')!;
      const projectNames = result.rows.map((r) => r.project_name);
      expect(projectNames).toContain('OY4');
    });
  });
});
