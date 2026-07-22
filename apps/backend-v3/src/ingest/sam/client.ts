/**
 * SAM.gov Opportunities API v2 client for the ingest framework.
 * Provides a framework-specific interface for paginated fetching.
 *
 * Resilience: each page fetch is retried with exponential backoff on
 * timeout / 5xx / 429 so a single slow page does not abort the whole
 * run. Per-request timeout is configurable via SAM_REQUEST_TIMEOUT_MS
 * (default 120s — production peak-hour runs consistently had single pages
 * exceed the old 60s wall, failing all retries; observed run duration ~254s).
 */

import { logger } from '../../lib/logger.js';
import { envInt, envFirst } from '../../lib/env.js';
import type { SAMOpportunityRaw, SAMSearchResponse } from './types.js';

export type { SAMOpportunityRaw };

const SAM_API_BASE = 'https://api.sam.gov/opportunities/v2/search';
const PAGE_SIZE = 1000;
const REQUEST_DELAY_MS = 500;
const REQUEST_TIMEOUT_MS = envInt('SAM_REQUEST_TIMEOUT_MS', 120000);
const MAX_PAGES = 20;
const MAX_RETRIES = envInt('SAM_MAX_RETRIES', 3);
const INITIAL_BACKOFF_MS = 2_000;

export function getSAMApiKey(): string {
  const key = envFirst(['SAM_GOV_API_KEY', 'SAM_API_KEY']);
  if (!key) {
    throw new Error('SAM_GOV_API_KEY is not set — SAM ingest cannot run');
  }
  return key;
}

function toSAMDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Fetch one page with retry + exponential backoff. Retries on request
 * timeout (AbortError), network error, 429, and 5xx. Throws after the
 * final attempt so the caller can decide how to handle a hard failure.
 */
async function fetchPageWithRetry(url: string, page: number): Promise<SAMSearchResponse> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        if (isRetryableStatus(resp.status) && attempt < MAX_RETRIES) {
          const backoff = INITIAL_BACKOFF_MS * 2 ** attempt;
          logger.warn(
            { source: 'sam.gov', page, attempt, status: resp.status, backoffMs: backoff },
            'sam_ingest_page_retry',
          );
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        throw new Error(`SAM API ${resp.status}: ${text.slice(0, 300)}`);
      }

      return (await resp.json()) as SAMSearchResponse;
    } catch (err) {
      lastErr = err;
      const isTimeout =
        err instanceof Error &&
        (err.name === 'TimeoutError' || err.name === 'AbortError');
      // Retry on timeout / transient network errors; rethrow hard API errors immediately.
      const isHardApiError = err instanceof Error && err.message.startsWith('SAM API ');
      if (isHardApiError || attempt >= MAX_RETRIES) {
        throw err;
      }
      const backoff = INITIAL_BACKOFF_MS * 2 ** attempt;
      logger.warn(
        {
          source: 'sam.gov',
          page,
          attempt,
          backoffMs: backoff,
          timeout: isTimeout,
          error: err instanceof Error ? err.message : String(err),
        },
        'sam_ingest_page_retry',
      );
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Fetch all opportunities posted in the given window.
 * Paginates automatically. Rate-limits between pages.
 */
export async function fetchOpportunities(
  fromDate: Date,
  toDate: Date,
): Promise<SAMOpportunityRaw[]> {
  const apiKey = getSAMApiKey();
  const all: SAMOpportunityRaw[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(SAM_API_BASE);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('postedFrom', toSAMDate(fromDate));
    url.searchParams.set('postedTo', toSAMDate(toDate));
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('offset', String(page * PAGE_SIZE));

    logger.info(
      {
        source: 'sam.gov',
        page,
        offset: page * PAGE_SIZE,
        postedFrom: toSAMDate(fromDate),
        postedTo: toSAMDate(toDate),
      },
      'sam_ingest_fetch',
    );

    const data = await fetchPageWithRetry(url.toString(), page);
    const batch = data.opportunitiesData ?? [];

    if (batch.length > 0) {
      all.push(...batch);
    }

    logger.info(
      {
        source: 'sam.gov',
        page,
        returned: batch.length,
        totalSoFar: all.length,
        totalRecords: data.totalRecords,
      },
      'sam_ingest_page',
    );

    if (batch.length === 0 || all.length >= data.totalRecords) {
      break;
    }

    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  }

  return all;
}
