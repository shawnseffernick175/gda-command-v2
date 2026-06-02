/**
 * NIH RePORTER v2 Projects API client — fetches defense/tech-relevant
 * research awards via POST JSON search. Paginated with offset.
 * No API key required; browser-style User-Agent is mandatory.
 */

import { request } from 'undici';
import { logger } from '../../lib/logger.js';
import type { NIHProjectRaw } from './types.js';

const BASE_URL = 'https://api.reporter.nih.gov/v2/projects/search';

const PAGE_LIMIT = 100;
const MAX_RECORDS = 200;
const REQUEST_TIMEOUT_MS = 60_000;
const REQUEST_DELAY_MS = 500;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2_000;

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/**
 * Defense/R&D-relevant keyword set — mirrors NSF_KEYWORDS.
 * Passed as space-separated terms with operator "or" to advanced_text_search.
 */
export const NIH_KEYWORDS: readonly string[] = [
  'artificial intelligence',
  'machine learning',
  'autonomy',
  'cybersecurity',
  'hypersonics',
  'quantum',
  'directed energy',
  'microelectronics',
] as const;

interface NIHApiResponse {
  meta?: { total?: number; offset?: number; limit?: number };
  results?: NIHProjectRaw[];
}

async function fetchWithRetry(body: Record<string, unknown>): Promise<NIHApiResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      logger.warn(
        { attempt, delay, source: 'nih' },
        'nih_retry',
      );
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const { statusCode, body: respBody } = await request(BASE_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': BROWSER_UA,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (statusCode === 429 || statusCode >= 500) {
        const text = await respBody.text().catch(() => '');
        lastError = new Error(
          `NIH API ${statusCode}: ${text.slice(0, 300)}`,
        );
        continue;
      }

      if (statusCode !== 200) {
        const text = await respBody.text().catch(() => '');
        throw new Error(
          `NIH API ${statusCode}: ${text.slice(0, 300)}`,
        );
      }

      return (await respBody.json()) as NIHApiResponse;
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('NIH API 4') &&
          !err.message.includes('NIH API 429'))
      ) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('NIH API: max retries exhausted');
}

export interface NIHFetchOptions {
  fiscalYears: number[];
  keywords?: string[];
  limit?: number;
}

export async function fetchNIHProjects(opts: NIHFetchOptions): Promise<NIHProjectRaw[]> {
  const keywords = opts.keywords ?? (NIH_KEYWORDS as unknown as string[]);
  const cap = opts.limit ?? MAX_RECORDS;

  const searchText = keywords.join(' ');

  const allResults: NIHProjectRaw[] = [];
  let offset = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const body = {
      criteria: {
        fiscal_years: opts.fiscalYears,
        advanced_text_search: {
          operator: 'or',
          search_field: 'projecttitle,terms,abstracttext',
          search_text: searchText,
        },
      },
      include_fields: [
        'ApplId', 'ProjectNum', 'ProjectTitle', 'FiscalYear',
        'AwardAmount', 'AgencyIcAdmin', 'Organization',
        'ProjectStartDate', 'ProjectEndDate', 'ActivityCode', 'AwardType',
      ],
      offset,
      limit: PAGE_LIMIT,
      sort_field: 'award_amount',
      sort_order: 'desc',
    };

    logger.info(
      { source: 'nih', offset, fiscalYears: opts.fiscalYears },
      'nih_ingest_fetch',
    );

    const resp = await fetchWithRetry(body);
    const projects = resp.results ?? [];

    allResults.push(...projects);

    logger.info(
      { source: 'nih', offset, count: projects.length, total: allResults.length },
      'nih_ingest_page',
    );

    if (projects.length < PAGE_LIMIT || allResults.length >= cap) break;

    offset += PAGE_LIMIT;
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  }

  return allResults.slice(0, cap);
}
