/**
 * FPDS Atom Feed client — lightweight adapter for querying federal
 * contract awards via the FPDS ezsearch portal.
 *
 * Rate limit: max 30 requests/min (enforced by caller via delay + backoff).
 */

import { request } from 'undici';
import { logger } from '../../lib/logger.js';
import { parseFpdsAtomFeed, type FpdsAwardEntry } from './parser.js';

const DEFAULT_BASE_URL = 'https://www.fpds.gov/ezsearch/fpdsportal';

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2_000;

export interface FpdsSearchParams {
  solicitationId?: string;
  naicsCode?: string;
  agency?: string;
  placeOfPerformanceState?: string;
  valueMin?: number;
  valueMax?: number;
}

export interface FpdsSearchResult {
  entries: FpdsAwardEntry[];
  degraded: boolean;
  degradedReason?: string;
}

function getBaseUrl(): string {
  return process.env['FPDS_API_BASE_URL'] || DEFAULT_BASE_URL;
}

function buildQueryString(params: FpdsSearchParams): string {
  const parts: string[] = [];

  if (params.solicitationId) {
    parts.push(`SOLICITATION_ID:"${params.solicitationId}"`);
  }
  if (params.naicsCode) {
    parts.push(`NAICS:"${params.naicsCode}"`);
  }
  if (params.agency) {
    parts.push(`CONTRACTING_AGENCY_NAME:"${params.agency}"`);
  }
  if (params.placeOfPerformanceState) {
    parts.push(`PRINCIPAL_PLACE_OF_PERFORMANCE_STATE_CODE:"${params.placeOfPerformanceState}"`);
  }
  if (params.valueMin != null && params.valueMax != null) {
    parts.push(`DOLLARS_OBLIGATED:[${params.valueMin} TO ${params.valueMax}]`);
  }

  return parts.join(' ');
}

async function fetchWithRetry(url: string): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      logger.warn({ attempt, delay, source: 'fpds' }, 'fpds_retry');
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const { statusCode, body } = await request(url, {
        method: 'GET',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (statusCode === 429 || statusCode >= 500) {
        const text = await body.text().catch(() => '');
        lastError = new Error(`FPDS API ${statusCode}: ${text.slice(0, 300)}`);
        continue;
      }

      if (statusCode !== 200) {
        const text = await body.text().catch(() => '');
        throw new Error(`FPDS API ${statusCode}: ${text.slice(0, 300)}`);
      }

      return await body.text();
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes('FPDS API 4') &&
        !err.message.includes('FPDS API 429')
      ) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('FPDS API: max retries exhausted');
}

/**
 * Search FPDS for awards matching the given parameters.
 * Returns parsed entries sorted by period_of_performance_start descending (most recent first).
 */
export async function searchFpdsAwards(
  params: FpdsSearchParams,
): Promise<FpdsSearchResult> {
  const q = buildQueryString(params);
  if (!q) {
    return { entries: [], degraded: false };
  }

  const baseUrl = getBaseUrl();
  const url = `${baseUrl}?s=FPDS&templateName=1.5.3&indexName=awardfull&q=${encodeURIComponent(q)}&rss=1`;

  logger.info({ source: 'fpds', query: q, url }, 'fpds_search_start');

  try {
    const xml = await fetchWithRetry(url);
    const entries = parseFpdsAtomFeed(xml);

    // Sort by period_of_performance_start descending (most recent first)
    entries.sort((a, b) => {
      const dateA = a.periodOfPerformanceStart ? new Date(a.periodOfPerformanceStart).getTime() : 0;
      const dateB = b.periodOfPerformanceStart ? new Date(b.periodOfPerformanceStart).getTime() : 0;
      return dateB - dateA;
    });

    logger.info(
      { source: 'fpds', results: entries.length, query: q },
      'fpds_search_complete',
    );

    return { entries, degraded: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Rate limited — signal to caller
    if (msg.includes('429') || msg.includes('503')) {
      return {
        entries: [],
        degraded: true,
        degradedReason: `rate_limited: ${msg}`,
      };
    }

    logger.error({ source: 'fpds', error: msg, query: q }, 'fpds_search_error');
    return {
      entries: [],
      degraded: true,
      degradedReason: msg,
    };
  }
}
