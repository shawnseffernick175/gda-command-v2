/**
 * GovWin IQ data client — CAS session-cookie path.
 *
 * P0 (#1099): The account does NOT have the Deltek/GovWin Web Services OAuth2
 * API tier, so `oauth2_auth.ts` returns 401 invalid_client for every grant.
 * The working authentication is the Apereo CAS flow (`auth.ts`): it yields a
 * JSESSIONID session cookie that the NEO portal accepts.
 *
 * This module reaches the NEO portal's JSON data endpoints using that session
 * cookie. Requests follow redirects (`redirect: 'follow'`): an authenticated
 * `/neo/rest/...` call 302-redirects to the concrete data URL that the CAS
 * session grants, so following the redirect lands on the real payload. If the
 * final response is the CAS login HTML (session expired), we re-authenticate
 * once and retry.
 *
 * Produces the same `GovWinApiOpportunity` shape as `api_client.ts` so the
 * ingest job, adapters, enrichment and routes are unaffected by the auth mode.
 */

import { authenticate, invalidateAuth } from './auth.js';
import { parseOpportunityPage } from './client.js';
import { logger } from '../../lib/logger.js';
import type { GovWinApiOpportunity } from './api_client.js';

function envOrDefault(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

const IQ_BASE = envOrDefault('GOVWIN_CAS_BASE', 'https://iq.govwin.com');

/** NEO portal JSON data paths. Overridable via env in case Deltek moves them. */
const OPP_SEARCH_PATH = envOrDefault(
  'GOVWIN_CAS_OPP_SEARCH_PATH',
  '/neo/rest/opportunities',
);
const OPP_DETAIL_PATH = envOrDefault(
  'GOVWIN_CAS_OPP_DETAIL_PATH',
  '/neo/rest/opportunities',
);
/**
 * NEO portal sub-endpoint base paths for per-opportunity enrichment. The
 * incumbent flag lives on the Contracts object; Related Companies carries the
 * competitor names. Overridable via env in case Deltek relocates them.
 */
const OPP_COMPANIES_PATH = envOrDefault(
  'GOVWIN_CAS_OPP_COMPANIES_PATH',
  '/neo/rest/opportunities',
);
const OPP_CONTRACTS_PATH = envOrDefault(
  'GOVWIN_CAS_OPP_CONTRACTS_PATH',
  '/neo/rest/opportunities',
);

function buildCookieHeader(cookies: string[]): string {
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

/** True when the response is the CAS login page instead of JSON data. */
function looksLikeLogin(contentType: string | null, body: string): boolean {
  if (contentType && contentType.includes('application/json')) return false;
  return /j_spring_cas_security_check|cas\/login|<form[^>]+login/i.test(body);
}

/**
 * Authenticated GET against a NEO portal path. Follows redirects with the
 * session cookie and returns the parsed JSON body. Re-authenticates once if
 * the session has expired (login page returned).
 */
async function casGetJson<T>(path: string, retry = true): Promise<T> {
  let url: URL;
  try {
    const base = new URL(IQ_BASE);
    url = new URL(path, base);
    if (!['http:', 'https:'].includes(url.protocol) || !url.host) {
      throw new Error('unsupported URL protocol');
    }
  } catch {
    throw new Error(
      `GovWin CAS URL must be absolute: base="${IQ_BASE}", path="${path}"`,
    );
  }

  const cookies = await authenticate();

  const res = await fetch(url.toString(), {
    headers: {
      Cookie: buildCookieHeader(cookies),
      Accept: 'application/json',
    },
    redirect: 'follow',
  });

  const contentType = res.headers.get('content-type');
  const text = await res.text();

  if ((res.status === 401 || res.status === 403 || looksLikeLogin(contentType, text)) && retry) {
    invalidateAuth();
    return casGetJson<T>(path, false);
  }

  if (!res.ok) {
    throw new Error(`GovWin CAS fetch failed: HTTP ${res.status} for ${path}`);
  }
  if (looksLikeLogin(contentType, text)) {
    throw new Error(`GovWin CAS session invalid — login page returned for ${path}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`GovWin CAS response was not JSON for ${path}`);
  }
}

/* ── Defensive JSON → GovWinApiOpportunity mapping ───────────────── */

interface GovWinRawOpp {
  id?: string | number;
  govwinId?: string | number;
  govwin_id?: string | number;
  oppId?: string | number;
  title?: string;
  name?: string;
  agency?: string;
  agencyName?: string;
  agency_name?: string;
  department?: string;
  subAgency?: string;
  sub_agency?: string;
  solicitationNumber?: string;
  solicitation_number?: string;
  status?: string;
  state?: string;
  updateDate?: string;
  updated_date?: string;
  updatedDate?: string;
  createdDate?: string;
  created_date?: string;
  naics?: string;
  naicsCode?: string;
  naics_code?: string;
  setAside?: string;
  set_aside?: string;
  setAsideType?: string;
  incumbent?: string;
  incumbentName?: string;
  incumbent_name?: string;
  competitors?: string[];
  competitorNames?: string[];
  valueMin?: number;
  value_min?: number;
  estimatedValueLow?: number;
  estimated_value_low?: number;
  valueMax?: number;
  value_max?: number;
  estimatedValueHigh?: number;
  estimated_value_high?: number;
  responseDueDate?: string;
  response_due_date?: string;
  dueDate?: string;
  due_date?: string;
  postedDate?: string;
  posted_date?: string;
  solicitationDate?: string;
  description?: string;
  url?: string;
  sourceUrl?: string;
  source_url?: string;
}

interface GovWinSearchResult {
  opportunities?: GovWinRawOpp[];
  results?: GovWinRawOpp[];
  data?: GovWinRawOpp[];
  items?: GovWinRawOpp[];
  content?: GovWinRawOpp[];
}

function firstDefined<T>(...vals: (T | undefined | null)[]): T | null {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

function mapRawToOpp(raw: GovWinRawOpp): GovWinApiOpportunity {
  const idVal = firstDefined(raw.id, raw.govwinId, raw.govwin_id, raw.oppId);
  const govwinId = idVal !== null ? String(idVal) : '';
  return {
    govwinId,
    title: firstDefined(raw.title, raw.name) ?? 'Untitled GovWin Opportunity',
    agency: firstDefined(raw.agency, raw.agencyName, raw.agency_name, raw.department),
    subAgency: firstDefined(raw.subAgency, raw.sub_agency),
    solicitationNumber: firstDefined(raw.solicitationNumber, raw.solicitation_number),
    status: firstDefined(raw.status, raw.state),
    naics: firstDefined(raw.naics, raw.naicsCode, raw.naics_code),
    setAside: firstDefined(raw.setAside, raw.set_aside, raw.setAsideType),
    incumbent: firstDefined(raw.incumbent, raw.incumbentName, raw.incumbent_name),
    competitors: raw.competitors ?? raw.competitorNames ?? [],
    valueMin: firstDefined(raw.valueMin, raw.value_min, raw.estimatedValueLow, raw.estimated_value_low),
    valueMax: firstDefined(raw.valueMax, raw.value_max, raw.estimatedValueHigh, raw.estimated_value_high),
    responseDueAt: firstDefined(raw.responseDueDate, raw.response_due_date, raw.dueDate, raw.due_date),
    postedAt: firstDefined(raw.postedDate, raw.posted_date, raw.solicitationDate),
    description: firstDefined(raw.description),
    sourceUri:
      firstDefined(raw.url, raw.sourceUrl, raw.source_url) ??
      `${IQ_BASE}/neo/opportunity/view/${govwinId}`,
    updateDate: firstDefined(raw.updateDate, raw.updated_date, raw.updatedDate),
    createdDate: firstDefined(raw.createdDate, raw.created_date),
  };
}

function extractItems(data: GovWinSearchResult | GovWinRawOpp[]): GovWinRawOpp[] {
  if (Array.isArray(data)) return data;
  return data.opportunities ?? data.results ?? data.data ?? data.items ?? data.content ?? [];
}

/* ── Public API (mirrors api_client.ts signatures) ───────────────── */

export async function discoverRecentOpportunitiesApiCas(
  maxResults = 50,
): Promise<GovWinApiOpportunity[]> {
  const qs = new URLSearchParams({
    sort: 'updatedDate',
    order: 'desc',
    max: String(maxResults),
    oppSelectionDateFrom: '-30D',
  });
  const data = await casGetJson<GovWinSearchResult | GovWinRawOpp[]>(
    `${OPP_SEARCH_PATH}?${qs.toString()}`,
  );
  return extractItems(data).map(mapRawToOpp);
}

export async function fetchOpportunityByIdApiCas(
  govwinId: string,
): Promise<GovWinApiOpportunity | null> {
  try {
    const data = await casGetJson<GovWinRawOpp>(`${OPP_DETAIL_PATH}/${govwinId}`);
    return mapRawToOpp(data);
  } catch (err) {
    logger.warn(
      { govwinId, error: err instanceof Error ? err.message : String(err) },
      'govwin_cas_fetch_opp_error',
    );
    return null;
  }
}

/**
 * Fetch a per-opportunity sub-endpoint (companies or contracts) under the CAS
 * session. Returns the raw JSON payload so the shared Deltek classifier in
 * `api_client.ts` can map incumbent (from Contracts) and competitors (from
 * Related Companies) identically across auth modes.
 *
 * CAS links point at the NEO portal host, so any `href` from the OAuth2 payload
 * (services.govwin.com) is ignored here; the path is always built from the
 * NEO portal template.
 */
export async function fetchOpportunitySubEndpointCas<T>(
  kind: 'companies' | 'contracts',
  govwinId: string,
): Promise<T> {
  const base = kind === 'companies' ? OPP_COMPANIES_PATH : OPP_CONTRACTS_PATH;
  const path = `${base}/${encodeURIComponent(govwinId)}/${kind}`;
  return casGetJson<T>(path);
}

/**
 * HTML fallback: fetch an opportunity detail page and parse it with cheerio.
 * Used when the JSON detail endpoint is unavailable but the session can still
 * render the opportunity view page.
 */
export async function fetchOpportunityDetailHtmlCas(
  govwinId: string,
): Promise<GovWinApiOpportunity | null> {
  try {
    const cookies = await authenticate();
    const url = `${IQ_BASE}/neo/opportunity/view/${govwinId}`;
    const res = await fetch(url, {
      headers: {
        Cookie: buildCookieHeader(cookies),
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const html = await res.text();
    const parsed = parseOpportunityPage(html, govwinId);
    return {
      govwinId: parsed.govwinId,
      title: parsed.title,
      agency: parsed.agency,
      subAgency: parsed.subAgency,
      solicitationNumber: parsed.solicitationNumber,
      status: parsed.status,
      naics: parsed.naics,
      setAside: parsed.setAside,
      incumbent: parsed.incumbent,
      competitors: parsed.competitors,
      valueMin: parsed.valueMin,
      valueMax: parsed.valueMax,
      responseDueAt: parsed.responseDueAt,
      postedAt: parsed.postedAt,
      description: parsed.description,
      sourceUri: parsed.sourceUri,
    };
  } catch (err) {
    logger.warn(
      { govwinId, error: err instanceof Error ? err.message : String(err) },
      'govwin_cas_html_detail_error',
    );
    return null;
  }
}
