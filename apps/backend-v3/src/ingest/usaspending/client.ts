/**
 * USAspending.gov API client — fetches DoD contract award data via
 * the spending_by_award search endpoint. JSON over undici, paginated.
 * No API key required.
 */

import { request } from 'undici';
import { logger } from '../../lib/logger.js';

const BASE_URL =
  'https://api.usaspending.gov/api/v2/search/spending_by_award/';

const PAGE_LIMIT = 100;
const REQUEST_TIMEOUT_MS = 60_000;
const REQUEST_DELAY_MS = 500;
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 1_000;

/** DoD-only agency filter (defense focus per program spec). */
const DOD_AGENCY_FILTER = [
  { type: 'awarding' as const, tier: 'toptier' as const, name: 'Department of Defense' },
];

/** All federal contract & IDV award type codes. */
const CONTRACT_AWARD_TYPE_CODES = [
  'A', 'B', 'C', 'D',
  'IDV_A', 'IDV_B', 'IDV_B_A', 'IDV_B_B', 'IDV_B_C', 'IDV_C', 'IDV_D', 'IDV_E',
];

const REQUESTED_FIELDS = [
  'Award ID',
  'Recipient Name',
  'Recipient UEI',
  'Recipient DUNS',
  'Award Amount',
  'Total Outlays',
  'Description',
  'Contract Award Type',
  'Awarding Agency',
  'Awarding Sub Agency',
  'Awarding Office',
  'Funding Agency',
  'Place of Performance State Code',
  'Place of Performance Country Code',
  'Start Date',
  'End Date',
  'Last Modified Date',
  'NAICS Code',
  'PSC Code',
  'generated_internal_id',
];

export interface USASpendingAwardRaw {
  'Award ID': string | null;
  'Recipient Name': string | null;
  'Recipient UEI': string | null;
  'Recipient DUNS': string | null;
  'Award Amount': number | null;
  'Total Outlays': number | null;
  'Description': string | null;
  'Contract Award Type': string | null;
  'Awarding Agency': string | null;
  'Awarding Sub Agency': string | null;
  'Awarding Office': string | null;
  'Funding Agency': string | null;
  'Place of Performance State Code': string | null;
  'Place of Performance Country Code': string | null;
  'Start Date': string | null;
  'End Date': string | null;
  'Last Modified Date': string | null;
  'NAICS Code': string | null;
  'PSC Code': string | null;
  'generated_internal_id': string | null;
}

interface SpendingByAwardResponse {
  results: USASpendingAwardRaw[];
  page_metadata: {
    page: number;
    hasNext: boolean;
    total: number;
    limit: number;
  };
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fetchWithRetry(
  body: Record<string, unknown>,
): Promise<SpendingByAwardResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      logger.warn(
        { attempt, delay, source: 'usaspending' },
        'usaspending_retry',
      );
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const { statusCode, body: respBody } = await request(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (statusCode === 429 || statusCode >= 500) {
        const text = await respBody.text().catch(() => '');
        lastError = new Error(
          `USAspending API ${statusCode}: ${text.slice(0, 300)}`,
        );
        continue;
      }

      if (statusCode !== 200) {
        const text = await respBody.text().catch(() => '');
        throw new Error(
          `USAspending API ${statusCode}: ${text.slice(0, 300)}`,
        );
      }

      return (await respBody.json()) as SpendingByAwardResponse;
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('USAspending API 4') &&
          !err.message.includes('USAspending API 429'))
      ) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('USAspending API: max retries exhausted');
}

/**
 * Fetch all DoD contract awards modified in the given time window.
 * Returns flat array of raw records, automatically paginated.
 */
export async function fetchUSASpendingAwards(
  fromDate: Date,
  toDate: Date,
): Promise<USASpendingAwardRaw[]> {
  const startDate = formatDate(fromDate);
  const endDate = formatDate(toDate);
  const allResults: USASpendingAwardRaw[] = [];
  let page = 1;

  logger.info(
    { source: 'usaspending', startDate, endDate },
    'usaspending_ingest_start',
  );

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const body = {
      filters: {
        award_type_codes: CONTRACT_AWARD_TYPE_CODES,
        time_period: [{ start_date: startDate, end_date: endDate }],
        agencies: DOD_AGENCY_FILTER,
      },
      fields: REQUESTED_FIELDS,
      page,
      limit: PAGE_LIMIT,
      sort: 'Last Modified Date',
      order: 'desc',
    };

    logger.info(
      { source: 'usaspending', page, startDate, endDate },
      'usaspending_ingest_fetch',
    );

    const resp = await fetchWithRetry(body);
    allResults.push(...resp.results);

    logger.info(
      { source: 'usaspending', page, count: resp.results.length, total: resp.page_metadata.total },
      'usaspending_ingest_page',
    );

    if (!resp.page_metadata.hasNext) break;

    page++;
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  }

  return allResults;
}
