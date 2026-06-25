/**
 * Routing / doc-type classification tests for reingest-doc.ts.
 *
 * WHY THIS EXISTS: the deterministic parsers (deterministic-parsers.test.ts) all
 * passed in CI, yet the live financial tables (ar_actuals, trial_balance,
 * indirect_expense_actuals, project_revenue_actuals) stayed at 0 rows. The gap
 * was the ROUTER: it misclassified docs and either skipped the correct parser or
 * also ran financial_statement_extract on a non-P&L doc (which rejected every row
 * as "implausible"). These tests assert the CORRECT type is detected per fixture
 * AND that none of the specialized docs are routed to financial_statement_extract,
 * then confirm the routed deterministic parser yields >= 1 row.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyFinancialDoc } from '../../src/services/financials/reingest-doc.js';
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
      const values = (row.values as unknown[]).slice(1).map((v) => (v != null ? String(v) : ''));
      rows.push(values.join(','));
    });
    if (rows.length > 0) texts.push(`[Sheet: ${sheet.name}]\n${rows.join('\n')}`);
  });
  return texts.join('\n\n');
}

describe('classifyFinancialDoc — routing per fixture type', () => {
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

  describe('Project Revenue Summary', () => {
    it('detects is_project_revenue and does NOT route to financial_statement_extract', () => {
      const cls = classifyFinancialDoc('Full Proj Revenue Summary MAY-2026.xlsx', prText);
      expect(cls.is_project_revenue).toBe(true);
      // Core regression: the proj-revenue file used to also match the P&L gate
      // (filename contains "proj"/"revenue") and got rejected as implausible.
      expect(cls.is_financial).toBe(false);
    });

    it('detects via header signature even when the filename carries no keyword', () => {
      const cls = classifyFinancialDoc('export-2026-05.xlsx', prText);
      expect(cls.is_project_revenue).toBe(true);
      expect(cls.is_financial).toBe(false);
    });

    it('routes to a parser that yields >= 1 row', () => {
      const cls = classifyFinancialDoc('Full Proj Revenue Summary MAY-2026.xlsx', prText);
      expect(cls.is_project_revenue).toBe(true);
      const out = parseProjectRevenueSummary(prText, 'Full Proj Revenue Summary MAY-2026.xlsx');
      expect(out).not.toBeNull();
      expect(out!.rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Aged AR', () => {
    it('detects is_ar and does NOT route to financial_statement_extract', () => {
      const cls = classifyFinancialDoc('Aged AR MAY-2026.xlsx', arText);
      expect(cls.is_ar).toBe(true);
      expect(cls.is_financial).toBe(false);
    });

    it('detects via header signature even when the filename carries no keyword', () => {
      const cls = classifyFinancialDoc('export-2026-05.xlsx', arText);
      expect(cls.is_ar).toBe(true);
      expect(cls.is_financial).toBe(false);
    });

    it('routes to a parser that yields >= 1 row', () => {
      const out = parseAgedAr(arText, 'Aged AR MAY-2026.xlsx');
      expect(out).not.toBeNull();
      expect(out!.rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Trial Balance', () => {
    it('detects is_trial_balance and does NOT route to financial_statement_extract', () => {
      const cls = classifyFinancialDoc('Trail Balance MAY-2026.xlsx', tbText);
      expect(cls.is_trial_balance).toBe(true);
      // "balance" matches the P&L keyword set, so this also guards the suppression.
      expect(cls.is_financial).toBe(false);
    });

    it('detects via header signature even when the filename carries no keyword', () => {
      const cls = classifyFinancialDoc('export-2026-05.xlsx', tbText);
      expect(cls.is_trial_balance).toBe(true);
      expect(cls.is_financial).toBe(false);
    });

    it('routes to a parser that yields >= 1 row', () => {
      const out = parseTrialBalance(tbText, 'Trail Balance MAY-2026.xlsx');
      expect(out).not.toBeNull();
      expect(out!.rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Trend SIE', () => {
    it('detects is_sie and does NOT route to financial_statement_extract', () => {
      const cls = classifyFinancialDoc('Trend SIE MAY-2026.xlsx', sieText);
      expect(cls.is_sie).toBe(true);
      expect(cls.is_financial).toBe(false);
    });

    it('detects via header signature even when the filename carries no keyword', () => {
      const cls = classifyFinancialDoc('export-2026-05.xlsx', sieText);
      expect(cls.is_sie).toBe(true);
      expect(cls.is_financial).toBe(false);
    });

    it('routes to a parser that yields >= 1 row', () => {
      const out = parseTrendSie(sieText, 'Trend SIE MAY-2026.xlsx');
      expect(out).not.toBeNull();
      expect(out!.rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('genuine P&L docs still route to financial_statement_extract', () => {
    it('an income-statement file with no specialized signature is is_financial', () => {
      const cls = classifyFinancialDoc('Income Statement MAY-2026.xlsx', '[Sheet: Page1]\nLine Item,Actual,Budget\nRevenue,100,90\n');
      expect(cls.is_financial).toBe(true);
      expect(cls.is_project_revenue).toBe(false);
      expect(cls.is_ar).toBe(false);
      expect(cls.is_trial_balance).toBe(false);
      expect(cls.is_sie).toBe(false);
    });

    it('docType=financial forces is_financial when nothing else matches', () => {
      const cls = classifyFinancialDoc('untitled.xlsx', '[Sheet: Page1]\nfoo,bar\n1,2\n', 'financial');
      expect(cls.is_financial).toBe(true);
    });
  });
});
