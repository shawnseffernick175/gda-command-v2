/**
 * Regression tests for #1142 June upload fixes.
 *
 * BUG B: June financial statements (YTD GL Detail, Trended Income Statement,
 * Revenue Summary by Cost Pool, Trial Balance, Trend SIE, Balance Sheet) were
 * classified as "other" and routed to Inbox/Needs Triage instead of the
 * Financial Bible (surface "financials"), because a single financial keyword
 * scored just under the 0.7 LLM-upgrade threshold and the LLM then returned
 * "other". These tests assert every real statement now routes to financials,
 * while operational A/R and A/P reports are explicitly kept OUT of the Bible.
 */
import { describe, it, expect } from 'vitest';
import { classifyDocument } from '../../src/services/ingest/classifier.js';

const BIBLE_FILES = [
  'YTD GL Detail JUN-26.xlsx',
  'Trended Income Statement JUN-26.xlsx',
  'Revenue Summary by Cost Pool JUN-26.xlsx',
  'Trial Balance JUN-26.xlsx',
  'Trend SIE JUN-26.xlsx',
  'Balance Sheet JUN-26.pdf',
  'Trended Balance Sheet JUN-26.xlsx',
];

describe('classifyDocument — June financial statements route to the Financial Bible', () => {
  for (const filename of BIBLE_FILES) {
    it(`routes "${filename}" to financials/financial_doc`, async () => {
      const cls = await classifyDocument('', filename, null);
      expect(cls.surface).toBe('financials');
      expect(cls.entity_type).toBe('financial_doc');
      expect(cls.confidence).toBeGreaterThanOrEqual(0.7);
    });
  }

  it('detects a financial statement by CONTENT when the filename is opaque', async () => {
    const text = '[Sheet: DataSetLandTbl]\nProject,Period Cost,Period Revenue\nGrand Total,100,200\n';
    const cls = await classifyDocument(text, 'export-2026-06.xlsx', null);
    expect(cls.surface).toBe('financials');
    expect(cls.entity_type).toBe('financial_doc');
  });
});

describe('classifyDocument — operational A/R & A/P reports stay OUT of the Bible', () => {
  const OPERATIONAL_FILES = [
    'Aged AR Report JUN-26.pdf',
    'Aged A/R JUN-26.xlsx',
    'Open AP JUN-26.xlsx',
    'Open A/P Report JUN-26.xlsx',
    'AR Aging JUN-26.xlsx',
  ];
  for (const filename of OPERATIONAL_FILES) {
    it(`does NOT route "${filename}" to the Financial Bible`, async () => {
      const cls = await classifyDocument('accounts receivable aging report', filename, null);
      expect(cls.surface).not.toBe('financials');
    });
  }
});
