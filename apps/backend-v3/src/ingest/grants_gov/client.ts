/**
 * Grants.gov REST API client — fetches open/forecasted grant opportunities.
 * No API key required (public endpoint).
 */

import { request } from 'undici';
import { logger } from '../../lib/logger.js';
import type { GrantsGovRaw } from './types.js';

const BASE_URL = 'https://apply07.grants.gov/grantsws/rest/opportunities/search';

const ROWS_PER_PAGE = 100;
const MAX_RECORDS = 500;
const REQUEST_TIMEOUT_MS = 60_000;
const REQUEST_DELAY_MS = 500;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2_000;

interface GrantsGovApiResponse {
  oppHits?: GrantsGovRawHit[];
}

interface GrantsGovRawHit {
  id?: string;
  opportunityId?: string;
  number?: string;
  opportunityNumber?: string;
  title?: string;
  opportunityTitle?: string;
  agencyCode?: string;
  agencyName?: string;
  agency?: string;                // actual field name returned by API
  openDate?: string;
  closeDate?: string;
  awardCeiling?: number;
  awardFloor?: number;
  description?: string;
  synopsis?: string;
  oppStatus?: string;
  cfdaList?: string | string[];   // API returns array
  cfda?: string;
  opportunityCategory?: string;
  category?: string;
}

function normalizeHit(hit: GrantsGovRawHit): GrantsGovRaw {
  return {
    id: String(hit.id ?? hit.opportunityId ?? ''),
    number: hit.number ?? hit.opportunityNumber ?? '',
    title: hit.title ?? hit.opportunityTitle ?? '',
    agencyCode: hit.agencyCode ?? '',
    agencyName: hit.agencyName ?? hit.agency ?? '',
    openDate: hit.openDate ?? '',
    closeDate: hit.closeDate ?? null,
    awardCeiling: hit.awardCeiling ?? null,
    awardFloor: hit.awardFloor ?? null,
    description: hit.description ?? hit.synopsis ?? null,
    oppStatus: hit.oppStatus ?? '',
    cfda: (Array.isArray(hit.cfdaList) ? hit.cfdaList[0] ?? null : hit.cfdaList ?? null) ?? hit.cfda ?? null,
    category: hit.opportunityCategory ?? hit.category ?? null,
  };
}

async function fetchWithRetry(payload: Record<string, unknown>): Promise<GrantsGovApiResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      logger.warn({ attempt, delay, source: 'grants.gov' }, 'grants_gov_retry');
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const { statusCode, body: respBody } = await request(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (statusCode === 429 || statusCode >= 500) {
        const text = await respBody.text().catch(() => '');
        lastError = new Error(`Grants.gov API ${statusCode}: ${text.slice(0, 300)}`);
        continue;
      }

      if (statusCode !== 200) {
        const text = await respBody.text().catch(() => '');
        throw new Error(`Grants.gov API ${statusCode}: ${text.slice(0, 300)}`);
      }

      return (await respBody.json()) as GrantsGovApiResponse;
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes('Grants.gov API 4') &&
        !err.message.includes('Grants.gov API 429')
      ) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('Grants.gov API: max retries exhausted');
}

export interface GrantsGovFetchOptions {
  limit?: number;
}

export async function fetchGrantsGovOpportunities(opts: GrantsGovFetchOptions): Promise<GrantsGovRaw[]> {
  const { limit } = opts;
  const cap = limit ?? MAX_RECORDS;

  const allResults: GrantsGovRaw[] = [];
  let startRecordNum = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const payload = {
      keyword: '',
      oppStatuses: 'forecasted|posted',
      rows: ROWS_PER_PAGE,
      startRecordNum,
      sortBy: 'openDate|desc',
    };

    logger.info(
      { source: 'grants.gov', startRecordNum },
      'grants_gov_ingest_fetch',
    );

    const resp = await fetchWithRetry(payload);
    const hits = resp.oppHits ?? [];
    const normalized = hits.map(normalizeHit);

    allResults.push(...normalized);

    logger.info(
      { source: 'grants.gov', startRecordNum, count: hits.length, total: allResults.length },
      'grants_gov_ingest_page',
    );

    if (hits.length < ROWS_PER_PAGE || allResults.length >= cap) break;

    startRecordNum += ROWS_PER_PAGE;
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  }

  return allResults.slice(0, cap);
}
