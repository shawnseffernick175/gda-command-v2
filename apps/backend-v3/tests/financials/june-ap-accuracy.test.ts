/**
 * F-625 accuracy fixes — June AP parsing, document routing, and the aging-batch
 * plausibility guard.
 *
 * Ground truth (June FY26, cross-checked against the Balance Sheet "Accounts
 * Payable" line and the Open AP report): 79 voucher rows, total $4,894,463.05,
 * split HOLD $4,492,315.29 / PAID $292,448.14 / PPHOLD $109,699.62, including one
 * negative protest-credit voucher (-$88,933). Before the fix the wrapped
 * multi-line header defeated column mapping and the parser produced all-zero
 * garbage ($463 across 72 rows), while the Balance Sheet PDF (which contains an
 * "Accounts Payable" LINE ITEM) was mis-routed into ap_actuals.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseOpenAp } from '../../src/services/financials/deterministic-parsers.js';
import { assessAgingBatch } from '../../src/services/financials/ingest.js';
import { classifyFinancialDoc } from '../../src/services/financials/reingest-doc.js';

const EXTRACTED_TEXT_DIR = join(__dirname, '../fixtures/financials/extracted_text');

describe('parseOpenAp — June Open AP columnar layout (wrapped header)', () => {
  let apText: string;

  beforeAll(() => {
    apText = readFileSync(join(EXTRACTED_TEXT_DIR, 'open-ap-jun-2026.extracted.txt'), 'utf-8');
  });

  it('reconciles to the Balance Sheet AP total of $4,894,463.05 across 79 vouchers', () => {
    const out = parseOpenAp(apText, 'Open AP Report JUN-26.xlsx');
    expect(out).not.toBeNull();
    expect(out!.is_ap).toBe(true);
    expect(out!.rows.length).toBe(79);
    const total = out!.rows.reduce((s, r) => s + r.amount, 0);
    expect(total).toBeCloseTo(4894463.05, 2);
  });

  it('keeps the sign of the protest-credit voucher (a real negative)', () => {
    const out = parseOpenAp(apText, 'Open AP Report JUN-26.xlsx')!;
    expect(out.rows.some((r) => r.amount < 0)).toBe(true);
  });

  it('captures payment status, reconciling each status bucket to source', () => {
    const out = parseOpenAp(apText, 'Open AP Report JUN-26.xlsx')!;
    const byStatus: Record<string, number> = {};
    for (const r of out.rows) {
      const s = r.status ?? 'NONE';
      byStatus[s] = (byStatus[s] ?? 0) + r.amount;
    }
    expect(byStatus['HOLD']).toBeCloseTo(4492315.29, 2);
    expect(byStatus['PAID']).toBeCloseTo(292448.14, 2);
    expect(byStatus['PPHOLD']).toBeCloseTo(109699.62, 2);
  });

  it('assigns every voucher an aging bucket and carries vendor names down', () => {
    const out = parseOpenAp(apText, 'Open AP Report JUN-26.xlsx')!;
    expect(out.rows.every((r) => r.age_bucket !== null)).toBe(true);
    expect(out.rows.every((r) => r.vendor_name.length > 0)).toBe(true);
    expect(out.rows.some((r) => /advent/i.test(r.vendor_name))).toBe(true);
  });
});

describe('parseOpenAp — Jan Open AP (multi-column vendor-group header)', () => {
  // Jan–Mar emit the vendor group header as a MULTI-COLUMN row
  // ("ACR Technical Services - ACR0001 |  | ACR Technical Services ...") rather
  // than the bare pipe-less cell June/May use. The columnar parser must capture
  // the vendor from column 0 of that row, or every voucher loses its vendor and
  // is dropped. Ground truth (Balance Sheet Jan AP line): $3,784,518.71.
  let apText: string;

  beforeAll(() => {
    apText = readFileSync(join(EXTRACTED_TEXT_DIR, 'open-ap-jan-2026.extracted.txt'), 'utf-8');
  });

  it('reconciles to the Balance Sheet Jan AP total of $3,784,518.71', () => {
    const out = parseOpenAp(apText, 'Open AP Report JAN-2026.xlsx');
    expect(out).not.toBeNull();
    expect(out!.is_ap).toBe(true);
    const total = out!.rows.reduce((s, r) => s + r.amount, 0);
    expect(total).toBeCloseTo(3784518.71, 2);
  });

  it('attributes every voucher to a vendor despite the multi-column header', () => {
    const out = parseOpenAp(apText, 'Open AP Report JAN-2026.xlsx')!;
    expect(out.rows.length).toBeGreaterThan(100);
    expect(out.rows.every((r) => r.vendor_name.length > 0)).toBe(true);
    expect(out.rows.some((r) => /ACR Technical Services/i.test(r.vendor_name))).toBe(true);
  });
});

describe('classifyFinancialDoc — AP routing no longer misfires on line items', () => {
  // The June Balance Sheet PDF: "Accounts Payable" appears as a LINE ITEM, which
  // previously tripped the loose is_ap head match and routed it into ap_actuals.
  const balanceSheetPdfHead = [
    'Envision Innovative Solutions, Inc',
    'Balance Sheet Page 1 of 2',
    'As of',
    '06/30/26',
    'Assets',
    'Current Assets',
    'Cash 57,540.98',
    'Billed Receivable 3,175,298.44',
    'Liabilities & Equity',
    'Current Liabilities',
    'Accounts Payable 4,894,463.05',
    'Total Current Assets 24,403,283.41',
  ].join('\n');

  it('does NOT route a Balance Sheet PDF into AP or AR', () => {
    const cls = classifyFinancialDoc('Balance Sheet JUN-26.pdf', balanceSheetPdfHead, null);
    expect(cls.is_ap).toBe(false);
    expect(cls.is_ar).toBe(false);
    expect(cls.is_balance_sheet).toBe(true);
  });

  it('does NOT route a Trended Balance Sheet (AP line item) into AP', () => {
    const trended = readFileSync(
      join(EXTRACTED_TEXT_DIR, 'balance-sheet-jun-2026.extracted.txt'),
      'utf-8',
    );
    const cls = classifyFinancialDoc('Trended Balance Sheet JUN-26.xlsx', trended, null);
    expect(cls.is_ap).toBe(false);
  });

  it('DOES route a real Open AP report to the AP parser', () => {
    const apText = readFileSync(join(EXTRACTED_TEXT_DIR, 'open-ap-jun-2026.extracted.txt'), 'utf-8');
    const cls = classifyFinancialDoc('Open AP Report JUN-26.xlsx', apText, null);
    expect(cls.is_ap).toBe(true);
    expect(cls.is_balance_sheet).toBe(false);
  });
});

describe('assessAgingBatch — plausibility guard', () => {
  it('flags a batch that is (almost) all zero amounts', () => {
    const rows = Array.from({ length: 72 }, () => ({ amount: 0 }));
    expect(assessAgingBatch('AP', rows)).toMatch(/plausibility/i);
  });

  it('flags a batch that nets to ~$0', () => {
    const rows = [{ amount: 100 }, { amount: -100 }, { amount: 50 }, { amount: -50 }, { amount: 0 }];
    expect(assessAgingBatch('AR', rows)).toMatch(/plausibility/i);
  });

  it('passes a healthy batch with real dollars', () => {
    const rows = [
      { amount: 37500 }, { amount: 461.08 }, { amount: 21460.32 },
      { amount: 21278.4 }, { amount: 8347.91 }, { amount: 3250 },
    ];
    expect(assessAgingBatch('AP', rows)).toBeNull();
  });

  it('does not flag tiny batches (< 5 rows) where the heuristic is unreliable', () => {
    expect(assessAgingBatch('AP', [{ amount: 0 }, { amount: 0 }])).toBeNull();
  });
});
