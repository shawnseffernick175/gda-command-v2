/**
 * DIBBS (DLA Internet Bid Board System) HTTP client.
 * Fetches RFQ listing pages via HTML scraping — no public API.
 */

import { request } from 'undici';
import { logger } from '../../lib/logger.js';

const DIBBS_BASE = 'https://www.dibbs.bsm.dla.mil';
const DIBBS_SEARCH_PATH = '/RFQ/RfqRec_SearchResult.aspx';
const USER_AGENT = 'GDA-Ingest/1.0 (+contact: shawn.seffernick175@gmail.com)';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1_000;

export interface DIBBSFetchOptions {
  lookbackHours: number;
}

async function fetchWithRetry(url: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const { statusCode, body } = await request(url, {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html',
        },
        headersTimeout: REQUEST_TIMEOUT_MS,
        bodyTimeout: REQUEST_TIMEOUT_MS,
      });

      const text = await body.text();

      if (statusCode === 429 || statusCode >= 500) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        logger.warn(
          { source: 'dibbs', statusCode, attempt, delayMs: delay },
          'dibbs_fetch_retry',
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (statusCode !== 200) {
        throw new Error(`DIBBS HTTP ${statusCode}: ${text.slice(0, 300)}`);
      }

      return text;
    } catch (err) {
      if (attempt === MAX_RETRIES - 1) throw err;
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      logger.warn(
        {
          source: 'dibbs',
          attempt,
          delayMs: delay,
          error: err instanceof Error ? err.message : String(err),
        },
        'dibbs_fetch_retry',
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('DIBBS fetch exhausted retries');
}

export async function fetchDIBBSListingPage(): Promise<string> {
  const url = `${DIBBS_BASE}${DIBBS_SEARCH_PATH}`;
  logger.info({ source: 'dibbs', url }, 'dibbs_fetch_listing');
  return fetchWithRetry(url);
}

export async function fetchDIBBSDetailPage(relativeUrl: string): Promise<string> {
  const url = relativeUrl.startsWith('http')
    ? relativeUrl
    : `${DIBBS_BASE}${relativeUrl}`;
  logger.info({ source: 'dibbs', url }, 'dibbs_fetch_detail');
  return fetchWithRetry(url);
}

export function saveDebugHtml(html: string, filename: string): void {
  if (process.env.INGEST_DEBUG !== '1') return;

  import('node:fs').then((fs) => {
    import('node:path').then((path) => {
      const dir = '/tmp/ingest-debug';
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, filename), html, 'utf-8');
      logger.info({ source: 'dibbs', filename }, 'dibbs_debug_html_saved');
    }).catch(() => { /* non-critical */ });
  }).catch(() => { /* non-critical */ });
}

export { DIBBS_BASE };
