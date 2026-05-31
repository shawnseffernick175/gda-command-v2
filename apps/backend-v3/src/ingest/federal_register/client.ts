/**
 * Federal Register JSON API client — fetches procurement-related
 * regulatory documents via the public federalregister.gov API.
 * No authentication required. Paginated via `page=N`.
 */

import { request } from 'undici';
import { logger } from '../../lib/logger.js';

const BASE_URL = 'https://www.federalregister.gov/api/v1/documents.json';
const PER_PAGE = 100;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 1_000;
const REQUEST_DELAY_MS = 300;

const TOPIC_CONDITIONS = [
  'procurement',
  'government-contracts',
  'acquisition-regulations',
];

export const FR_AGENCY_SLUGS = [
  'defense-department',
  'general-services-administration',
  'homeland-security-department',
  'small-business-administration',
  'office-of-federal-procurement-policy',
  'national-aeronautics-and-space-administration',
  'energy-department',
  'health-and-human-services-department',
  'office-of-management-and-budget',
] as const;

export interface FederalRegisterDocumentRaw {
  document_number: string;
  title: string;
  abstract: string | null;
  type: string;
  agencies: Array<{ name: string; raw_name: string }>;
  publication_date: string;
  effective_on: string | null;
  comments_close_on: string | null;
  cfr_references: Array<{ title: number; part: number }>;
  topics: string[];
  html_url: string;
  pdf_url: string | null;
  regulation_id_number_info: Record<string, unknown>;
  regulations_dot_gov_info: { document_id: string } | null;
  significant: boolean;
  docket_ids: string[];
}

interface FederalRegisterResponse {
  count: number;
  total_pages: number;
  next_page_url: string | null;
  results: FederalRegisterDocumentRaw[];
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function buildSearchUrl(fromDate: Date, page: number): string {
  const params = new URLSearchParams();
  params.set('conditions[publication_date][gte]', formatDate(fromDate));
  params.set('per_page', String(PER_PAGE));
  params.set('page', String(page));
  params.set('order', 'newest');

  for (const topic of TOPIC_CONDITIONS) {
    params.append('conditions[topics][]', topic);
  }
  for (const agency of FR_AGENCY_SLUGS) {
    params.append('conditions[agencies][]', agency);
  }

  return `${BASE_URL}?${params.toString()}`;
}

async function fetchWithRetry(url: string): Promise<FederalRegisterResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      logger.warn(
        { source: 'federal_register', attempt, delay },
        'federal_register_retry',
      );
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const { statusCode, body } = await request(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'GDA-Ingest/1.0 (+contact: shawn.seffernick175@gmail.com)',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (statusCode === 429 || statusCode >= 500) {
        const text = await body.text().catch(() => '');
        lastError = new Error(
          `Federal Register API ${statusCode}: ${text.slice(0, 300)}`,
        );
        continue;
      }

      if (statusCode !== 200) {
        const text = await body.text().catch(() => '');
        throw new Error(
          `Federal Register API ${statusCode}: ${text.slice(0, 300)}`,
        );
      }

      return (await body.json()) as FederalRegisterResponse;
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes('Federal Register API 4') &&
        !err.message.includes('Federal Register API 429')
      ) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('Federal Register API: max retries exhausted');
}

/**
 * Fetch all procurement-related Federal Register documents published
 * since `fromDate`. Returns flat array of raw records, automatically paginated.
 */
export async function fetchFederalRegisterDocuments(
  fromDate: Date,
): Promise<FederalRegisterDocumentRaw[]> {
  const allResults: FederalRegisterDocumentRaw[] = [];
  let page = 1;

  logger.info(
    { source: 'federal_register', fromDate: formatDate(fromDate) },
    'federal_register_fetch_start',
  );

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = buildSearchUrl(fromDate, page);
    logger.info(
      { source: 'federal_register', page, url },
      'federal_register_fetch_page',
    );

    const data = await fetchWithRetry(url);
    allResults.push(...data.results);

    if (!data.next_page_url || page >= data.total_pages) {
      break;
    }

    page++;
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  }

  logger.info(
    { source: 'federal_register', totalFetched: allResults.length },
    'federal_register_fetch_complete',
  );

  return allResults;
}
