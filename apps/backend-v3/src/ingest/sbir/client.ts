/**
 * SBIR.gov public API client — fetches DoD SBIR/STTR awards and
 * open solicitation topics. JSON via undici, paginated, rate-limit-aware.
 *
 * Rate-limit handling:
 *  - On 429, read Retry-After header (seconds); else exponential backoff from 30s.
 *  - Max 5 retries per request. After exhaustion, return what we have (degraded).
 *  - Minimum 1-second pacing between consecutive requests.
 */

import { request } from 'undici';
import { logger } from '../../lib/logger.js';

const BASE_URL = 'https://api.www.sbir.gov/public/api';
const PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 30_000;
const MIN_PACING_MS = parseInt(process.env.SBIR_INGEST_MIN_PACING_MS ?? '1000', 10);

const HEADERS = {
  'User-Agent': 'GDA-Ingest/1.0 (+contact: shawn.seffernick175@gmail.com)',
  'Accept': 'application/json',
};

export interface SBIRAwardRaw {
  award_number?: string;
  agency?: string;
  branch?: string;
  program?: string;
  phase?: string;
  award_year?: number;
  firm?: string;
  duns?: string;
  uei?: string;
  city?: string;
  state?: string;
  zip?: string;
  pi?: string;
  ri?: string;
  award_title?: string;
  award_abstract?: string;
  award_amount?: number;
  contract?: string;
  proposal_number?: string;
  topic_code?: string;
  solicitation_number?: string;
  award_start_date?: string;
  award_end_date?: string;
  sbir_url?: string;
  [key: string]: unknown;
}

export interface SBIRTopicRaw {
  topic_number?: string;
  solicitation_number?: string;
  agency?: string;
  branch?: string;
  program?: string;
  phase?: string;
  topic_title?: string;
  description?: string;
  technology_areas?: string[];
  open_date?: string;
  close_date?: string;
  pre_release_date?: string;
  url?: string;
  status?: string;
  [key: string]: unknown;
}

interface FetchState {
  degraded: boolean;
  degradedReason?: string;
}

let lastRequestTime = 0;

async function paceRequest(): Promise<void> {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < MIN_PACING_MS) {
    await new Promise((r) => setTimeout(r, MIN_PACING_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

async function fetchWithRetry(
  url: string,
  state: FetchState,
): Promise<unknown | null> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      logger.warn(
        { attempt, delay, source: 'sbir', url },
        'sbir_retry',
      );
      await new Promise((r) => setTimeout(r, delay));
    }

    await paceRequest();

    try {
      const { statusCode, headers, body: respBody } = await request(url, {
        method: 'GET',
        headers: HEADERS,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (statusCode === 429) {
        const retryAfterRaw = headers['retry-after'];
        const retryAfterStr = Array.isArray(retryAfterRaw) ? retryAfterRaw[0] : retryAfterRaw;
        if (retryAfterStr) {
          const secs = parseInt(retryAfterStr, 10);
          if (!isNaN(secs) && secs > 0) {
            logger.warn(
              { retryAfterSecs: secs, source: 'sbir' },
              'sbir_429_retry_after',
            );
            await new Promise((r) => setTimeout(r, secs * 1000));
          }
        }
        await respBody.text().catch(() => '');
        lastError = new Error(`SBIR.gov API 429: rate limited`);
        continue;
      }

      if (statusCode >= 500) {
        const text = await respBody.text().catch(() => '');
        lastError = new Error(`SBIR.gov API ${statusCode}: ${text.slice(0, 300)}`);
        continue;
      }

      if (statusCode !== 200) {
        const text = await respBody.text().catch(() => '');
        throw new Error(`SBIR.gov API ${statusCode}: ${text.slice(0, 300)}`);
      }

      const rawText = await respBody.text();
      try {
        return JSON.parse(rawText);
      } catch (parseErr) {
        logger.error(
          { source: 'sbir', url, error: parseErr instanceof Error ? parseErr.message : String(parseErr) },
          'sbir_json_parse_error',
        );
        return null;
      }
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.startsWith('SBIR.gov API 4') &&
        !err.message.includes('429')
      ) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  state.degraded = true;
  state.degradedReason = lastError?.message ?? 'Max retries exhausted';
  logger.error(
    { source: 'sbir', url, error: state.degradedReason },
    'sbir_fetch_exhausted',
  );
  return null;
}

/**
 * Fetch DoD SBIR/STTR awards for a specific year.
 * Paginated via `start` offset.
 */
export async function fetchSBIRAwards(
  year: number,
  state: FetchState,
): Promise<SBIRAwardRaw[]> {
  const allResults: SBIRAwardRaw[] = [];
  let start = 0;

  logger.info({ source: 'sbir', year }, 'sbir_awards_fetch_start');

  while (!state.degraded) {
    const url = `${BASE_URL}/awards?agency=DOD&year=${year}&start=${start}&rows=${PAGE_SIZE}`;
    const data = await fetchWithRetry(url, state);
    if (data === null) break;

    const records = Array.isArray(data) ? data as SBIRAwardRaw[] : [];
    if (records.length === 0) break;

    allResults.push(...records);
    logger.info(
      { source: 'sbir', year, start, fetched: records.length, total: allResults.length },
      'sbir_awards_page',
    );

    if (records.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }

  return allResults;
}

/**
 * Fetch currently open/pre-release DoD SBIR/STTR solicitation topics.
 * Paginated via `start` offset.
 */
export async function fetchSBIRTopics(
  state: FetchState,
): Promise<SBIRTopicRaw[]> {
  const allResults: SBIRTopicRaw[] = [];
  let start = 0;

  logger.info({ source: 'sbir' }, 'sbir_topics_fetch_start');

  while (!state.degraded) {
    const url = `${BASE_URL}/solicitations?agency=DOD&open=Y&start=${start}&rows=${PAGE_SIZE}`;
    const data = await fetchWithRetry(url, state);
    if (data === null) break;

    const records = Array.isArray(data) ? data as SBIRTopicRaw[] : [];
    if (records.length === 0) break;

    allResults.push(...records);
    logger.info(
      { source: 'sbir', start, fetched: records.length, total: allResults.length },
      'sbir_topics_page',
    );

    if (records.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }

  return allResults;
}

export function createFetchState(): FetchState {
  return { degraded: false };
}
