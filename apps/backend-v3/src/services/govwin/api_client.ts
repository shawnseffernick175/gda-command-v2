/**
 * GovWin IQ data client — the single import surface used by ingest,
 * adapters, enrichment and routes.
 *
 * OAuth2 path targets Deltek's GovWin Web Services API V3 (`/neo-ws`). The
 * field mapping follows the Deltek WSAPI V3 Quick Reference (March 2025): the
 * opportunity object exposes `id`, `iqOppId`, `title`, `status`, `oppValue`
 * (a String), `primaryNAICS`, `solicitationDate`, `updateDate`, `govEntity`,
 * etc. Incumbent / competitors are NOT fields on the opportunity object — they
 * are fetched from the `/opportunities/{id}/companies` and
 * `/opportunities/{id}/contracts` sub-endpoints, linked via `links.*.href`.
 *
 * Rate limit: the WSAPI cap is 4,000 calls/HOUR org-wide (rolling 60-min
 * window), NOT 200/day. This client enforces a configurable hourly ceiling
 * (GOVWIN_HOURLY_LIMIT, default 3500) and backs off on 429 (honouring
 * Retry-After) instead of aborting a run.
 *
 * P0 (#1099): dispatches on GOVWIN_AUTH_MODE (default 'cas'). In CAS mode the
 * calls delegate to `cas_client.ts` (JSESSIONID session cookie against the NEO
 * portal). In 'oauth2' mode they use the official V3 Web Services API.
 */

import { getAccessToken, invalidateOAuth2Token } from './oauth2_auth.js';
import { isCasMode } from './mode.js';
import {
  discoverRecentOpportunitiesApiCas,
  fetchOpportunityByIdApiCas,
  fetchOpportunityDetailHtmlCas,
  fetchOpportunitySubEndpointCas,
} from './cas_client.js';
import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { evaluateRelevance } from '../../constants/relevance.js';
import { ENVISION_NAICS } from '../../constants/envision-naics.js';

const API_BASE = process.env['GOVWIN_API_BASE'] ?? 'https://services.govwin.com/neo-ws';
/** WSAPI org-wide rolling hourly cap. Default 3,500 (safety margin under 4,000). */
const HOURLY_LIMIT = parseInt(process.env['GOVWIN_HOURLY_LIMIT'] ?? '3500', 10);
const HOUR_MS = 3_600_000;
const DEFAULT_BACKOFF_MS = 60_000;
/** Max attempts for a single request before surfacing the rate-limit error. */
const MAX_RATE_LIMIT_RETRIES = 3;
/** WSAPI search rejects max > 100. */
const MAX_SEARCH_PAGE = 100;
/** Bounded concurrency for per-opportunity enrichment fetches. */
const DETAIL_CONCURRENCY = 4;

/**
 * Deltek WSAPI V3 discovery parameters (Quick Reference p22-26).
 *
 * - `oppType=OPP` restricts to GovWin-analyst-Tracked Opps (the high-value
 *   forecast/pre-RFP intel we want), NOT the FBO/SAM firehose or commodity parts.
 * - `naics` is a comma-delimited begins-with filter; we derive it from the same
 *   ENVISION_NAICS set the relevance engine uses (numeric codes only — the GSA
 *   MAS SINs like 54151S/54151HACS are not NAICS values).
 * - `sort` value MUST be `updatedDate` (with the "d"); Deltek rejects
 *   `updateDate` with a 422 even though the response FIELD is `updateDate`.
 * - `oppCategory=2` = New and Update (default) so updates are captured.
 */
const DISCOVERY_OPP_TYPE = 'OPP';
const DISCOVERY_OPP_CATEGORY = '2';
/**
 * Relative window for the 6-hourly cron. `-12H` overlaps two runs so nothing is
 * missed. For a full backfill set GOVWIN_OPP_SELECTION_DATE_FROM=01/01/1900.
 */
const DISCOVERY_DATE_FROM = process.env['GOVWIN_OPP_SELECTION_DATE_FROM'] ?? '-12H';
/** Bound the paging loop so a run can never fan out unbounded. */
const MAX_DISCOVERY_PAGES = parseInt(process.env['GOVWIN_MAX_DISCOVERY_PAGES'] ?? '5', 10);

/**
 * Envision NAICS codes usable as a GovWin `naics` filter. GovWin accepts full or
 * partial (begins-with) numeric codes; the GSA MAS SINs (54151S, 54151HACS) are
 * not NAICS numbers and are excluded.
 */
const ENVISION_NAICS_CSV = ENVISION_NAICS.filter((c) => /^\d+$/.test(c)).join(',');

/** Build the Deltek V3 discovery query for a single page. */
function buildDiscoveryPath(pageSize: number, offset: number, dateFrom: string): string {
  const params = new URLSearchParams({
    oppType: DISCOVERY_OPP_TYPE,
    naics: ENVISION_NAICS_CSV,
    sort: 'updatedDate',
    order: 'desc',
    max: String(pageSize),
    offset: String(offset),
    oppSelectionDateFrom: dateFrom,
    oppCategory: DISCOVERY_OPP_CATEGORY,
  });
  return `/opportunities?${params.toString()}`;
}

/** Links to the opportunity sub-endpoints (companies/contracts/contacts). */
export interface GovWinOppLinks {
  companies: string | null;
  contracts: string | null;
  contacts: string | null;
}

/** The GovWinOpportunity shape consumed by job.ts, adapters and enrichment. */
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
  /** Raw `oppValue` string as returned by GovWin (may be a range or text). */
  valueRaw?: string | null;
  responseDueAt: string | null;
  postedAt: string | null;
  description: string | null;
  sourceUri: string;
  /** ISO `updateDate` — used to skip re-enriching unchanged opportunities. */
  updateDate?: string | null;
  createdDate?: string | null;
  links?: GovWinOppLinks;
}

/* ── Hourly rolling rate limiter ─────────────────────────────────── */

/** Timestamps (ms) of API calls made in the current rolling hour. */
let callTimestamps: number[] = [];

function pruneOldCalls(now = Date.now()): void {
  const cutoff = now - HOUR_MS;
  callTimestamps = callTimestamps.filter((t) => t > cutoff);
}

export function getCallsThisHour(): number {
  pruneOldCalls();
  return callTimestamps.length;
}

export function getHourlyLimit(): number {
  return HOURLY_LIMIT;
}

function isHourlyLimitReached(): boolean {
  return getCallsThisHour() >= HOURLY_LIMIT;
}

/** Milliseconds until the oldest in-window call ages out, freeing a slot. */
function msUntilSlotFree(now = Date.now()): number {
  pruneOldCalls(now);
  if (callTimestamps.length < HOURLY_LIMIT) return 0;
  const oldest = callTimestamps[0]!;
  return Math.max(0, oldest + HOUR_MS - now);
}

/** Test-only: reset the in-memory rate-limiter window. */
export function __resetRateLimiterForTest(): void {
  callTimestamps = [];
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Parse a Retry-After header (seconds or HTTP-date) into milliseconds. */
function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

/* ── HTTP helper ─────────────────────────────────────────────────── */

async function apiGet<T>(path: string, attempt = 0): Promise<T> {
  // Proactive hourly limiter: wait for a slot rather than aborting the run.
  if (isHourlyLimitReached()) {
    const waitMs = Math.min(msUntilSlotFree(), DEFAULT_BACKOFF_MS);
    logger.warn(
      { path, callsThisHour: getCallsThisHour(), hourlyLimit: HOURLY_LIMIT, waitMs },
      'govwin_hourly_limit_reached',
    );
    await delay(waitMs);
    pruneOldCalls();
  }

  const token = await getAccessToken();
  const url = `${API_BASE}${path}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  // Every request counts against the org-wide rolling limit.
  callTimestamps.push(Date.now());

  if (res.status === 429) {
    const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'));
    logger.warn(
      { path, attempt, retryAfterMs, callsThisHour: getCallsThisHour(), hourlyLimit: HOURLY_LIMIT },
      'govwin_api_rate_limited',
    );
    if (attempt >= MAX_RATE_LIMIT_RETRIES) {
      throw new Error('GovWin API rate limited (429): retries exhausted.');
    }
    await delay(retryAfterMs ?? DEFAULT_BACKOFF_MS);
    return apiGet<T>(path, attempt + 1);
  }

  if (res.status === 401) {
    invalidateOAuth2Token();
    throw new Error('GovWin API unauthorized (401). Token invalidated.');
  }

  if (res.status === 422) {
    const text = await res.text().catch(() => '');
    throw new Error(`GovWin API 422 (malformed request) for ${path}: ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GovWin API error: ${res.status} ${text.slice(0, 200)}`);
  }

  return (await res.json()) as T;
}

/* ── Deltek V3 opportunity shapes ────────────────────────────────── */

interface DeltekNaics {
  id?: string;
  title?: string;
  sizeStandard?: string;
}

interface DeltekTitled {
  title?: string;
}

interface DeltekDateValue {
  value?: string;
}

interface DeltekLink {
  href?: string;
}

interface GovWinRawOpp {
  id?: string;
  iqOppId?: string;
  title?: string;
  status?: string;
  oppValue?: string | number;
  primaryNAICS?: DeltekNaics;
  additionalNaics?: DeltekNaics[];
  competitionTypes?: DeltekTitled[];
  contractTypes?: DeltekTitled[];
  typeOfAward?: string;
  solicitationDate?: DeltekDateValue;
  solicitationNumber?: string;
  sourceURL?: string;
  updateDate?: string;
  createdDate?: string;
  description?: string;
  govEntity?: { id?: string; title?: string };
  priority?: string;
  primaryRequirement?: string;
  links?: {
    companies?: DeltekLink;
    contracts?: DeltekLink;
    contacts?: DeltekLink;
  };
}

interface GovWinSearchResult {
  opportunities?: GovWinRawOpp[];
  results?: GovWinRawOpp[];
  data?: GovWinRawOpp[];
  meta?: { paging?: { totalCount?: number } };
}

/**
 * Parse the `oppValue` String into numeric dollar amounts. GovWin returns it as
 * text — a single value ("$5,000,000"), a range ("$1M - $5M"), a shorthand
 * ("2.5M") or non-numeric text ("Undisclosed"). Returns dollars (matching the
 * value_min/value_max columns) plus the raw string for provenance.
 */
export function parseOppValue(raw: string | number | null | undefined): {
  valueMin: number | null;
  valueMax: number | null;
  valueRaw: string | null;
} {
  if (raw === null || raw === undefined) return { valueMin: null, valueMax: null, valueRaw: null };
  const valueRaw = String(raw).trim();
  if (!valueRaw) return { valueMin: null, valueMax: null, valueRaw: null };

  const tokenRe = /(\d[\d,]*(?:\.\d+)?)\s*([kmb])?/gi;
  const nums: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(valueRaw)) !== null) {
    const base = parseFloat(m[1]!.replace(/,/g, ''));
    if (Number.isNaN(base)) continue;
    const suffix = (m[2] ?? '').toLowerCase();
    const mult = suffix === 'k' ? 1e3 : suffix === 'm' ? 1e6 : suffix === 'b' ? 1e9 : 1;
    nums.push(Math.round(base * mult));
  }

  if (nums.length === 0) return { valueMin: null, valueMax: null, valueRaw };
  if (nums.length === 1) return { valueMin: nums[0]!, valueMax: nums[0]!, valueRaw };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return { valueMin: min, valueMax: max, valueRaw };
}

function firstTitle(items: DeltekTitled[] | undefined): string | null {
  if (!items?.length) return null;
  for (const it of items) {
    const t = it.title?.trim();
    if (t) return t;
  }
  return null;
}

function mapRawToOpp(raw: GovWinRawOpp): GovWinApiOpportunity {
  const govwinId = (raw.id ?? raw.iqOppId ?? '').trim();
  const { valueMin, valueMax, valueRaw } = parseOppValue(raw.oppValue);
  const naics = raw.primaryNAICS?.id?.trim() || null;
  const solDate = raw.solicitationDate?.value?.trim() || null;

  return {
    govwinId,
    title: raw.title?.trim() || 'Untitled GovWin Opportunity',
    agency: raw.govEntity?.title?.trim() || null,
    subAgency: null,
    solicitationNumber: raw.solicitationNumber?.trim() || null,
    status: raw.status?.trim() || null,
    naics,
    setAside: firstTitle(raw.competitionTypes),
    // Incumbent/competitors are not on the opportunity object; the sub-endpoint
    // fetch fills these in.
    incumbent: null,
    competitors: [],
    valueMin,
    valueMax,
    valueRaw,
    responseDueAt: solDate,
    postedAt: raw.createdDate?.trim() || solDate,
    description: raw.description?.trim() || null,
    sourceUri:
      raw.sourceURL?.trim() ||
      `https://iq.govwin.com/neo/opportunity/view/${govwinId}`,
    updateDate: raw.updateDate?.trim() || null,
    createdDate: raw.createdDate?.trim() || null,
    links: {
      companies: raw.links?.companies?.href?.trim() || null,
      contracts: raw.links?.contracts?.href?.trim() || null,
      contacts: raw.links?.contacts?.href?.trim() || null,
    },
  };
}

/* ── Sub-endpoint shapes (companies / contracts) ─────────────────── */

interface DeltekCompany {
  companyName?: string;
  name?: string;
  title?: string;
  vendorName?: string;
  /** Some NEO shapes nest the company under `company: {name}`. */
  company?: { id?: string; name?: string; companyName?: string };
  role?: string;
  relationship?: string;
  relationshipType?: string;
  type?: string;
  isIncumbent?: boolean;
  incumbent?: boolean | string;
}

interface DeltekCompaniesResponse {
  companies?: DeltekCompany[];
  relatedCompanies?: DeltekCompany[];
  data?: DeltekCompany[];
  results?: DeltekCompany[];
  items?: DeltekCompany[];
  content?: DeltekCompany[];
}

interface DeltekContract {
  /** Deltek exposes the incumbent flag as a Boolean String ("true"/"false"). */
  incumbent?: boolean | string;
  /** The awardee company lives on the nested `company` object ({id, name}). */
  company?: { id?: string; name?: string };
  // Tolerate legacy/flat shapes seen in earlier payloads.
  isIncumbent?: boolean;
  primeContractor?: string;
  contractor?: string;
  vendorName?: string;
  awardee?: string;
  companyName?: string;
}

interface DeltekContractsResponse {
  contracts?: DeltekContract[];
  data?: DeltekContract[];
  results?: DeltekContract[];
  items?: DeltekContract[];
  content?: DeltekContract[];
}

export interface GovWinRelatedCompanies {
  incumbent: string | null;
  competitors: string[];
  /** Raw sub-endpoint payload, retained for diagnostics / govwin_cache. */
  raw?: unknown;
  /** Number of records the sub-endpoint returned. */
  count: number;
}

/**
 * Persist a raw sub-endpoint payload to the govwin_cache debug store so a live
 * ingest/backfill run reveals the exact NEO/Deltek response shape (#1145). The
 * (govwin_id, endpoint) pair is unique, so re-runs overwrite in place. Best
 * effort: cache failures never break enrichment.
 */
async function cacheSubEndpointRaw(
  govwinId: string,
  endpoint: 'companies' | 'contracts' | 'detail',
  raw: unknown,
): Promise<void> {
  if (raw === undefined || !govwinId) return;
  try {
    await pool.query(
      `INSERT INTO govwin_cache (govwin_id, endpoint, raw_payload)
       VALUES ($1, $2, $3)
       ON CONFLICT (govwin_id, endpoint)
       DO UPDATE SET raw_payload = $3, fetched_at = NOW()`,
      [govwinId, endpoint, JSON.stringify(raw ?? null)],
    );
  } catch (err) {
    logger.warn(
      { govwinId, endpoint, error: err instanceof Error ? err.message : String(err) },
      'govwin_subendpoint_cache_failed',
    );
  }
}

function companyName(c: DeltekCompany): string | null {
  return (
    (
      c.companyName ??
      c.name ??
      c.title ??
      c.vendorName ??
      c.company?.name ??
      c.company?.companyName ??
      ''
    ).trim() || null
  );
}

function isIncumbentCompany(c: DeltekCompany): boolean {
  if (c.isIncumbent === true) return true;
  if (c.incumbent === true) return true;
  if (typeof c.incumbent === 'string' && c.incumbent.trim().toLowerCase() === 'true') return true;
  const role =
    `${c.role ?? ''} ${c.relationship ?? ''} ${c.relationshipType ?? ''} ${c.type ?? ''}`.toLowerCase();
  return role.includes('incumbent');
}

/** The Contracts object carries the authoritative incumbent flag (Boolean String). */
function isIncumbentContract(c: DeltekContract): boolean {
  if (typeof c.incumbent === 'boolean') return c.incumbent;
  if (typeof c.incumbent === 'string') return c.incumbent.trim().toLowerCase() === 'true';
  return c.isIncumbent === true;
}

/** Resolve the awardee company name from a contract (nested or flat shape). */
function contractCompanyName(c: DeltekContract): string | null {
  return (
    (
      c.company?.name ??
      c.primeContractor ??
      c.contractor ??
      c.vendorName ??
      c.awardee ??
      c.companyName ??
      ''
    ).trim() || null
  );
}

/** Convert a link href (absolute or relative) into a path under API_BASE. */
function hrefToPath(href: string): string {
  try {
    const u = new URL(href);
    const marker = '/neo-ws';
    const idx = u.pathname.indexOf(marker);
    const path = idx >= 0 ? u.pathname.slice(idx + marker.length) : u.pathname;
    return `${path}${u.search}`;
  } catch {
    return href.startsWith('/') ? href : `/${href}`;
  }
}

/**
 * Fetch related companies for an opportunity and classify them into the
 * incumbent (role/relationship = incumbent) and other competitors.
 */
export async function fetchOpportunityCompanies(
  govwinId: string,
  href?: string | null,
): Promise<GovWinRelatedCompanies> {
  const data = isCasMode()
    ? await fetchOpportunitySubEndpointCas<DeltekCompaniesResponse | DeltekCompany[]>(
        govwinId,
        'companies',
      )
    : await apiGet<DeltekCompaniesResponse | DeltekCompany[]>(
        href ? hrefToPath(href) : `/opportunities/${encodeURIComponent(govwinId)}/companies`,
      );
  const resolved = Array.isArray(data)
    ? data
    : data.companies ??
      data.relatedCompanies ??
      data.data ??
      data.results ??
      data.items ??
      data.content ??
      [];
  // GovWin returns an empty OBJECT ({}) — not [] — for opportunities with no
  // related companies (e.g. FBO-namespace notices). Coerce any non-array to [].
  const list = Array.isArray(resolved) ? resolved : [];

  let incumbent: string | null = null;
  const competitors: string[] = [];
  for (const c of list) {
    const name = companyName(c);
    if (!name) continue;
    if (!incumbent && isIncumbentCompany(c)) {
      incumbent = name;
    } else {
      competitors.push(name);
    }
  }
  return { incumbent, competitors, raw: data, count: list.length };
}

/**
 * Fetch contract history for an opportunity. Per Deltek spec (p13/p14) the
 * incumbent flag lives on the Contracts object (`incumbent` Boolean String),
 * NOT on Related Companies. The incumbent is the contract where
 * `incumbent == true`; every other contract company is a competitor.
 */
export async function fetchOpportunityContracts(
  govwinId: string,
  href?: string | null,
): Promise<{ incumbent: string | null; competitors: string[]; raw?: unknown; count: number }> {
  const data = isCasMode()
    ? await fetchOpportunitySubEndpointCas<DeltekContractsResponse | DeltekContract[]>(
        govwinId,
        'contracts',
      )
    : await apiGet<DeltekContractsResponse | DeltekContract[]>(
        href ? hrefToPath(href) : `/opportunities/${encodeURIComponent(govwinId)}/contracts`,
      );
  const resolvedContracts = Array.isArray(data)
    ? data
    : data.contracts ?? data.data ?? data.results ?? data.items ?? data.content ?? [];
  // GovWin serves {} (empty object) rather than [] when there are no contracts;
  // coerce any non-array shape to [] so iteration never throws.
  const list = Array.isArray(resolvedContracts) ? resolvedContracts : [];

  let incumbent: string | null = null;
  const competitors: string[] = [];
  for (const c of list) {
    const name = contractCompanyName(c);
    if (!name) continue;
    if (!incumbent && isIncumbentContract(c)) {
      incumbent = name;
    } else {
      competitors.push(name);
    }
  }
  return { incumbent, competitors, raw: data, count: list.length };
}

/**
 * Discover recently-modified GovWin Tracked Opportunities via the Web Services
 * API. Filters to `oppType=OPP` + Envision NAICS, sorts by `updatedDate`, and
 * pages via `offset` until `meta.paging.totalCount` is exhausted (bounded by
 * MAX_DISCOVERY_PAGES).
 */
export async function discoverRecentOpportunitiesApi(
  maxResults = MAX_SEARCH_PAGE,
): Promise<GovWinApiOpportunity[]> {
  if (isCasMode()) {
    return discoverRecentOpportunitiesApiCas(maxResults);
  }
  // WSAPI rejects max > 100; clamp the page size defensively.
  const pageSize = Math.min(maxResults, MAX_SEARCH_PAGE);
  const rawItems: GovWinRawOpp[] = [];
  let offset = 0;
  let totalCount = Infinity;

  for (let page = 0; page < MAX_DISCOVERY_PAGES; page += 1) {
    const data = await apiGet<GovWinSearchResult>(
      buildDiscoveryPath(pageSize, offset, DISCOVERY_DATE_FROM),
    );
    const items = data.opportunities ?? data.results ?? data.data ?? [];
    rawItems.push(...items);

    const reportedTotal = data.meta?.paging?.totalCount;
    if (typeof reportedTotal === 'number') totalCount = reportedTotal;

    offset += pageSize;
    if (items.length < pageSize || offset >= totalCount) break;
  }

  return rawItems.map(mapRawToOpp);
}

/**
 * Fetch a single opportunity by GovWin ID (full opportunity object incl. links).
 */
export async function fetchOpportunityByIdApi(
  govwinId: string,
): Promise<GovWinApiOpportunity | null> {
  if (isCasMode()) {
    const viaJson = await fetchOpportunityByIdApiCas(govwinId);
    // The NEO portal frequently serves a JS-app shell / partial JSON with no
    // incumbent or competitors. When the JSON detail already carries that
    // intel, use it directly; otherwise merge in the HTML view page so inline
    // incumbent/competitors are not lost when the sub-endpoints come back empty.
    if (viaJson && (viaJson.incumbent || viaJson.competitors.length > 0)) return viaJson;
    const viaHtml = await fetchOpportunityDetailHtmlCas(govwinId);
    if (!viaJson) return viaHtml;
    if (!viaHtml) return viaJson;
    return {
      ...viaJson,
      incumbent: viaJson.incumbent ?? viaHtml.incumbent,
      competitors: viaJson.competitors.length > 0 ? viaJson.competitors : viaHtml.competitors,
      description: viaJson.description ?? viaHtml.description,
    };
  }
  try {
    const raw = await apiGet<GovWinRawOpp>(`/opportunities/${encodeURIComponent(govwinId)}`);
    return mapRawToOpp(raw);
  } catch (err) {
    logger.warn(
      { govwinId, error: err instanceof Error ? err.message : String(err) },
      'govwin_api_fetch_opp_error',
    );
    return null;
  }
}

/** Alias for the per-opportunity detail endpoint. */
export const fetchOpportunityDetail = fetchOpportunityByIdApi;

/**
 * Merge a detail payload onto a summary/list record. Detail fields take
 * precedence when present; the summary is the fallback so we never lose data
 * the list already provided.
 */
export function mergeDetailIntoSummary(
  summary: GovWinApiOpportunity,
  detail: GovWinApiOpportunity | null,
): GovWinApiOpportunity {
  if (!detail) return summary;
  return {
    ...summary,
    agency: detail.agency ?? summary.agency,
    subAgency: detail.subAgency ?? summary.subAgency,
    solicitationNumber: detail.solicitationNumber ?? summary.solicitationNumber,
    status: detail.status ?? summary.status,
    naics: detail.naics ?? summary.naics,
    setAside: detail.setAside ?? summary.setAside,
    incumbent: detail.incumbent ?? summary.incumbent,
    competitors: detail.competitors.length > 0 ? detail.competitors : summary.competitors,
    valueMin: detail.valueMin ?? summary.valueMin,
    valueMax: detail.valueMax ?? summary.valueMax,
    valueRaw: detail.valueRaw ?? summary.valueRaw,
    responseDueAt: detail.responseDueAt ?? summary.responseDueAt,
    postedAt: detail.postedAt ?? summary.postedAt,
    description: detail.description ?? summary.description,
    updateDate: detail.updateDate ?? summary.updateDate,
    createdDate: detail.createdDate ?? summary.createdDate,
    links: detail.links ?? summary.links,
  };
}

export interface DiscoverWithDetailResult {
  opportunities: GovWinApiOpportunity[];
  /** Number of opportunities enriched via sub-endpoint fetches this run. */
  detailFetches: number;
  /** Total WSAPI calls issued for detail + sub-endpoints this run. */
  subEndpointCalls: number;
  /** Opportunities skipped because their updateDate was unchanged. */
  skippedUnchanged: number;
  /** Opportunities skipped because they are off-profile or auto-passed. */
  skippedIrrelevant: number;
}

/** Load the last-seen updateDate per govwinId from the cache. */
async function loadStoredUpdateDates(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const filtered = ids.filter((id) => id);
  if (filtered.length === 0) return map;
  try {
    const { rows } = await pool.query<{ govwin_id: string; update_date: string | null }>(
      `SELECT govwin_id, raw_payload->>'updateDate' AS update_date
         FROM govwin_cache
        WHERE endpoint = 'opportunities' AND govwin_id = ANY($1::text[])`,
      [filtered],
    );
    for (const r of rows) {
      if (r.update_date) map.set(r.govwin_id, r.update_date);
    }
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'govwin_update_date_lookup_failed',
    );
  }
  return map;
}

/**
 * Enrich a single relevant opportunity with incumbent + competitors.
 *
 * Per Deltek spec the incumbent flag lives on the Contracts object, so the
 * incumbent is sourced from `/contracts` (the contract where `incumbent==true`).
 * Competitors are the Related Companies (`/companies`) plus other, non-incumbent
 * contract companies, with the incumbent removed and duplicates collapsed.
 */
export interface EnrichmentResult {
  incumbent: string | null;
  competitors: string[];
  /** Sub-endpoint calls issued (companies + contracts). */
  calls: number;
}

/**
 * Fetch and classify incumbent + competitors for a single opportunity from the
 * companies/contracts sub-endpoints. Works in both auth modes: the sub-endpoint
 * fetchers dispatch on GOVWIN_AUTH_MODE, so this fires under CAS session auth
 * too. Reused by ingest enrichment and by the backfill script.
 *
 * `fallbackIncumbent` / `fallbackCompetitors` (e.g. inline values already on the
 * detail payload) are used when the sub-endpoints yield nothing.
 */
export async function enrichIncumbentCompetitors(
  govwinId: string,
  links?: GovWinOppLinks,
  fallbackIncumbent: string | null = null,
  fallbackCompetitors: string[] = [],
): Promise<EnrichmentResult> {
  let calls = 0;
  let incumbent: string | null = null;
  const competitorNames: string[] = [];
  let companiesCount = 0;
  let contractsCount = 0;

  try {
    const companies = await fetchOpportunityCompanies(govwinId, links?.companies);
    calls += 1;
    companiesCount = companies.count;
    await cacheSubEndpointRaw(govwinId, 'companies', companies.raw);
    // Related Companies carries no incumbent flag; treat all as candidate competitors.
    if (companies.incumbent) competitorNames.push(companies.incumbent);
    competitorNames.push(...companies.competitors);
  } catch (err) {
    logger.warn(
      { govwinId, error: err instanceof Error ? err.message : String(err) },
      'govwin_companies_fetch_error',
    );
  }

  try {
    const contracts = await fetchOpportunityContracts(govwinId, links?.contracts);
    calls += 1;
    contractsCount = contracts.count;
    await cacheSubEndpointRaw(govwinId, 'contracts', contracts.raw);
    incumbent = contracts.incumbent;
    competitorNames.push(...contracts.competitors);
  } catch (err) {
    logger.warn(
      { govwinId, error: err instanceof Error ? err.message : String(err) },
      'govwin_contracts_fetch_error',
    );
  }

  const resolvedIncumbent = incumbent ?? fallbackIncumbent;
  competitorNames.push(...fallbackCompetitors);
  const competitors = dedupeCompetitors(competitorNames, resolvedIncumbent);

  // Per-opportunity diagnostic: makes a live run show whether the sub-endpoints
  // returned records and whether an incumbent was resolved (#1145).
  logger.info(
    {
      govwinId,
      companiesCount,
      contractsCount,
      incumbentFound: resolvedIncumbent !== null,
      incumbentSource: incumbent !== null ? 'contracts' : fallbackIncumbent !== null ? 'fallback' : 'none',
      competitors: competitors.length,
      calls,
    },
    'govwin_enrich_result',
  );

  return { incumbent: resolvedIncumbent, competitors, calls };
}

async function enrichOneOpportunity(
  summary: GovWinApiOpportunity,
  detail: GovWinApiOpportunity | null,
): Promise<{ opp: GovWinApiOpportunity; calls: number }> {
  const merged = mergeDetailIntoSummary(summary, detail);

  const { incumbent, competitors, calls } = await enrichIncumbentCompetitors(
    merged.govwinId,
    merged.links,
    merged.incumbent,
    merged.competitors,
  );

  return {
    opp: {
      ...merged,
      incumbent,
      competitors: competitors.length > 0 ? competitors : merged.competitors,
    },
    calls,
  };
}

/** Collapse duplicates (case-insensitive) and drop the incumbent from competitors. */
function dedupeCompetitors(names: string[], incumbent: string | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const incumbentKey = incumbent?.trim().toLowerCase();
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (key === incumbentKey) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * Discover recent opportunities and enrich each relevant, changed one with its
 * incumbent + competitors from the companies/contracts sub-endpoints.
 *
 * Cost control:
 *  - opportunities whose `updateDate` is unchanged since our last pull are
 *    skipped entirely (no detail, no sub-endpoint calls);
 *  - opportunities that fail relevance or are auto-passed (non-primeable
 *    set-asides, off-profile NAICS, imminent/past deadlines) get no
 *    sub-endpoint calls;
 *  - the rest cost ~2-3 WSAPI calls each (detail + companies [+ contracts]).
 *
 * This runs in BOTH auth modes. Under CAS session auth the detail + sub-endpoint
 * fetchers dispatch to the NEO portal (via `cas_client.ts`), so enrichment fires
 * and `subEndpointCalls` can exceed 0 — the OAuth2 tier is not required (#1145).
 */
export async function discoverRecentOpportunitiesWithDetailApi(
  maxResults = MAX_SEARCH_PAGE,
): Promise<DiscoverWithDetailResult> {
  const summaries = await discoverRecentOpportunitiesApi(maxResults);

  const storedDates = await loadStoredUpdateDates(summaries.map((s) => s.govwinId));

  const enriched: GovWinApiOpportunity[] = new Array(summaries.length);
  let detailFetches = 0;
  let subEndpointCalls = 0;
  let skippedUnchanged = 0;
  let skippedIrrelevant = 0;
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const idx = cursor;
      cursor += 1;
      if (idx >= summaries.length) return;

      const summary = summaries[idx]!;

      // Skip opportunities we have already enriched and that have not changed.
      const prev = storedDates.get(summary.govwinId);
      if (prev && summary.updateDate && prev === summary.updateDate) {
        enriched[idx] = summary;
        skippedUnchanged += 1;
        continue;
      }

      const detail = await fetchOpportunityDetail(summary.govwinId);
      if (detail) subEndpointCalls += 1;
      const merged = mergeDetailIntoSummary(summary, detail);

      // Relevance gate: never spend sub-endpoint calls on off-profile or
      // auto-passed opportunities (DLA commodity parts, non-primeable
      // set-asides, imminent deadlines).
      const relevance = evaluateRelevance({
        naics: merged.naics,
        set_aside: merged.setAside,
        response_due_at: merged.responseDueAt,
      });
      if (!relevance.relevant || relevance.auto_pass) {
        enriched[idx] = merged;
        skippedIrrelevant += 1;
        continue;
      }

      const { opp, calls } = await enrichOneOpportunity(summary, detail);
      subEndpointCalls += calls;
      detailFetches += 1;
      enriched[idx] = opp;
    }
  }

  const workerCount = Math.min(DETAIL_CONCURRENCY, summaries.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  logger.info(
    {
      discovered: summaries.length,
      detailFetches,
      subEndpointCalls,
      skippedUnchanged,
      skippedIrrelevant,
      callsThisHour: getCallsThisHour(),
      hourlyLimit: HOURLY_LIMIT,
    },
    'govwin_detail_enrichment_complete',
  );

  return { opportunities: enriched, detailFetches, subEndpointCalls, skippedUnchanged, skippedIrrelevant };
}

/**
 * Log remaining hourly quota for observability.
 */
export function logQuotaStatus(): void {
  const used = getCallsThisHour();
  logger.info(
    {
      callsThisHour: used,
      hourlyLimit: HOURLY_LIMIT,
      remaining: Math.max(0, HOURLY_LIMIT - used),
    },
    'govwin_api_quota_status',
  );
}
