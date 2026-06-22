/**
 * GovCon News Ingestion Service — F-611
 *
 * Fetches articles from public GovCon sources, filters to Envision's
 * wheelhouse, and upserts into the news_items table. Sources:
 *   1. OrangeSlices WordPress REST API (primary)
 *   2. Federal News Network RSS (backup)
 *   3. GovConWire RSS (backup)
 *
 * Wheelhouse filter: matches title+blurb against a keyword/agency list
 * plus the 16 Envision NAICS context. If filtering leaves <3 items,
 * relaxes to top recent items so the feed is never empty.
 */

import type pg from 'pg';
import { logger } from '../../lib/logger.js';

// ─── Wheelhouse keywords ────────────────────────────────────────────

const WHEELHOUSE_KEYWORDS = [
  'it services', 'software', 'cloud', 'cybersecurity', 'cyber security',
  'data analytics', 'servicenow', 'managed services', 'professional services',
  'agentic ai', 'modernization', 'digital transformation',
  'idiq', 'bpa', 'gwac', 'oasis', 'alliant', 'cms',
  'engineering services', 'systems engineering', 'devops', 'devsecops',
  'artificial intelligence', 'machine learning', 'zero trust',
  'information technology', 'logistics', 'sustainment',
  'c5isr', 'c4isr', 'training', 'simulation',
];

const WHEELHOUSE_AGENCIES = [
  'dod', 'army', 'navy', 'usaf', 'air force', 'dla', 'dcsa', 'defense',
  'hhs', 'cdc', 'fda', 'cms', 'nih', 'ihs',
  'opm', 'noaa', 'uspto', 'dhs', 'nasa',
  'gsa', 'va ', 'faa', 'uscg', 'coast guard',
  'pentagon', 'department of defense', 'tradoc', 'tacom',
];

function isWheelhouse(title: string, blurb: string): boolean {
  const text = `${title} ${blurb}`.toLowerCase();
  for (const kw of WHEELHOUSE_KEYWORDS) {
    if (text.includes(kw)) return true;
  }
  for (const ag of WHEELHOUSE_AGENCIES) {
    if (text.includes(ag)) return true;
  }
  return false;
}

// ─── Source fetchers ────────────────────────────────────────────────

interface RawNewsItem {
  title: string;
  blurb: string;
  url: string;
  source_name: string;
  published_at: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&[#\w]+;/g, ' ').trim();
}

function firstSentence(text: string): string {
  const clean = stripHtml(text);
  const match = clean.match(/^[^.!?]+[.!?]/);
  return match ? match[0].trim() : clean.slice(0, 200);
}

async function fetchOrangeSlices(): Promise<RawNewsItem[]> {
  const items: RawNewsItem[] = [];
  try {
    const url = 'https://orangeslices.ai/wp-json/wp/v2/posts?per_page=30&_fields=id,title,link,date,excerpt';
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { 'User-Agent': 'GDA-Command/3.0 (news-ingest)' },
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, '[news-ingest] OrangeSlices fetch failed');
      return items;
    }
    const posts = await res.json() as Array<{
      id: number;
      title: { rendered: string };
      link: string;
      date: string;
      excerpt: { rendered: string };
    }>;
    for (const p of posts) {
      items.push({
        title: stripHtml(p.title.rendered),
        blurb: firstSentence(p.excerpt.rendered),
        url: p.link,
        source_name: 'OrangeSlices',
        published_at: new Date(p.date).toISOString(),
      });
    }
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err) }, '[news-ingest] OrangeSlices error');
  }
  return items;
}

function parseRssItems(xml: string, sourceName: string): RawNewsItem[] {
  const items: RawNewsItem[] = [];
  const itemBlocks = xml.split('<item>').slice(1);
  for (const block of itemBlocks) {
    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s);
    const linkMatch = block.match(/<link>\s*(.*?)\s*<\/link>/s);
    const descMatch = block.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/s);
    const dateMatch = block.match(/<pubDate>(.*?)<\/pubDate>/s);

    if (titleMatch && linkMatch) {
      const title = stripHtml(titleMatch[1] ?? '');
      const blurb = firstSentence(descMatch?.[1] ?? '');
      const url = (linkMatch[1] ?? '').trim();
      const published_at = dateMatch?.[1]
        ? new Date(dateMatch[1].trim()).toISOString()
        : new Date().toISOString();

      if (title && url) {
        items.push({ title, blurb, url, source_name: sourceName, published_at });
      }
    }
  }
  return items;
}

async function fetchRssFeed(feedUrl: string, sourceName: string): Promise<RawNewsItem[]> {
  try {
    const res = await fetch(feedUrl, {
      signal: AbortSignal.timeout(15_000),
      headers: { 'User-Agent': 'GDA-Command/3.0 (news-ingest)' },
    });
    if (!res.ok) {
      logger.warn({ status: res.status, source: sourceName }, '[news-ingest] RSS fetch failed');
      return [];
    }
    const xml = await res.text();
    return parseRssItems(xml, sourceName);
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err), source: sourceName }, '[news-ingest] RSS error');
    return [];
  }
}

// ─── Deduplication ──────────────────────────────────────────────────

function dedupeByUrl(items: RawNewsItem[]): RawNewsItem[] {
  const seen = new Set<string>();
  const result: RawNewsItem[] = [];
  for (const item of items) {
    const key = item.url.toLowerCase().replace(/\/$/, '');
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

// ─── Main ingest function ───────────────────────────────────────────

export interface NewsIngestResult {
  fetched: number;
  wheelhouse: number;
  upserted: number;
  sources_ok: string[];
  sources_failed: string[];
}

export async function ingestGovConNews(pool: pg.Pool): Promise<NewsIngestResult> {
  const sourcesOk: string[] = [];
  const sourcesFailed: string[] = [];

  // Fetch from all sources concurrently
  const [orangeSlices, fnn, gcw] = await Promise.all([
    fetchOrangeSlices(),
    fetchRssFeed('https://federalnewsnetwork.com/feed/', 'Federal News Network'),
    fetchRssFeed('https://www.govconwire.com/feed/', 'GovConWire'),
  ]);

  if (orangeSlices.length > 0) sourcesOk.push('OrangeSlices');
  else sourcesFailed.push('OrangeSlices');

  if (fnn.length > 0) sourcesOk.push('Federal News Network');
  else sourcesFailed.push('Federal News Network');

  if (gcw.length > 0) sourcesOk.push('GovConWire');
  else sourcesFailed.push('GovConWire');

  // Merge + dedupe + sort by date desc
  const allItems = dedupeByUrl([...orangeSlices, ...fnn, ...gcw]);
  allItems.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());

  // Tag wheelhouse
  for (const item of allItems) {
    (item as RawNewsItem & { is_wheelhouse: boolean }).is_wheelhouse = isWheelhouse(item.title, item.blurb);
  }

  // Upsert into news_items
  let upserted = 0;
  for (const item of allItems) {
    try {
      await pool.query(
        `INSERT INTO news_items (title, blurb, url, source_name, published_at, is_wheelhouse)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (url) DO UPDATE SET
           title = EXCLUDED.title,
           blurb = EXCLUDED.blurb,
           source_name = EXCLUDED.source_name,
           published_at = EXCLUDED.published_at,
           is_wheelhouse = EXCLUDED.is_wheelhouse`,
        [
          item.title.slice(0, 500),
          item.blurb.slice(0, 500),
          item.url,
          item.source_name,
          item.published_at,
          (item as RawNewsItem & { is_wheelhouse: boolean }).is_wheelhouse,
        ],
      );
      upserted++;
    } catch (err) {
      logger.warn({ url: item.url, error: err instanceof Error ? err.message : String(err) }, '[news-ingest] upsert failed');
    }
  }

  const wheelhouseCount = allItems.filter((i) => (i as RawNewsItem & { is_wheelhouse: boolean }).is_wheelhouse).length;

  return {
    fetched: allItems.length,
    wheelhouse: wheelhouseCount,
    upserted,
    sources_ok: sourcesOk,
    sources_failed: sourcesFailed,
  };
}
