/**
 * FPDS ATOM feed client — fetches contract award data from the
 * Federal Procurement Data System public ATOM feed.
 * Paginates via `start=` offset parameter.
 * No authentication required.
 */

import { logger } from '../../lib/logger.js';

const FPDS_ATOM_BASE = 'https://www.fpds.gov/ezsearch/LATEST?s=FPDS&indexName=awardfull&templateName=1.5.3';
const PAGE_SIZE = 500;
const REQUEST_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_PAGES = 40;

function formatFPDSDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch raw ATOM XML pages from FPDS for awards modified in the given window.
 * Returns an array of raw XML strings (one per page).
 */
export async function fetchFPDSPages(
  fromDate: Date,
  toDate: Date,
): Promise<string[]> {
  const pages: string[] = [];
  const from = formatFPDSDate(fromDate);
  const to = formatFPDSDate(toDate);
  const dateFilter = `LAST_MOD_DATE:[${from},${to}]`;

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_SIZE;
    const url = `${FPDS_ATOM_BASE}&q=${encodeURIComponent(dateFilter)}&start=${offset}`;

    logger.info(
      { source: 'fpds.gov', page, offset, from, to },
      'fpds_ingest_fetch',
    );

    const resp = await fetch(url, {
      headers: { Accept: 'application/atom+xml' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`FPDS feed ${resp.status}: ${text.slice(0, 300)}`);
    }

    const xml = await resp.text();
    pages.push(xml);

    // Check if this page has fewer entries than PAGE_SIZE (last page)
    const entryCount = (xml.match(/<entry>/g) || []).length;

    logger.info(
      { source: 'fpds.gov', page, entries: entryCount, offset },
      'fpds_ingest_page',
    );

    if (entryCount === 0 || entryCount < PAGE_SIZE) {
      break;
    }

    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  }

  return pages;
}
