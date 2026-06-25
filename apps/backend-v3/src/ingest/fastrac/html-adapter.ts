/**
 * HTML page scraper adapter — polls innovation org web pages for
 * opportunity/signal listings when no structured API is available.
 *
 * Pattern C from the research file: "poll the HTML index page on the
 * documented cadence, extract the list of posts, follow each new link
 * to its detail page, parse."
 *
 * Uses cheerio (already in monorepo) for DOM parsing.
 */

import * as cheerio from 'cheerio';
import { logger } from '../../lib/logger.js';
import { inferHorizon, inferSignalType, extractMissionTags } from './normalize.js';
import { isCommoditySignal } from './commodity-filter.js';
import type { FasTracSignal, SourceConfig } from './types.js';

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 2_000;

async function fetchPage(url: string): Promise<string | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'GDA-Command/1.0 (signal-ingest)',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (resp.status === 404) {
        logger.warn({ url }, 'fastrac_html_404');
        return null;
      }
      if (!resp.ok) {
        if ((resp.status === 429 || resp.status >= 500) && attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, INITIAL_BACKOFF_MS * 2 ** attempt));
          continue;
        }
        logger.warn({ url, status: resp.status }, 'fastrac_html_fetch_failed');
        return null;
      }

      return await resp.text();
    } catch (err) {
      if (attempt >= MAX_RETRIES) {
        logger.error(
          { url, error: err instanceof Error ? err.message : String(err) },
          'fastrac_html_fetch_error',
        );
        return null;
      }
      await new Promise((r) => setTimeout(r, INITIAL_BACKOFF_MS * 2 ** attempt));
    }
  }
  return null;
}

function resolveUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

/**
 * Generic link extractor — finds all anchor tags with hrefs that
 * look like opportunity/solicitation detail pages.
 */
function extractLinks(html: string, baseUrl: string): Array<{ title: string; url: string }> {
  const $ = cheerio.load(html);
  const links: Array<{ title: string; url: string }> = [];
  const seen = new Set<string>();

  // Look for links that suggest opportunities/solicitations/programs
  $('a[href]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href') ?? '';
    const text = $el.text().trim();

    if (!text || text.length < 5 || text.length > 300) return;
    if (!href || href === '#' || href.startsWith('mailto:') || href.startsWith('javascript:')) return;

    const fullUrl = resolveUrl(href, baseUrl);
    if (seen.has(fullUrl)) return;
    seen.add(fullUrl);

    links.push({ title: text, url: fullUrl });
  });

  return links;
}

/**
 * Score a link to determine if it's likely a signal/opportunity.
 * Higher score = more likely to be relevant.
 */
function scoreLink(title: string, url: string): number {
  let score = 0;
  const lower = title.toLowerCase();
  const urlLower = url.toLowerCase();

  const signalTerms = [
    'sbir', 'sttr', 'baa', 'solicitation', 'opportunity', 'rfp', 'rfi',
    'challenge', 'prize', 'topic', 'cso', 'open call', 'announcement',
    'proposal', 'white paper', 'phase', 'program', 'funding',
  ];
  const noiseTerms = [
    'about', 'contact', 'login', 'privacy', 'terms', 'career',
    'news', 'press', 'blog', 'faq', 'help', 'home', 'menu',
    'facebook', 'twitter', 'linkedin', 'youtube', 'instagram',
  ];

  for (const t of signalTerms) {
    if (lower.includes(t) || urlLower.includes(t)) score += 2;
  }
  for (const t of noiseTerms) {
    if (lower.includes(t) || urlLower.includes(t)) score -= 3;
  }

  // Penalize very short titles (nav links)
  if (title.length < 15) score -= 2;

  return score;
}

/**
 * Scrape a source's HTML pages and extract plausible signals.
 * Only returns links that score above the relevance threshold.
 */
export async function fetchHTMLSignals(source: SourceConfig): Promise<FasTracSignal[]> {
  const signals: FasTracSignal[] = [];
  const urls = source.scrapeUrls ?? [];

  for (const pageUrl of urls) {
    const html = await fetchPage(pageUrl);
    if (!html) {
      logger.warn(
        { source: source.name, url: pageUrl },
        'fastrac_html_no_content',
      );
      continue;
    }

    const links = extractLinks(html, pageUrl);
    const scored = links
      .map((link) => ({ ...link, score: scoreLink(link.title, link.url) }))
      .filter((link) => link.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50); // cap at 50 signals per page

    let commodityRejected = 0;
    for (const link of scored) {
      // F-631: reject commodity/supply/facilities junk
      const filter = isCommoditySignal(link.title);
      if (filter.rejected) {
        commodityRejected++;
        continue;
      }

      const textBlob = link.title;
      const signal: FasTracSignal = {
        source: source.name,
        source_url: link.url,
        title: link.title,
        mission_tags: extractMissionTags(textBlob),
        horizon: inferHorizon(textBlob),
        signal_type: inferSignalType(textBlob),
        institution_type: source.institutionType,
        funding_mechanism: source.fundingMechanism,
        published_at: null,
        summary: null,
      };
      signals.push(signal);
    }

    if (commodityRejected > 0) {
      logger.debug(
        { source: source.name, url: pageUrl, commodityRejected },
        'fastrac_html_commodity_filtered',
      );
    }

    logger.info(
      { source: source.name, url: pageUrl, linksFound: links.length, signalsKept: scored.length - commodityRejected },
      'fastrac_html_scraped',
    );
  }

  return signals;
}
