/**
 * GovWin IQ HTTP client — makes authenticated requests using
 * CAS session cookies obtained via the auth service.
 *
 * P0 (#1099): this HTML path backs the CAS session mode as a fallback for
 * opportunity detail parsing. Enabled whenever GOVWIN_AUTH_MODE=cas (default)
 * or GOVWIN_ALLOW_SCRAPE=true.
 */

import * as cheerio from 'cheerio';
import { authenticate, invalidateAuth } from './auth.js';
import { logger } from '../../lib/logger.js';
import { isCasMode } from './mode.js';

const IQ_BASE = 'https://iq.govwin.com';

function assertScrapeAllowed(): void {
  if (!isCasMode() && process.env['GOVWIN_ALLOW_SCRAPE'] !== 'true') {
    logger.error('govwin_scrape_blocked: GOVWIN_AUTH_MODE=oauth2 — CAS/HTML path disabled');
    throw new Error('GovWin CAS/HTML path disabled (GOVWIN_AUTH_MODE=oauth2).');
  }
}

export interface GovWinOpportunity {
  govwinId: string;
  title: string;
  agency: string | null;
  subAgency: string | null;
  solicitationNumber: string | null;
  status: string | null;
  valueMin: number | null;
  valueMax: number | null;
  naics: string | null;
  setAside: string | null;
  responseDueAt: string | null;
  postedAt: string | null;
  description: string | null;
  incumbent: string | null;
  competitors: string[];
  sourceUri: string;
  rawHtml: string;
}

function buildCookieHeader(cookies: string[]): string {
  return cookies
    .map((c) => c.split(';')[0])
    .join('; ');
}

async function fetchWithAuth(path: string): Promise<string> {
  assertScrapeAllowed();
  const cookies = await authenticate();
  const url = `${IQ_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      Cookie: buildCookieHeader(cookies),
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'manual',
  });

  if (res.status === 302 || res.status === 401 || res.status === 403) {
    invalidateAuth();
    const freshCookies = await authenticate();
    const retry = await fetch(url, {
      headers: {
        Cookie: buildCookieHeader(freshCookies),
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'manual',
    });
    if (retry.status >= 300) {
      throw new Error(`GovWin fetch failed after re-auth: HTTP ${retry.status} for ${path}`);
    }
    return retry.text();
  }

  if (!res.ok) {
    throw new Error(`GovWin fetch failed: HTTP ${res.status} for ${path}`);
  }
  return res.text();
}

function parseValue(text: string | undefined): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[$,K\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num * 1000;
}

function parseDate(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseOpportunityPage(html: string, govwinId: string): GovWinOpportunity {
  const $ = cheerio.load(html);

  const titleEl = $('h1').first();
  const rawTitle = titleEl.text().trim();
  const title = rawTitle
    .replace(/^Opp\s+\d+:\s*/i, '')
    .replace(/\s*\|\s*GovWin IQ$/i, '')
    .trim() || `GovWin Opp ${govwinId}`;

  const fieldMap: Record<string, string> = {};
  $('table tr, .field-row, .detail-row').each((_, el) => {
    const cells = $(el).find('td, th, .field-label, .field-value');
    if (cells.length >= 2) {
      const label = $(cells[0]).text().trim().toLowerCase();
      const value = $(cells[1]).text().trim();
      if (label && value) fieldMap[label] = value;
    }
  });

  const getText = (...keys: string[]): string | null => {
    for (const k of keys) {
      const val = fieldMap[k];
      if (val) return val;
    }
    return null;
  };

  const description =
    $('meta[name="description"]').attr('content')?.trim() ||
    $('.program-description, .opp-description, .description').first().text().trim() ||
    null;

  const incumbentText = getText('incumbent', 'incumbent / contractor', 'contractor');
  const competitors: string[] = [];
  $('.competitor-name, .competitor').each((_, el) => {
    const name = $(el).text().trim();
    if (name) competitors.push(name);
  });

  const valueText = getText('value', 'value (usd-$k)', 'contract value', 'estimated value');
  let valueMin: number | null = null;
  let valueMax: number | null = null;
  if (valueText) {
    const parts = valueText.split(/[-–]/);
    valueMin = parseValue(parts[0]);
    valueMax = parts.length > 1 ? parseValue(parts[1]) : valueMin;
  }

  return {
    govwinId,
    title,
    agency: getText('department', 'buying organization', 'agency'),
    subAgency: getText('sub-agency', 'buying org level 2'),
    solicitationNumber: getText('solicitation number', 'solicitation #', 'solicitation no.'),
    status: getText('status', 'opportunity status'),
    valueMin,
    valueMax,
    naics: getText('naics', 'naics code'),
    setAside: getText('set-aside', 'competition type', 'set aside'),
    responseDueAt: parseDate(getText('response date', 'response due', 'due date')),
    postedAt: parseDate(getText('solicitation date', 'posted date', 'created date')),
    description,
    incumbent: incumbentText,
    competitors,
    sourceUri: `${IQ_BASE}/neo/opportunity/view/${govwinId}`,
    rawHtml: html,
  };
}

export async function fetchOpportunityDetail(govwinId: string): Promise<GovWinOpportunity> {
  const html = await fetchWithAuth(`/neo/opportunity/view/${govwinId}`);
  return parseOpportunityPage(html, govwinId);
}

export async function discoverRecentOpportunityIds(
  maxPages: number = 5,
): Promise<string[]> {
  assertScrapeAllowed();
  const ids: string[] = [];

  try {
    const cookies = await authenticate();
    const searchBody = new URLSearchParams({
      q: '',
      searchType: 'opportunity',
    });

    const searchRes = await fetch(`${IQ_BASE}/neo/search/query`, {
      method: 'POST',
      headers: {
        Cookie: buildCookieHeader(cookies),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: searchBody.toString(),
      redirect: 'follow',
    });

    const searchHtml = await searchRes.text();
    const $ = cheerio.load(searchHtml);

    $('a[href*="/neo/opportunity/view/"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const match = href.match(/\/neo\/opportunity\/view\/(\d+)/);
      if (match?.[1] && !ids.includes(match[1])) {
        ids.push(match[1]);
      }
    });

    if (ids.length === 0) {
      logger.info('govwin_discover_no_ids_from_search');
    }
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'govwin_discover_search_failed',
    );
  }

  return ids.slice(0, maxPages * 25);
}

export async function fetchOpportunityBatch(
  govwinIds: string[],
): Promise<GovWinOpportunity[]> {
  const results: GovWinOpportunity[] = [];
  for (const id of govwinIds) {
    try {
      const opp = await fetchOpportunityDetail(id);
      results.push(opp);
    } catch (err) {
      logger.warn(
        { govwinId: id, error: err instanceof Error ? err.message : String(err) },
        'govwin_fetch_opp_failed',
      );
    }
  }
  return results;
}
