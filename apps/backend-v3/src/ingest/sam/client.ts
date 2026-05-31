/**
 * SAM.gov Opportunities API v2 client for the ingest framework.
 * Provides a framework-specific interface for paginated fetching.
 */

import { logger } from '../../lib/logger.js';
import type { SAMOpportunityRaw, SAMSearchResponse } from './types.js';

export type { SAMOpportunityRaw };

const SAM_API_BASE = 'https://api.sam.gov/opportunities/v2/search';
const PAGE_SIZE = 1000;
const REQUEST_DELAY_MS = 500;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_PAGES = 20;

export function getSAMApiKey(): string {
  const key = process.env.SAM_GOV_API_KEY ?? process.env.SAM_API_KEY;
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

    const resp = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`SAM API ${resp.status}: ${text.slice(0, 300)}`);
    }

    const data = (await resp.json()) as SAMSearchResponse;
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
