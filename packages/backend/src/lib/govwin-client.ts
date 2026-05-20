// ---------------------------------------------------------------------------
// GovWin IQ WSAPI Client — OAuth2 password grant + opportunity search
//
// Token lifecycle:
//   - Access token expires in 12h; proactive refresh at 11h.
//   - Refresh token expires in 30d.
//   - On 401 → refresh once; on refresh failure → re-auth with password grant.
//   - NO retry on auth failure (account locks after 5 failed attempts / 30min).
//
// Rate limiting:
//   - 4,000 calls/hour org-wide. We halt at 3,000/hour (75% buffer).
//   - Each call logged to govwin_call_log for rolling-window tracking.
//
// Incremental sync:
//   - Compare updateDate per opp against stored value; skip extended sub-calls
//     for unchanged opps (saves 6–12 calls per skipped opp).
// ---------------------------------------------------------------------------

import { log } from "./logger";
import { getPool } from "./db";

// ---------------------------------------------------------------------------
// Config — read from env, fail fast if missing
// ---------------------------------------------------------------------------
const GOVWIN_BASE_URL = "https://services.govwin.com/neo-ws";
const TOKEN_ENDPOINT = `${GOVWIN_BASE_URL}/oauth/token`;
const RATE_LIMIT_HOURLY = 3000; // halt threshold (75% of 4,000 org-wide cap)

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not configured`);
  return v;
}

// ---------------------------------------------------------------------------
// Token state — in-memory cache with proactive refresh
// ---------------------------------------------------------------------------
interface TokenState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

let tokenState: TokenState | null = null;

/** Proactive refresh 1h before expiry (11h into the 12h window). */
const REFRESH_BUFFER_MS = 60 * 60 * 1000;

export async function getGovWinAccessToken(): Promise<string> {
  if (tokenState && Date.now() < tokenState.expiresAt - REFRESH_BUFFER_MS) {
    return tokenState.accessToken;
  }

  // Try refresh first if we have a refresh token
  if (tokenState?.refreshToken) {
    try {
      const refreshed = await refreshAccessToken(tokenState.refreshToken);
      tokenState = refreshed;
      return refreshed.accessToken;
    } catch {
      log.warn("govwin_refresh_failed", { hint: "Falling back to password grant" });
      tokenState = null;
    }
  }

  // Password grant
  const fresh = await passwordGrant();
  tokenState = fresh;
  return fresh.accessToken;
}

async function passwordGrant(): Promise<TokenState> {
  const clientId = requireEnv("GOVWIN_CLIENT_ID");
  const clientSecret = requireEnv("GOVWIN_CLIENT_SECRET");
  const username = requireEnv("GOVWIN_USERNAME");
  const password = requireEnv("GOVWIN_PASSWORD");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "password",
    username,
    password,
    scope: "read",
  });

  const resp = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    log.error("govwin_auth_failed", { status: resp.status, body: text });
    throw new Error(`GovWin password grant failed (${resp.status}): ${text}`);
  }

  const data = await resp.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  };

  log.info("govwin_auth_success", { expiresIn: data.expires_in });

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

async function refreshAccessToken(refreshToken: string): Promise<TokenState> {
  const clientId = requireEnv("GOVWIN_CLIENT_ID");
  const clientSecret = requireEnv("GOVWIN_CLIENT_SECRET");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const resp = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`GovWin refresh failed (${resp.status}): ${text}`);
  }

  const data = await resp.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

// ---------------------------------------------------------------------------
// Rate-limit guard — rolling 60-minute window via govwin_call_log
// ---------------------------------------------------------------------------

async function logApiCall(endpoint: string, success: boolean, errorMsg?: string): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO govwin_call_log (endpoint, called_at, success, error_message) VALUES ($1, NOW(), $2, $3)`,
      [endpoint, success, errorMsg ?? null],
    );
  } catch {
    // fire-and-forget
  }
}

async function getRollingHourCallCount(): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM govwin_call_log WHERE called_at > NOW() - INTERVAL '60 minutes'`,
    );
    return parseInt(rows[0].cnt as string, 10);
  } catch {
    return 0;
  }
}

export async function checkGovWinRateLimit(): Promise<{ allowed: boolean; current: number; limit: number }> {
  const current = await getRollingHourCallCount();
  return { allowed: current < RATE_LIMIT_HOURLY, current, limit: RATE_LIMIT_HOURLY };
}

// ---------------------------------------------------------------------------
// API call wrapper — auth + rate-limit + logging
// ---------------------------------------------------------------------------

async function govwinFetch(path: string, params?: Record<string, string>): Promise<Response> {
  const rateCheck = await checkGovWinRateLimit();
  if (!rateCheck.allowed) {
    throw new Error(`GovWin rate limit reached (${rateCheck.current}/${rateCheck.limit} calls in last 60min)`);
  }

  const token = await getGovWinAccessToken();
  const url = new URL(`${GOVWIN_BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const resp = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  await logApiCall(path, resp.ok, resp.ok ? undefined : `HTTP ${resp.status}`);

  // On 401, attempt one refresh then retry
  if (resp.status === 401 && tokenState) {
    log.warn("govwin_token_expired_mid_request", { path });
    try {
      const refreshed = await refreshAccessToken(tokenState.refreshToken);
      tokenState = refreshed;

      const retryResp = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${refreshed.accessToken}`,
          Accept: "application/json",
        },
      });

      await logApiCall(path, retryResp.ok, retryResp.ok ? undefined : `HTTP ${retryResp.status} (retry)`);
      return retryResp;
    } catch (e) {
      log.error("govwin_refresh_retry_failed", { path, error: (e as Error).message });
      // Do NOT retry auth — fail fast to avoid lockout
      throw new Error(`GovWin auth failed on refresh retry: ${(e as Error).message}`);
    }
  }

  return resp;
}

// ---------------------------------------------------------------------------
// Opportunity types
// ---------------------------------------------------------------------------

export interface GovWinOpportunity {
  id: string;
  iqOppId: number;
  title: string;
  description?: string;
  status?: string;
  type?: string;
  govEntity?: { id: number; title: string };
  primaryNAICS?: { id: number; title: string; sizeStandard?: string };
  solicitationNumber?: string;
  solicitationDate?: { value: string; deltekEstimate?: string; govtEstimate?: string };
  awardDate?: { value: string; deltekEstimate?: string; govtEstimate?: string };
  oppValue?: string;
  sourceURL?: string;
  updateDate?: string;
  createdDate?: string;
  duration?: string;
  country?: string;
  competitionTypes?: Array<{ id: number; title: string }>;
  contractTypes?: Array<{ id: number; title: string }>;
  smartTag?: string;
  links?: Record<string, unknown>;
}

export interface GovWinSearchResponse {
  meta: {
    paging: {
      max: number;
      offset: number;
      order: string;
      sort: string;
      totalCount: number;
    };
  };
  opportunities: GovWinOpportunity[];
  links?: Record<string, unknown>;
}

export interface GovWinPollResult {
  searchName: string;
  status: "ok" | "skipped" | "error";
  fetched: number;
  totalAvailable: number;
  skippedUnchanged: number;
  error?: string;
}

export interface GovWinPollResponse {
  results: GovWinOpportunity[];
  searchSummary: GovWinPollResult[];
  totalFetched: number;
  totalSkippedUnchanged: number;
  rateLimit: { current: number; limit: number };
  timestamp: string;
  blocked?: string;
}

// ---------------------------------------------------------------------------
// Opportunity search — paginate through results, skip unchanged opps
// ---------------------------------------------------------------------------

/**
 * Valid relative dates per GovWin WSAPI: -24H, -1W, -30D, -3M, -6M, -1Y, -2Y, -5Y
 * For daily sync with overlap, use -1W and rely on updateDate dedup.
 */
export async function searchGovWinOpportunities(opts: {
  oppType?: string;
  dateFrom?: string;
  savedSearchId?: string;
  maxPages?: number;
}): Promise<{ opportunities: GovWinOpportunity[]; totalCount: number }> {
  const params: Record<string, string> = {
    max: "100",
    sort: "updatedDate",
    order: "desc",
  };

  if (opts.savedSearchId) {
    params.savedSearchId = opts.savedSearchId;
  }
  if (opts.oppType) {
    params.oppType = opts.oppType;
  }
  if (opts.dateFrom) {
    params.oppSelectionDateFrom = opts.dateFrom;
  }
  // oppCategory=2 fetches new + updated
  params.oppCategory = "2";

  const maxPages = opts.maxPages ?? 10; // safety: max 1,000 opps per poll
  const allOpps: GovWinOpportunity[] = [];
  let totalCount = 0;

  for (let page = 0; page < maxPages; page++) {
    params.offset = String(page * 100);

    const resp = await govwinFetch("/opportunities", params);

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      log.error("govwin_search_error", { status: resp.status, body: text.slice(0, 500) });
      throw new Error(`GovWin search failed (${resp.status}): ${text.slice(0, 200)}`);
    }

    const contentType = resp.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      log.error("govwin_invalid_content_type", {
        contentType,
        hint: contentType.includes("text/html")
          ? "Received HTML instead of JSON — check API credentials/endpoint"
          : "Response is not JSON",
      });
      throw new Error(`GovWin returned non-JSON response (${contentType})`);
    }

    const data = await resp.json() as GovWinSearchResponse;
    totalCount = data.meta.paging.totalCount;

    for (const opp of data.opportunities) {
      allOpps.push(opp);
    }

    // No more pages
    if (data.opportunities.length < 100 || allOpps.length >= totalCount) {
      break;
    }
  }

  return { opportunities: allOpps, totalCount };
}

// ---------------------------------------------------------------------------
// Poll — orchestrates search + dedup + updateDate comparison
// ---------------------------------------------------------------------------

export async function pollGovWin(): Promise<GovWinPollResponse> {
  // Check required env vars
  try {
    requireEnv("GOVWIN_CLIENT_ID");
    requireEnv("GOVWIN_CLIENT_SECRET");
    requireEnv("GOVWIN_USERNAME");
    requireEnv("GOVWIN_PASSWORD");
  } catch (e) {
    throw new Error(`GovWin credentials missing: ${(e as Error).message}`);
  }

  // Rate limit pre-check
  const rateCheck = await checkGovWinRateLimit();
  if (!rateCheck.allowed) {
    return {
      results: [],
      searchSummary: [],
      totalFetched: 0,
      totalSkippedUnchanged: 0,
      rateLimit: rateCheck,
      timestamp: new Date().toISOString(),
      blocked: `Rate limit reached (${rateCheck.current}/${rateCheck.limit} calls in rolling 60min). Poll skipped.`,
    };
  }

  const searchSummary: GovWinPollResult[] = [];
  const allResults: GovWinOpportunity[] = [];
  const seenIds = new Set<string>();
  let totalSkipped = 0;

  // Load stored updateDate values for dedup
  const storedUpdates = await getStoredUpdateDates();

  // Build search configs: saved searches from env, or default keyword search
  const savedSearchIds = (process.env.GOVWIN_SAVED_SEARCH_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);

  const searches: Array<{ name: string; opts: Parameters<typeof searchGovWinOpportunities>[0] }> = [];

  if (savedSearchIds.length > 0) {
    for (const ssId of savedSearchIds) {
      searches.push({
        name: `saved-search-${ssId}`,
        opts: { savedSearchId: ssId, dateFrom: "-1W" },
      });
    }
  } else {
    // Default: Tracked Opps + Task Order Opps, updated in last week
    searches.push({
      name: "tracked-opps",
      opts: { oppType: "OPP,TNS", dateFrom: "-1W" },
    });
  }

  for (const search of searches) {
    // Re-check rate limit before each search
    const midCheck = await checkGovWinRateLimit();
    if (!midCheck.allowed) {
      searchSummary.push({
        searchName: search.name,
        status: "skipped",
        fetched: 0,
        totalAvailable: 0,
        skippedUnchanged: 0,
        error: `Rate limit reached mid-poll (${midCheck.current}/${midCheck.limit})`,
      });
      continue;
    }

    try {
      const { opportunities, totalCount } = await searchGovWinOpportunities(search.opts);
      let skipped = 0;

      for (const opp of opportunities) {
        if (seenIds.has(opp.id)) continue;
        seenIds.add(opp.id);

        // updateDate dedup: skip if unchanged
        const stored = storedUpdates.get(opp.id);
        if (stored && opp.updateDate && stored === opp.updateDate) {
          skipped++;
          continue;
        }

        allResults.push(opp);
      }

      totalSkipped += skipped;
      searchSummary.push({
        searchName: search.name,
        status: "ok",
        fetched: opportunities.length,
        totalAvailable: totalCount,
        skippedUnchanged: skipped,
      });

      log.info("govwin_poll_search", {
        search: search.name,
        fetched: opportunities.length,
        total: totalCount,
        skipped,
        newOrUpdated: opportunities.length - skipped,
      });
    } catch (e) {
      const msg = (e as Error).message;
      searchSummary.push({
        searchName: search.name,
        status: "error",
        fetched: 0,
        totalAvailable: 0,
        skippedUnchanged: 0,
        error: msg,
      });
      log.error("govwin_poll_search_error", { search: search.name, error: msg });
    }
  }

  const finalRate = await checkGovWinRateLimit();

  return {
    results: allResults,
    searchSummary,
    totalFetched: allResults.length,
    totalSkippedUnchanged: totalSkipped,
    rateLimit: finalRate,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Helper — load stored updateDate values for dedup
// ---------------------------------------------------------------------------

async function getStoredUpdateDates(): Promise<Map<string, string>> {
  const pool = getPool();
  const map = new Map<string, string>();
  if (!pool) return map;

  try {
    const { rows } = await pool.query(
      `SELECT id, govwin_update_date FROM opportunities WHERE data_source = 'govwin' AND govwin_update_date IS NOT NULL`,
    );
    for (const r of rows) {
      map.set(r.id as string, r.govwin_update_date as string);
    }
  } catch {
    // Column may not exist yet — return empty map
  }

  return map;
}

// For testing
export function _resetTokenState(): void {
  tokenState = null;
}
