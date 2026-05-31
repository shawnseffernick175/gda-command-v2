/**
 * NECO (Navy Electronic Commerce Online) HTTP client.
 * Fetches RFQ listing via search form POST — no public API.
 */

import { request } from 'undici';
import { logger } from '../../lib/logger.js';

const NECO_BASE = 'https://www.neco.navy.mil';
const NECO_SEARCH_PATH = '/synopsis/search.aspx';
const USER_AGENT = 'GDA-Ingest/1.0 (+contact: shawn.seffernick175@gmail.com)';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1_000;

async function fetchWithRetry(
  url: string,
  options: { method: 'GET' | 'POST'; body?: string; contentType?: string },
): Promise<string> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const headers: Record<string, string> = {
        'User-Agent': USER_AGENT,
        Accept: 'text/html',
      };
      if (options.contentType) {
        headers['Content-Type'] = options.contentType;
      }

      const { statusCode, body: respBody } = await request(url, {
        method: options.method,
        headers,
        body: options.body,
        headersTimeout: REQUEST_TIMEOUT_MS,
        bodyTimeout: REQUEST_TIMEOUT_MS,
      });

      const text = await respBody.text();

      if (statusCode === 429 || statusCode >= 500) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        logger.warn(
          { source: 'neco', statusCode, attempt, delayMs: delay },
          'neco_fetch_retry',
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (statusCode !== 200) {
        throw new Error(`NECO HTTP ${statusCode}: ${text.slice(0, 300)}`);
      }

      return text;
    } catch (err) {
      if (attempt === MAX_RETRIES - 1) throw err;
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      logger.warn(
        {
          source: 'neco',
          attempt,
          delayMs: delay,
          error: err instanceof Error ? err.message : String(err),
        },
        'neco_fetch_retry',
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('NECO fetch exhausted retries');
}

export async function fetchNECOSearchPage(): Promise<string> {
  const url = `${NECO_BASE}${NECO_SEARCH_PATH}`;
  logger.info({ source: 'neco', url }, 'neco_fetch_search');
  return fetchWithRetry(url, { method: 'GET' });
}

export async function fetchNECOSearchResults(formBody: string): Promise<string> {
  const url = `${NECO_BASE}${NECO_SEARCH_PATH}`;
  logger.info({ source: 'neco', url }, 'neco_fetch_results');
  return fetchWithRetry(url, {
    method: 'POST',
    body: formBody,
    contentType: 'application/x-www-form-urlencoded',
  });
}

export async function fetchNECODetailPage(relativeUrl: string): Promise<string> {
  const url = relativeUrl.startsWith('http')
    ? relativeUrl
    : `${NECO_BASE}${relativeUrl}`;
  logger.info({ source: 'neco', url }, 'neco_fetch_detail');
  return fetchWithRetry(url, { method: 'GET' });
}

export function saveDebugHtml(html: string, filename: string): void {
  if (process.env.INGEST_DEBUG !== '1') return;

  import('node:fs').then((fs) => {
    import('node:path').then((path) => {
      const dir = '/tmp/ingest-debug';
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, filename), html, 'utf-8');
      logger.info({ source: 'neco', filename }, 'neco_debug_html_saved');
    }).catch(() => { /* non-critical */ });
  }).catch(() => { /* non-critical */ });
}

export { NECO_BASE };
