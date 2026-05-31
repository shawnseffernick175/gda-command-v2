/**
 * NECO HTML parser — extracts RFQ records from NECO search result pages.
 */

import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { logger } from '../../lib/logger.js';

export interface NECORecord {
  rfqNumber: string;
  title: string;
  issuingActivity: string | null;
  postedDate: string | null;
  closingDate: string | null;
  setAside: string | null;
  naics: string | null;
  detailUrl: string | null;
}

export interface NECOParseResult {
  records: NECORecord[];
  degraded: boolean;
  degradedReason: string | null;
}

/**
 * Parse NECO search result page HTML into typed records.
 * If selectors miss, marks result as degraded rather than crashing.
 */
export function parseNECOSearchResults(html: string): NECOParseResult {
  const $ = cheerio.load(html);
  const records: NECORecord[] = [];

  const rows = $('table.datagrid tr, table.GridView tr, #dgResults tr, table[id*="Result"] tr, table.synopsis tr');

  if (rows.length === 0) {
    const altRows = $('table tr').filter((_i, el) => {
      const text = $(el).text();
      return /N\d{5}|NECO|RFQ|Synopsis/i.test(text);
    });

    if (altRows.length === 0) {
      logger.warn({ source: 'neco', htmlLength: html.length }, 'neco_selector_miss');
      return {
        records: [],
        degraded: true,
        degradedReason: 'Primary listing selectors returned no rows — page structure may have changed',
      };
    }

    altRows.each((_i, el) => {
      const record = parseRowFromCells($, el);
      if (record) records.push(record);
    });

    return { records, degraded: false, degradedReason: null };
  }

  if (rows.length <= 1) {
    return { records: [], degraded: false, degradedReason: null };
  }

  rows.each((i, el) => {
    if (i === 0) return;
    const record = parseRowFromCells($, el);
    if (record) records.push(record);
  });

  return { records, degraded: false, degradedReason: null };
}

function parseRowFromCells(
  $: cheerio.CheerioAPI,
  el: Element,
): NECORecord | null {
  const cells = $(el).find('td');
  if (cells.length < 2) return null;

  const cellTexts = cells.map((_i, c) => $(c).text().trim()).get();

  const rfqNum = cellTexts[0] ?? '';
  if (!rfqNum || rfqNum.length < 3) return null;

  const link = $(el).find('a[href]').first();
  const detailUrl = link.attr('href') ?? null;

  return {
    rfqNumber: rfqNum,
    title: cellTexts[1] || `NECO Synopsis ${rfqNum}`,
    issuingActivity: cellTexts[2] || null,
    postedDate: cellTexts[3] || null,
    closingDate: cellTexts[4] || null,
    setAside: cellTexts[5] || null,
    naics: cellTexts[6] || null,
    detailUrl,
  };
}

/**
 * Extract ASP.NET form state from NECO pages for POST-based search.
 */
export function extractFormState(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  const state: Record<string, string> = {};

  const viewState = $('input[name="__VIEWSTATE"]').val();
  if (typeof viewState === 'string') state['__VIEWSTATE'] = viewState;

  const eventValidation = $('input[name="__EVENTVALIDATION"]').val();
  if (typeof eventValidation === 'string') state['__EVENTVALIDATION'] = eventValidation;

  const viewStateGenerator = $('input[name="__VIEWSTATEGENERATOR"]').val();
  if (typeof viewStateGenerator === 'string') state['__VIEWSTATEGENERATOR'] = viewStateGenerator;

  return state;
}
