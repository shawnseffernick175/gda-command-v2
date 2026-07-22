/**
 * DSIP (DoD SBIR/STTR Innovation Portal) API client — fetches open +
 * pre-release topics from dodsbirsttr.mil, enriches each with detail
 * data. Resilient: per-request timeout, retry with exponential backoff
 * on 429/5xx/timeout.
 *
 * The DSIP search endpoint accepts a JSON-encoded `searchParam` query
 * parameter with `solicitationCycleNames: ["openTopics"]` and
 * `topicReleaseStatus: [591, 592]` to filter to open + pre-release
 * topics. Pagination uses `size` (page size) and `page` (0-based).
 */

import { request } from 'undici';
import { logger } from '../../lib/logger.js';
import { envStr, envInt } from '../../lib/env.js';
import type {
  DSIPTopicListItem,
  DSIPTopicDetail,
  DSIPSearchResponse,
  DSIPEnrichedTopic,
} from './types.js';

const DEFAULT_BASE_URL = 'https://www.dodsbirsttr.mil/topics/api/public';

const BASE_URL = envStr('SBIR_DSIP_BASE_URL', DEFAULT_BASE_URL);
const REQUEST_TIMEOUT_MS = envInt('SBIR_REQUEST_TIMEOUT_MS', 60000);
const MAX_RETRIES = envInt('SBIR_MAX_RETRIES', 3);
const INITIAL_BACKOFF_MS = 2_000;
const PAGE_SIZE = 50;
const DETAIL_DELAY_MS = 300;
const MAX_TOPICS = 500;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; GDA-Ingest/1.0)',
  'Accept': 'application/json',
};

/** Defense/R&D-relevant keyword set for tagging matched topics. */
export const SBIR_KEYWORDS: readonly string[] = [
  'artificial intelligence',
  'machine learning',
  'autonomy',
  'cybersecurity',
  'hypersonics',
  'quantum',
  'directed energy',
  'microelectronics',
] as const;

/**
 * Build the searchParam JSON for the DSIP search endpoint.
 * Filters to open + pre-release topics only.
 */
function buildSearchParam(): string {
  return JSON.stringify({
    searchText: null,
    components: null,
    programYear: null,
    solicitationCycleNames: ['openTopics'],
    releaseNumbers: [],
    topicReleaseStatus: [591, 592],
    modernizationPriorities: null,
    sortBy: 'finalTopicCode,asc',
  });
}

async function fetchWithRetry<T>(url: string, label: string): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      logger.warn(
        { attempt, delay, source: 'sbir', label },
        'sbir_retry',
      );
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const { statusCode, body: respBody } = await request(url, {
        method: 'GET',
        headers: HEADERS,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (statusCode === 429 || statusCode >= 500) {
        const text = await respBody.text().catch(() => '');
        lastError = new Error(
          `DSIP API ${statusCode}: ${text.slice(0, 300)}`,
        );
        continue;
      }

      if (statusCode !== 200) {
        const text = await respBody.text().catch(() => '');
        throw new Error(
          `DSIP API ${statusCode}: ${text.slice(0, 300)}`,
        );
      }

      return (await respBody.json()) as T;
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.startsWith('DSIP API 4') &&
        !err.message.includes('DSIP API 429')
      ) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('DSIP API: max retries exhausted');
}

/**
 * Fetch all open + pre-release DSIP topics with pagination.
 */
export async function fetchDSIPTopics(
  limit?: number,
): Promise<DSIPTopicListItem[]> {
  const cap = limit ?? MAX_TOPICS;
  const searchParam = encodeURIComponent(buildSearchParam());
  const allTopics: DSIPTopicListItem[] = [];
  let page = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = `${BASE_URL}/topics/search?searchParam=${searchParam}&size=${PAGE_SIZE}&page=${page}`;

    logger.info(
      { source: 'sbir', page, size: PAGE_SIZE },
      'sbir_dsip_fetch_page',
    );

    const resp = await fetchWithRetry<DSIPSearchResponse>(url, 'search');
    const topics = resp.data ?? [];

    allTopics.push(...topics);

    logger.info(
      { source: 'sbir', page, fetched: topics.length, total: allTopics.length, apiTotal: resp.total },
      'sbir_dsip_page_result',
    );

    if (topics.length < PAGE_SIZE || allTopics.length >= cap) break;

    page++;
    await new Promise((r) => setTimeout(r, DETAIL_DELAY_MS));
  }

  return allTopics.slice(0, cap);
}

/**
 * Fetch detail for a single topic. Returns null on error (non-fatal).
 */
export async function fetchDSIPTopicDetail(
  topicId: string,
): Promise<DSIPTopicDetail | null> {
  const url = `${BASE_URL}/topics/${encodeURIComponent(topicId)}/details`;

  try {
    return await fetchWithRetry<DSIPTopicDetail>(url, `detail:${topicId}`);
  } catch (err) {
    logger.warn(
      {
        source: 'sbir',
        topicId,
        error: err instanceof Error ? err.message : String(err),
      },
      'sbir_dsip_detail_error',
    );
    return null;
  }
}

/**
 * Fetch open + pre-release topics and enrich each with detail data.
 */
export async function fetchEnrichedTopics(
  limit?: number,
): Promise<DSIPEnrichedTopic[]> {
  const topics = await fetchDSIPTopics(limit);

  logger.info(
    { source: 'sbir', topicCount: topics.length },
    'sbir_dsip_enriching_details',
  );

  const enriched: DSIPEnrichedTopic[] = [];

  for (const topic of topics) {
    const detail = await fetchDSIPTopicDetail(topic.topicId);
    enriched.push({ list: topic, detail });
    await new Promise((r) => setTimeout(r, DETAIL_DELAY_MS));
  }

  return enriched;
}
