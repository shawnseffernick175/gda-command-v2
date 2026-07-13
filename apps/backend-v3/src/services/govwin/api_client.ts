/**
 * GovWin IQ data client — the single import surface used by ingest,
 * adapters, enrichment and routes.
 *
 * P0 (#1099): dispatches on GOVWIN_AUTH_MODE (default 'cas'). In CAS mode the
 * calls delegate to `cas_client.ts` (JSESSIONID session cookie against the NEO
 * portal). In 'oauth2' mode they use the official OAuth2 Web Services API at
 * services.govwin.com/neo-ws. The OAuth2 tier is not provisioned for this
 * account, so 'cas' is the default; flip GOVWIN_AUTH_MODE=oauth2 if it ever is.
 *
 * The OAuth2 path enforces a configurable daily download cap
 * (GOVWIN_DAILY_LIMIT) and backs off cleanly on 429.
 */

import { getAccessToken, invalidateOAuth2Token } from './oauth2_auth.js';
import { isCasMode } from './mode.js';
import {
  discoverRecentOpportunitiesApiCas,
  fetchOpportunityByIdApiCas,
  fetchOpportunityDetailHtmlCas,
  searchBySolicitationNumberCas,
  searchByTitleAgencyCas,
} from './cas_client.js';
import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';

const API_BASE = process.env['GOVWIN_API_BASE'] ?? 'https://services.govwin.com/neo-ws';
const DAILY_LIMIT = parseInt(process.env['GOVWIN_DAILY_LIMIT'] ?? '200', 10);
const BACKOFF_429_MS = 60_000; // 1 min backoff on 429

/** Re-export the GovWinOpportunity shape unchanged so job.ts keeps working. */
export interface GovWinApiOpportunity {
  govwinId: string;
  title: string;
  agency: string | null;
  subAgency: string | null;
  solicitationNumber: string | null;
  status: string | null;
  naics: string | null;
  setAside: string | null;
  incumbent: string | null;
  competitors: string[];
  valueMin: number | null;
  valueMax: number | null;
  responseDueAt: string | null;
  postedAt: string | null;
  description: string | null;
  sourceUri: string;
}

/* ── Daily quota tracking ────────────────────────────────────────── */

let dailyCallCount = 0;
let dailyCountDate = '';

function resetDailyCountIfNeeded(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dailyCountDate) {
    dailyCallCount = 0;
    dailyCountDate = today;
  }
}

function isDailyLimitReached(): boolean {
  resetDailyCountIfNeeded();
  return dailyCallCount >= DAILY_LIMIT;
}

function incrementDailyCount(): void {
  resetDailyCountIfNeeded();
  dailyCallCount++;
}

export function getDailyCallCount(): number {
  resetDailyCountIfNeeded();
  return dailyCallCount;
}

export function getDailyLimit(): number {
  return DAILY_LIMIT;
}

/* ── HTTP helpers ────────────────────────────────────────────────── */

async function apiGet<T>(path: string): Promise<T> {
  if (isDailyLimitReached()) {
    throw new Error(
      `GovWin daily limit reached (${DAILY_LIMIT}). Skipping API call.`,
    );
  }

  const token = await getAccessToken();
  const url = `${API_BASE}${path}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (res.status === 429) {
    logger.warn(
      { path, dailyCount: dailyCallCount, dailyLimit: DAILY_LIMIT },
      'govwin_api_rate_limited',
    );
    await new Promise((r) => setTimeout(r, BACKOFF_429_MS));
    throw new Error('GovWin API rate limited (429). Backing off.');
  }

  if (res.status === 401) {
    invalidateOAuth2Token();
    throw new Error('GovWin API unauthorized (401). Token invalidated.');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GovWin API error: ${res.status} ${text.slice(0, 200)}`);
  }

  incrementDailyCount();
  return (await res.json()) as T;
}

/* ── Typed API calls ─────────────────────────────────────────────── */

interface GovWinSearchResult {
  opportunities?: GovWinRawOpp[];
  results?: GovWinRawOpp[];
  data?: GovWinRawOpp[];
  total?: number;
  page?: number;
  per_page?: number;
}

interface GovWinRawOpp {
  id?: string;
  govwin_id?: string;
  title?: string;
  agency?: string;
  agency_name?: string;
  sub_agency?: string;
  solicitation_number?: string;
  status?: string;
  state?: string;
  naics?: string;
  naics_code?: string;
  set_aside?: string;
  set_aside_type?: string;
  incumbent?: string;
  incumbent_name?: string;
  competitors?: string[];
  competitor_names?: string[];
  value_min?: number;
  value_max?: number;
  estimated_value_low?: number;
  estimated_value_high?: number;
  response_due_date?: string;
  due_date?: string;
  posted_date?: string;
  description?: string;
  url?: string;
  source_url?: string;
}

function mapRawToOpp(raw: GovWinRawOpp): GovWinApiOpportunity {
  const govwinId = raw.id ?? raw.govwin_id ?? '';
  return {
    govwinId,
    title: raw.title ?? 'Untitled GovWin Opportunity',
    agency: raw.agency ?? raw.agency_name ?? null,
    subAgency: raw.sub_agency ?? null,
    solicitationNumber: raw.solicitation_number ?? null,
    status: raw.status ?? raw.state ?? null,
    naics: raw.naics ?? raw.naics_code ?? null,
    setAside: raw.set_aside ?? raw.set_aside_type ?? null,
    incumbent: raw.incumbent ?? raw.incumbent_name ?? null,
    competitors: raw.competitors ?? raw.competitor_names ?? [],
    valueMin: raw.value_min ?? raw.estimated_value_low ?? null,
    valueMax: raw.value_max ?? raw.estimated_value_high ?? null,
    responseDueAt: raw.response_due_date ?? raw.due_date ?? null,
    postedAt: raw.posted_date ?? null,
    description: raw.description ?? null,
    sourceUri: raw.url ?? raw.source_url ?? `https://iq.govwin.com/neo/opportunity/view/${govwinId}`,
  };
}

/**
 * Discover recently-modified opportunities via the Web Services API.
 */
export async function discoverRecentOpportunitiesApi(
  maxResults = 50,
): Promise<GovWinApiOpportunity[]> {
  if (isCasMode()) {
    return discoverRecentOpportunitiesApiCas(maxResults);
  }
  const data = await apiGet<GovWinSearchResult>(
    `/opportunities?sort=updatedDate&order=desc&max=${maxResults}&oppSelectionDateFrom=-30D`,
  );

  const rawItems = data.opportunities ?? data.results ?? data.data ?? [];
  return rawItems.map(mapRawToOpp);
}

/**
 * Fetch a single opportunity by GovWin ID.
 */
export async function fetchOpportunityByIdApi(
  govwinId: string,
): Promise<GovWinApiOpportunity | null> {
  if (isCasMode()) {
    const viaJson = await fetchOpportunityByIdApiCas(govwinId);
    if (viaJson) return viaJson;
    return fetchOpportunityDetailHtmlCas(govwinId);
  }
  try {
    const raw = await apiGet<GovWinRawOpp>(`/opportunities/${govwinId}`);
    return mapRawToOpp(raw);
  } catch (err) {
    logger.warn(
      { govwinId, error: err instanceof Error ? err.message : String(err) },
      'govwin_api_fetch_opp_error',
    );
    return null;
  }
}

/**
 * Search for an opportunity by solicitation number.
 * Returns the first match or null.
 */
export async function searchBySolicitationNumber(
  solNumber: string,
): Promise<GovWinApiOpportunity | null> {
  if (isCasMode()) {
    return searchBySolicitationNumberCas(solNumber);
  }
  try {
    const data = await apiGet<GovWinSearchResult>(
      `/opportunities?solicitationNumber=${encodeURIComponent(solNumber)}&max=5`,
    );
    const rawItems = data.opportunities ?? data.results ?? data.data ?? [];
    if (rawItems.length === 0) return null;
    return mapRawToOpp(rawItems[0]!);
  } catch (err) {
    logger.warn(
      { solNumber, error: err instanceof Error ? err.message : String(err) },
      'govwin_api_search_sol_error',
    );
    return null;
  }
}

/**
 * Search for an opportunity by title + agency fuzzy match.
 * Returns the first match or null.
 */
export async function searchByTitleAgency(
  title: string,
  agency: string | null,
): Promise<GovWinApiOpportunity | null> {
  if (isCasMode()) {
    return searchByTitleAgencyCas(title, agency);
  }
  try {
    const q = agency ? `${title} ${agency}` : title;
    const data = await apiGet<GovWinSearchResult>(
      `/opportunities?q=${encodeURIComponent(q.slice(0, 200))}&max=5`,
    );
    const rawItems = data.opportunities ?? data.results ?? data.data ?? [];
    if (rawItems.length === 0) return null;
    return mapRawToOpp(rawItems[0]!);
  } catch (err) {
    logger.warn(
      { title, agency, error: err instanceof Error ? err.message : String(err) },
      'govwin_api_search_title_error',
    );
    return null;
  }
}

/**
 * Log remaining daily quota for observability.
 */
export function logQuotaStatus(): void {
  resetDailyCountIfNeeded();
  logger.info(
    {
      dailyUsed: dailyCallCount,
      dailyLimit: DAILY_LIMIT,
      remaining: Math.max(0, DAILY_LIMIT - dailyCallCount),
    },
    'govwin_api_quota_status',
  );
}
