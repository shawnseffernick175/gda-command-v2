/**
 * DIBBS HTML parser — extracts RFQ/PR records from DIBBS listing
 * and detail pages using cheerio.
 */

import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { logger } from '../../lib/logger.js';

export interface DIBBSRecord {
  solicitationNumber: string;
  title: string;
  nsn: string | null;
  partNumber: string | null;
  quantity: number | null;
  unit: string | null;
  deliveryDate: string | null;
  postedDate: string | null;
  returnByDate: string | null;
  buyer: string | null;
  detailUrl: string | null;
}

export interface DIBBSParseResult {
  records: DIBBSRecord[];
  degraded: boolean;
  degradedReason: string | null;
}

/**
 * Parse DIBBS RFQ listing page HTML into typed records.
 * If selectors miss, marks result as degraded rather than crashing.
 */
export function parseDIBBSListingPage(html: string): DIBBSParseResult {
  const $ = cheerio.load(html);
  const records: DIBBSRecord[] = [];

  const rows = $('table.datagrid tr, table.GridView tr, #dgSearchResult tr, table[id*="SearchResult"] tr, table.rfqlist tr');

  if (rows.length === 0) {
    const altRows = $('table tr').filter((_i, el) => {
      const text = $(el).text();
      return /SPE\d|DLA|RFQ/i.test(text);
    });

    if (altRows.length === 0) {
      logger.warn({ source: 'dibbs', htmlLength: html.length }, 'dibbs_selector_miss');
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
): DIBBSRecord | null {
  const cells = $(el).find('td');
  if (cells.length < 3) return null;

  const cellTexts = cells.map((_i, c) => $(c).text().trim()).get();

  const solNum = cellTexts[0] ?? '';
  if (!solNum || solNum.length < 3) return null;

  const link = $(el).find('a[href]').first();
  const detailUrl = link.attr('href') ?? null;

  return {
    solicitationNumber: solNum,
    title: cellTexts[1] || `DIBBS RFQ ${solNum}`,
    nsn: extractField(cellTexts, /^\d{4}-\d{2}-\d{3}-\d{4}$/),
    partNumber: cellTexts[2] || null,
    quantity: parseQuantity(cellTexts[3]),
    unit: cellTexts[4] || null,
    deliveryDate: cellTexts[5] || null,
    postedDate: cellTexts[6] || null,
    returnByDate: cellTexts[7] || null,
    buyer: cellTexts[8] || null,
    detailUrl,
  };
}

function extractField(cells: string[], pattern: RegExp): string | null {
  for (const cell of cells) {
    if (pattern.test(cell)) return cell;
  }
  return null;
}

function parseQuantity(val: string | undefined): number | null {
  if (!val) return null;
  const n = parseFloat(val.replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

/**
 * Parse a DIBBS detail page for enrichment data.
 */
export function parseDIBBSDetailPage(html: string): Partial<DIBBSRecord> {
  const $ = cheerio.load(html);
  const result: Partial<DIBBSRecord> = {};

  $('table tr, .detail-row, dl dt').each((_i, el) => {
    const label = $(el).find('td:first-child, dt').text().trim().toLowerCase();
    const value = $(el).find('td:last-child, dd').text().trim();

    if (label.includes('nsn') && value) result.nsn = value;
    if (label.includes('part number') && value) result.partNumber = value;
    if (label.includes('quantity') && value) result.quantity = parseQuantity(value);
    if (label.includes('return by') && value) result.returnByDate = value;
    if (label.includes('buyer') && value) result.buyer = value;
  });

  return result;
}
