/**
 * NSF Awards API client — fetches research award data via the public
 * NSF awards search endpoint. JSON over undici, paginated.
 * No API key required.
 */

import { request } from 'undici';
import { logger } from '../../lib/logger.js';
import type { NSFAwardRaw } from './types.js';

const BASE_URL = 'https://api.nsf.gov/services/v1/awards.json';

const RPP = 25; // NSF hard API limit per page
const REQUEST_TIMEOUT_MS = 60_000;
const REQUEST_DELAY_MS = 500;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2_000;
const MAX_RECORDS = 200;

const PRINT_FIELDS = [
  'id', 'title', 'abstractText', 'awardeeName', 'awardeeStateCode',
  'estimatedTotalAmt', 'fundsObligatedAmt', 'pdPIName', 'startDate',
  'expDate', 'fundProgramName', 'agency', 'date', 'awardAgencyCode',
  'primaryProgram',
].join(',');

/**
 * Initial defense/R&D-relevant keyword set for NSF award discovery.
 * Joined with " OR " in the API query. Easy to tune later.
 */
export const NSF_KEYWORDS: readonly string[] = [
  'artificial intelligence',
  'machine learning',
  'autonomy',
  'cybersecurity',
  'hypersonics',
  'quantum',
  'directed energy',
  'microelectronics',
] as const;

interface NSFApiResponse {
  response?: {
    award?: NSFAwardRaw[];
  };
}

function formatMMDDYYYY(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

async function fetchWithRetry(url: string): Promise<NSFApiResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      logger.warn(
        { attempt, delay, source: 'nsf' },
        'nsf_retry',
      );
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const { statusCode, body: respBody } = await request(url, {
        method: 'GET',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (statusCode === 429 || statusCode >= 500) {
        const text = await respBody.text().catch(() => '');
        lastError = new Error(
          `NSF API ${statusCode}: ${text.slice(0, 300)}`,
        );
        continue;
      }

      if (statusCode !== 200) {
        const text = await respBody.text().catch(() => '');
        throw new Error(
          `NSF API ${statusCode}: ${text.slice(0, 300)}`,
        );
      }

      return (await respBody.json()) as NSFApiResponse;
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('NSF API 4') &&
          !err.message.includes('NSF API 429'))
      ) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('NSF API: max retries exhausted');
}

export interface NSFFetchOptions {
  since: Date;
  until: Date;
  keywords?: string[];
  limit?: number;
}

/**
 * Fetch all award pages for a single keyword within the award-date window.
 * NSF's `keyword` boolean query only reliably honors up to ~3 OR clauses (4+
 * silently returns 0), so we query one keyword at a time and dedupe upstream
 * rather than OR-joining the whole keyword set into one request.
 */
async function fetchAwardsForKeyword(
  keyword: string,
  dateStart: string,
  dateEnd: string,
  cap: number,
): Promise<NSFAwardRaw[]> {
  const results: NSFAwardRaw[] = [];
  let offset = 1; // NSF uses 1-based offset

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const params = new URLSearchParams({
      keyword,
      // Filter on award *date* (when the award was made), not startDate:
      // startDate is the future project start (often months out), so a recent
      // window over startDate matches almost nothing. dateStart/dateEnd is the
      // "recently awarded" window that yields live early-signal data.
      dateStart,
      dateEnd,
      printFields: PRINT_FIELDS,
      rpp: String(RPP),
      offset: String(offset),
    });

    const url = `${BASE_URL}?${params.toString()}`;

    logger.info(
      { source: 'nsf', keyword, offset, dateStart, dateEnd },
      'nsf_ingest_fetch',
    );

    const resp = await fetchWithRetry(url);
    const awards = resp.response?.award ?? [];
    results.push(...awards);

    logger.info(
      { source: 'nsf', keyword, offset, count: awards.length },
      'nsf_ingest_page',
    );

    if (awards.length < RPP || results.length >= cap) break;

    offset += RPP;
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  }

  return results;
}

export async function fetchNSFAwards(opts: NSFFetchOptions): Promise<NSFAwardRaw[]> {
  const { since, until, limit } = opts;
  const keywords = opts.keywords ?? (NSF_KEYWORDS as unknown as string[]);
  const cap = limit ?? MAX_RECORDS;

  const dateStart = formatMMDDYYYY(since);
  const dateEnd = formatMMDDYYYY(until);

  // De-dupe across keywords by award id (an award can match multiple keywords).
  const byId = new Map<string, NSFAwardRaw>();

  for (const keyword of keywords) {
    if (byId.size >= cap) break;
    const awards = await fetchAwardsForKeyword(keyword, dateStart, dateEnd, cap);
    for (const award of awards) {
      const id = award.id?.trim();
      if (id && !byId.has(id)) byId.set(id, award);
    }
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  }

  logger.info(
    { source: 'nsf', keywords: keywords.length, unique: byId.size },
    'nsf_ingest_aggregate',
  );

  return Array.from(byId.values()).slice(0, cap);
}
