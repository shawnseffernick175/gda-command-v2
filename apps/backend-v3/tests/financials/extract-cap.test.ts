/**
 * BUG 6 regression: the xlsx text-extraction cap must be large enough to hold a
 * full fiscal year of GL Detail rows.
 *
 * YTD GL Detail ledgers are sorted by period (PD 1..12). A single busy month
 * (January had ~950 rows / ~200K chars) previously filled a 200K cap, so
 * extractTextFromBuffer truncated every later period. The cost-detail parser
 * then saw only January and Feb–May silently produced zero rows. This test
 * builds a workbook whose text far exceeds the old 200K cap and asserts a marker
 * written near the end survives extraction.
 *
 * pool is mocked (via the shared db mock path) so importing the vault route
 * module does not touch a database.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/db.js', () => ({
  pool: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) },
}));

import { extractTextFromBuffer } from '../../src/routes/vault.js';

const LATE_MARKER = 'ZZZ_LATE_PERIOD_MARKER_FY26_MAY';

async function buildLargeXlsx(): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Page1');
  ws.addRow(['FY', 'PD', 'Project ID', 'Account Name', 'Transaction Desc', 'Amount']);
  // ~6000 rows * ~60 chars/row of extracted text => ~360K chars, well past 200K.
  for (let i = 0; i < 6000; i++) {
    ws.addRow([2026, 1, `1047.000.${i}`, 'Direct Labor OFFSITE', 'LD Posting padding', 123.45]);
  }
  ws.addRow([2026, 5, '1047.999.000', 'Direct Labor ONSITE', LATE_MARKER, 999.99]);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

describe('extractTextFromBuffer xlsx cap (BUG 6)', () => {
  it('retains rows past the old 200K cap so late periods are not truncated', async () => {
    const buf = await buildLargeXlsx();
    const text = await extractTextFromBuffer(buf, 'YTD MAY-2026 GL Detail.xlsx');
    expect(text.length).toBeGreaterThan(200_000);
    expect(text).toContain(LATE_MARKER);
  });
});
