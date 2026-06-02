/**
 * arXiv API client — fetches recent defense/tech-relevant papers
 * via the arXiv Atom feed. Paginated with start offset.
 * No API key required; browser-style User-Agent recommended.
 * XML parsed with cheerio in xmlMode.
 */

import { request } from 'undici';
import * as cheerio from 'cheerio';
import { logger } from '../../lib/logger.js';
import type { ArxivEntryRaw } from './types.js';

const BASE_URL = 'https://export.arxiv.org/api/query';

const PAGE_LIMIT = 100;
const MAX_RECORDS = 200;
const REQUEST_TIMEOUT_MS = 60_000;
const REQUEST_DELAY_MS = 3_000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2_000;

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export const ARXIV_CATEGORIES: readonly string[] = [
  'cs.AI',
  'cs.CR',
  'cs.RO',
  'cs.LG',
  'cs.CV',
  'eess.SY',
  'eess.SP',
] as const;

function buildSearchQuery(): string {
  return ARXIV_CATEGORIES.map((c) => `cat:${c}`).join('+OR+');
}

async function fetchWithRetry(queryString: string): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      logger.warn(
        { attempt, delay, source: 'arxiv' },
        'arxiv_retry',
      );
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const url = `${BASE_URL}?${queryString}`;
      const { statusCode, body: respBody } = await request(url, {
        method: 'GET',
        headers: { 'user-agent': BROWSER_UA },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (statusCode === 429 || statusCode >= 500) {
        const text = await respBody.text().catch(() => '');
        lastError = new Error(
          `arXiv API ${statusCode}: ${text.slice(0, 300)}`,
        );
        continue;
      }

      if (statusCode !== 200) {
        const text = await respBody.text().catch(() => '');
        throw new Error(
          `arXiv API ${statusCode}: ${text.slice(0, 300)}`,
        );
      }

      return await respBody.text();
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('arXiv API 4') &&
          !err.message.includes('arXiv API 429'))
      ) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('arXiv API: max retries exhausted');
}

const ARXIV_ID_RE = /arxiv\.org\/abs\/([^\s<]+)/;

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function parseEntries($: cheerio.CheerioAPI): ArxivEntryRaw[] {
  const entries: ArxivEntryRaw[] = [];

  $('entry').each((_i, el) => {
    const $entry = $(el);

    const idText = $entry.find('id').first().text();
    const match = ARXIV_ID_RE.exec(idText);
    if (!match) return;
    const arxivId = match[1];

    const title = collapse($entry.find('title').first().text());
    const summary = collapse($entry.find('summary').first().text());
    const published = $entry.find('published').first().text().trim();
    const updated = $entry.find('updated').first().text().trim();

    let absUrl = '';
    let pdfUrl: string | null = null;
    $entry.find('link').each((_j, linkEl) => {
      const $link = $(linkEl);
      const rel = $link.attr('rel') ?? '';
      const type = $link.attr('type') ?? '';
      const href = $link.attr('href') ?? '';
      if (rel === 'alternate' && type === 'text/html') {
        absUrl = href;
      }
      if (type === 'application/pdf') {
        pdfUrl = href;
      }
    });

    if (!absUrl && idText.startsWith('http')) {
      absUrl = idText;
    }

    // arXiv marks the true primary category with <arxiv:primary_category>.
    // cheerio (xmlMode) preserves the namespaced tag; escape the colon in the
    // selector. Fall back to the first <category> if the primary tag is absent.
    let primaryCategory: string | null =
      $entry.find('arxiv\\:primary_category').first().attr('term') ?? null;
    if (!primaryCategory) {
      const firstCat = $entry.find('category').first();
      if (firstCat.length) {
        primaryCategory = firstCat.attr('term') ?? null;
      }
    }

    const categories: string[] = [];
    $entry.find('category').each((_j, catEl) => {
      const term = $(catEl).attr('term');
      if (term) categories.push(term);
    });

    const authors: string[] = [];
    $entry.find('author name').each((_j, nameEl) => {
      const name = $(nameEl).text().trim();
      if (name) authors.push(name);
    });

    entries.push({
      arxivId,
      title,
      summary,
      published,
      updated,
      absUrl,
      pdfUrl,
      primaryCategory,
      categories,
      authors,
    });
  });

  return entries;
}

export async function fetchArxivPapers(opts?: { limit?: number }): Promise<ArxivEntryRaw[]> {
  const cap = opts?.limit ?? MAX_RECORDS;
  const searchQuery = buildSearchQuery();

  const allResults: ArxivEntryRaw[] = [];
  let start = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const qs = `search_query=${searchQuery}&start=${start}&max_results=${PAGE_LIMIT}&sortBy=submittedDate&sortOrder=descending`;

    logger.info(
      { source: 'arxiv', start },
      'arxiv_ingest_fetch',
    );

    const xml = await fetchWithRetry(qs);
    const $ = cheerio.load(xml, { xmlMode: true });

    const totalStr = $('opensearch\\:totalResults, totalResults').first().text();
    const totalResults = parseInt(totalStr, 10) || 0;

    const entries = parseEntries($);
    allResults.push(...entries);

    logger.info(
      { source: 'arxiv', start, count: entries.length, total: allResults.length },
      'arxiv_ingest_page',
    );

    if (entries.length < PAGE_LIMIT || allResults.length >= cap || start + PAGE_LIMIT >= totalResults) break;

    start += PAGE_LIMIT;
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  }

  return allResults.slice(0, cap);
}
