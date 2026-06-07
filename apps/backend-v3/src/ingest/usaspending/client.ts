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
const REQUEST_DELAY_MS = 250;
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 1_000;

/** Target agency filter — Envision-relevant federal agencies. */
const DOD_AGENCY_FILTER = [
  { type: 'awarding' as const, tier: 'toptier' as const, name: 'Department of Defense' },
  { type: 'awarding' as const, tier: 'toptier' as const, name: 'Department of Homeland Security' },
  { type: 'awarding' as const, tier: 'toptier' as const, name: 'General Services Administration' },
  { type: 'awarding' as const, tier: 'toptier' as const, name: 'Department of Veterans Affairs' },
];

const ENVISION_NAICS_CODES = ['541511', '541512', '541519', '541690'];

/**
 * USAspending enforces single-group constraint on award_type_codes.
 * Each group requires its own paginated request.
 */
export const CONTRACT_TYPE_CODES = ['A', 'B', 'C', 'D'];
export const IDV_TYPE_CODES = [
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
    limit: number;
  };
}

export function formatDate(d: Date): string {
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

export interface USASpendingFetchResult {
  records: USASpendingAwardRaw[];
  contracts_rows: number;
  idvs_rows: number;
  degraded: boolean;
  degradedReason?: string;
}

export async function fetchGroup(
  groupLabel: string,
  typeCodes: string[],
  startDate: string,
  endDate: string,
): Promise<USASpendingAwardRaw[]> {
  const results: USASpendingAwardRaw[] = [];
  let page = 1;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const body = {
      filters: {
        award_type_codes: typeCodes,
        time_period: [{ start_date: startDate, end_date: endDate, date_type: 'last_modified_date' }],
        agencies: DOD_AGENCY_FILTER,
        naics_codes: { require: ENVISION_NAICS_CODES, exclude: [] },
      },
      fields: REQUESTED_FIELDS,
      page,
      limit: PAGE_LIMIT,
      sort: 'Last Modified Date',
      order: 'desc',
    };

    logger.info(
      { source: 'usaspending', group: groupLabel, page, startDate, endDate },
      'usaspending_ingest_fetch',
    );

    const resp = await fetchWithRetry(body);
    results.push(...resp.results);

    logger.info(
      { source: 'usaspending', group: groupLabel, page, count: resp.results.length },
      'usaspending_ingest_page',
    );

    if (!resp.page_metadata.hasNext) break;

    page++;
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  }

  return results;
}

/**
 * Fetch all DoD contract awards modified in the given time window.
 * Sends two separate paginated requests (contracts + IDVs) because
 * USAspending rejects mixed award_type_codes with HTTP 422.
 */
export async function fetchUSASpendingAwards(
  fromDate: Date,
  toDate: Date,
): Promise<USASpendingFetchResult> {
  const startDate = formatDate(fromDate);
  const endDate = formatDate(toDate);

  logger.info(
    { source: 'usaspending', startDate, endDate },
    'usaspending_ingest_start',
  );

  let contractRecords: USASpendingAwardRaw[] = [];
  let idvRecords: USASpendingAwardRaw[] = [];
  let contractError: string | null = null;
  let idvError: string | null = null;

  try {
    contractRecords = await fetchGroup('contracts', CONTRACT_TYPE_CODES, startDate, endDate);
  } catch (err) {
    contractError = err instanceof Error ? err.message : String(err);
    logger.error(
      { source: 'usaspending', group: 'contracts', error: contractError },
      'usaspending_group_fetch_error',
    );
  }

  try {
    idvRecords = await fetchGroup('idvs', IDV_TYPE_CODES, startDate, endDate);
  } catch (err) {
    idvError = err instanceof Error ? err.message : String(err);
    logger.error(
      { source: 'usaspending', group: 'idvs', error: idvError },
      'usaspending_group_fetch_error',
    );
  }

  if (contractError && idvError) {
    throw new Error(
      `Both award groups failed — contracts: ${contractError}; idvs: ${idvError}`,
    );
  }

  const degraded = !!(contractError || idvError);
  const degradedReason = contractError
    ? `contracts group failed: ${contractError}`
    : idvError
      ? `idvs group failed: ${idvError}`
      : undefined;

  return {
    records: [...contractRecords, ...idvRecords],
    contracts_rows: contractRecords.length,
    idvs_rows: idvRecords.length,
    degraded,
    degradedReason,
  };
}
