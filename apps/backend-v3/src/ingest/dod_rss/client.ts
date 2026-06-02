/**
 * DoD contract announcements RSS client — fetches the daily contract
 * roll-up feed from war.gov. XML over undici, regex-parsed.
 * No API key required; browser-style User-Agent is mandatory.
 */

import { request } from 'undici';
import { logger } from '../../lib/logger.js';
import type { DoDRSSItemRaw } from './types.js';

const FEED_BASE =
  'https://www.war.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=400&Site=945';

const MAX_ITEMS = 30;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2_000;

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/* ------------------------------------------------------------------ */
/*  XML entity decoder (minimal, no external dep)                      */
/* ------------------------------------------------------------------ */

const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

function decodeXmlEntities(s: string): string {
  return s.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, (m) => XML_ENTITIES[m] ?? m);
}

/* ------------------------------------------------------------------ */
/*  Regex RSS parser                                                   */
/* ------------------------------------------------------------------ */

function extractTag(block: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = re.exec(block);
  if (!m) return undefined;
  return decodeXmlEntities(m[1].trim());
}

function parseItems(xml: string): DoDRSSItemRaw[] {
  const items: DoDRSSItemRaw[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1];
    items.push({
      title: extractTag(block, 'title'),
      link: extractTag(block, 'link'),
      description: extractTag(block, 'description'),
      pubDate: extractTag(block, 'pubDate'),
      creator: extractTag(block, 'dc:creator'),
      guid: extractTag(block, 'guid'),
    });
  }

  return items;
}

/* ------------------------------------------------------------------ */
/*  HTTP fetch with retry                                              */
/* ------------------------------------------------------------------ */

async function fetchWithRetry(url: string): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      logger.warn(
        { attempt, delay, source: 'dod_rss' },
        'dod_rss_retry',
      );
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const { statusCode, body: respBody } = await request(url, {
        method: 'GET',
        headers: {
          'user-agent': BROWSER_UA,
          accept: 'application/rss+xml, application/xml, text/xml',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (statusCode === 429 || statusCode >= 500) {
        const text = await respBody.text().catch(() => '');
        lastError = new Error(
          `DoD RSS ${statusCode}: ${text.slice(0, 300)}`,
        );
        continue;
      }

      if (statusCode !== 200) {
        const text = await respBody.text().catch(() => '');
        throw new Error(
          `DoD RSS ${statusCode}: ${text.slice(0, 300)}`,
        );
      }

      return await respBody.text();
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('DoD RSS 4') &&
          !err.message.includes('DoD RSS 429'))
      ) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('DoD RSS: max retries exhausted');
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export async function fetchDoDContractsRSS(
  max: number = MAX_ITEMS,
): Promise<DoDRSSItemRaw[]> {
  const url = `${FEED_BASE}&max=${max}`;

  logger.info(
    { source: 'dod_rss', url },
    'dod_rss_ingest_fetch',
  );

  const xml = await fetchWithRetry(url);
  const items = parseItems(xml);

  logger.info(
    { source: 'dod_rss', count: items.length },
    'dod_rss_ingest_page',
  );

  return items;
}
