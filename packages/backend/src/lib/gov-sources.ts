// ---------------------------------------------------------------------------
// Multi-Source Government Feed Manager
// Provides a unified interface for pulling opportunities from:
// - GovTribe (via MCP server at govtribe.com/mcp — requires API key)
// - GovWin IQ (requires Deltek subscription)
// - SAM.gov and FPDS are handled by feed-sync.ts
// Note: DIBBS (no real API) is disabled.
// ---------------------------------------------------------------------------

import { getPool } from "./db";
import { log } from "./logger";

export interface GovSourceConfig {
  id: string;
  source: string;
  name: string;
  base_url: string | null;
  enabled: boolean;
  search_params: Record<string, unknown>;
  last_sync_at: string | null;
  last_sync_count: number;
  error_count: number;
  deprecated_at: string | null;
  deprecation_reason: string | null;
}

export interface GovSourceResult {
  source: string;
  status: "success" | "skipped" | "error";
  fetched: number;
  upserted: number;
  error?: string;
  durationMs: number;
}

export interface GovOpportunity {
  external_id: string;
  source: string;
  title: string;
  description?: string;
  agency?: string;
  posted_date?: string;
  due_date?: string;
  naics_code?: string;
  set_aside?: string;
  url?: string;
  value_estimate?: number;
  place_of_performance?: string;
}

// ---------------------------------------------------------------------------
// Response validation helper
// ---------------------------------------------------------------------------
function validateJsonResponse(resp: Response, source: string): boolean {
  const contentType = resp.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    log.error(`${source}_invalid_content_type`, {
      status: resp.status,
      contentType,
      url: resp.url,
      hint: contentType.includes("text/html")
        ? "Received HTML instead of JSON — likely a login page or error page. Check API credentials."
        : "Response is not JSON. Check API endpoint URL and authentication.",
    });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// GovTribe MCP Client (govtribe.com/mcp — Streamable HTTP)
// ---------------------------------------------------------------------------
const GOVTRIBE_API_KEY = process.env.GOVTRIBE_API_KEY;
const GOVTRIBE_MCP_URL = "https://govtribe.com/mcp";

interface GovTribeMCPResponse {
  jsonrpc: string;
  id: number;
  result?: {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
  error?: { code: number; message: string };
}

interface GovTribeOppRow {
  govtribe_id?: string;
  name?: string;
  solicitation_number?: string;
  posted_date?: string;
  due_date?: string;
  opportunity_type?: string;
  set_aside_type?: string;
  govtribe_url?: string;
  federal_agency?: { name?: string };
  naics_category?: { govtribe_id?: string; name?: string };
  place_of_performance?: { name?: string };
}

async function callGovTribeMCP(
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const resp = await fetch(GOVTRIBE_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GOVTRIBE_API_KEY}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });

  if (!resp.ok) {
    throw new Error(`GovTribe MCP HTTP ${resp.status}: ${resp.statusText}`);
  }

  if (!validateJsonResponse(resp, "govtribe_mcp")) {
    throw new Error("GovTribe MCP returned non-JSON response");
  }

  const data = (await resp.json()) as GovTribeMCPResponse;

  if (data.error) {
    throw new Error(`GovTribe MCP error ${data.error.code}: ${data.error.message}`);
  }

  if (data.result?.isError) {
    const errText = data.result.content?.[0]?.text ?? "Unknown MCP error";
    throw new Error(`GovTribe MCP tool error: ${errText}`);
  }

  return data.result?.content?.[0]?.text ?? "{}";
}

function mapGovTribeOpp(row: GovTribeOppRow): GovOpportunity {
  return {
    external_id: `govtribe-${row.govtribe_id ?? ""}`,
    source: "govtribe",
    title: row.name ?? "",
    agency: row.federal_agency?.name,
    posted_date: row.posted_date ?? undefined,
    due_date: row.due_date ?? undefined,
    naics_code: row.naics_category?.govtribe_id,
    set_aside: row.set_aside_type ?? undefined,
    url: row.govtribe_url,
    place_of_performance: row.place_of_performance?.name,
  };
}

async function fetchGovTribeOpportunities(
  params: Record<string, unknown>,
): Promise<GovOpportunity[]> {
  if (!GOVTRIBE_API_KEY) {
    log.warn("govtribe_no_api_key", { hint: "Set GOVTRIBE_API_KEY to enable GovTribe MCP integration" });
    return [];
  }

  const keywords = (params.keywords ?? params.categories ?? []) as string[];
  const allOpps: GovOpportunity[] = [];
  const seenIds = new Set<string>();

  // If keywords are configured, search for each; otherwise do a broad recent search
  const queries = keywords.length > 0 ? keywords : [""];

  for (const query of queries) {
    try {
      const args: Record<string, unknown> = {
        search_mode: "keyword",
        fields_to_return: [
          "govtribe_id",
          "name",
          "solicitation_number",
          "posted_date",
          "due_date",
          "opportunity_type",
          "set_aside_type",
          "federal_agency",
          "naics_category",
          "place_of_performance",
          "govtribe_url",
        ],
        per_page: 50,
        page: 1,
        sort: { key: "postedDate", direction: "desc" },
      };

      if (query) {
        args.query = query;
      }

      const text = await callGovTribeMCP(
        "Search_Federal_Contract_Opportunities",
        args,
      );

      const result = JSON.parse(text) as {
        data?: GovTribeOppRow[];
        total?: number;
      };

      log.info("govtribe_mcp_search", {
        query: query || "(all recent)",
        total: result.total ?? 0,
        returned: result.data?.length ?? 0,
      });

      for (const row of result.data ?? []) {
        const id = row.govtribe_id;
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        allOpps.push(mapGovTribeOpp(row));
      }
    } catch (e) {
      log.warn("govtribe_mcp_search_error", {
        query,
        error: (e as Error).message,
      });
    }
  }

  return allOpps;
}

// ---------------------------------------------------------------------------
// GovWin IQ Client (requires subscription API key)
// ---------------------------------------------------------------------------
const GOVWIN_API_KEY = process.env.GOVWIN_API_KEY;

async function fetchGovWinOpportunities(params: Record<string, unknown>): Promise<GovOpportunity[]> {
  if (!GOVWIN_API_KEY) return [];

  const categories = (params.categories ?? []) as string[];
  const results: GovOpportunity[] = [];

  try {
    // GovWin uses a REST API with authentication
    const resp = await fetch("https://iq.govwin.com/neo/api/v1/opportunities", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": GOVWIN_API_KEY,
      },
      body: JSON.stringify({
        filters: { categories, status: "active" },
        limit: 100,
        sort: { field: "postedDate", direction: "desc" },
      }),
    });

    if (!resp.ok) {
      log.warn("govwin_fetch_error", { status: resp.status, url: resp.url });
      return [];
    }

    if (!validateJsonResponse(resp, "govwin")) {
      return [];
    }

    const data = await resp.json() as { items?: Array<Record<string, unknown>> };
    for (const item of data.items ?? []) {
      results.push({
        external_id: `govwin-${String(item.id ?? "")}`,
        source: "govwin",
        title: String(item.title ?? ""),
        description: String(item.synopsis ?? ""),
        agency: String(item.agency ?? ""),
        posted_date: item.postedDate ? String(item.postedDate) : undefined,
        due_date: item.responseDate ? String(item.responseDate) : undefined,
        naics_code: item.naicsCode ? String(item.naicsCode) : undefined,
        set_aside: item.setAside ? String(item.setAside) : undefined,
        url: `https://iq.govwin.com/neo/opportunity/${String(item.id ?? "")}`,
        value_estimate: item.estimatedValue ? Number(item.estimatedValue) : undefined,
      });
    }
  } catch (e) {
    log.warn("govwin_fetch_error", { error: (e as Error).message });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Unified sync function — pulls from all configured gov sources
// ---------------------------------------------------------------------------
export async function syncGovSources(): Promise<GovSourceResult[]> {
  const pool = getPool();
  if (!pool) return [];

  const results: GovSourceResult[] = [];

  // Load configured feeds from DB
  let feeds: GovSourceConfig[] = [];
  try {
    const { rows } = await pool.query("SELECT * FROM gov_source_feeds WHERE enabled = true");
    feeds = rows as GovSourceConfig[];
  } catch {
    // Table may not exist yet — use defaults
    feeds = [];
  }

  const sourceHandlers: Record<string, (params: Record<string, unknown>) => Promise<GovOpportunity[]>> = {
    govtribe: fetchGovTribeOpportunities,
    govwin: fetchGovWinOpportunities,
  };

  for (const feed of feeds) {
    // Skip deprecated sources — they produce noise, not data
    if (feed.deprecated_at) {
      log.info("gov_source_skipped_deprecated", {
        source: feed.source,
        reason: feed.deprecation_reason ?? "deprecated",
      });
      results.push({
        source: feed.source,
        status: "skipped",
        fetched: 0,
        upserted: 0,
        durationMs: 0,
        error: feed.deprecation_reason ?? "Source deprecated",
      });
      continue;
    }

    const handler = sourceHandlers[feed.source];
    if (!handler) continue; // SAM and FPDS handled by existing feed-sync.ts

    const start = Date.now();
    try {
      const opps = await handler(feed.search_params ?? {});

      if (opps.length === 0) {
        results.push({ source: feed.source, status: "skipped", fetched: 0, upserted: 0, durationMs: Date.now() - start });
        continue;
      }

      let upserted = 0;
      for (const opp of opps) {
        try {
          await pool.query(
            `INSERT INTO opportunities (
              id, title, agency, naics, set_aside, due_date,
              raw_source_url, data_source, status, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'discovery', NOW())
            ON CONFLICT (id) DO UPDATE SET
              title = EXCLUDED.title,
              agency = COALESCE(EXCLUDED.agency, opportunities.agency),
              due_date = COALESCE(EXCLUDED.due_date, opportunities.due_date)`,
            [
              opp.external_id,
              opp.title,
              opp.agency ?? null,
              opp.naics_code ?? null,
              opp.set_aside ?? null,
              opp.due_date ?? null,
              opp.url ?? null,
              opp.source,
            ],
          );
          upserted++;
        } catch (e) {
          log.warn("gov_source_upsert_error", { source: feed.source, id: opp.external_id, error: (e as Error).message });
        }
      }

      // Update feed tracking
      await pool.query(
        `UPDATE gov_source_feeds SET last_sync_at = NOW(), last_sync_count = $2, error_count = 0, updated_at = NOW() WHERE id = $1`,
        [feed.id, upserted],
      ).catch(() => {});

      results.push({ source: feed.source, status: "success", fetched: opps.length, upserted, durationMs: Date.now() - start });
      log.info("gov_source_synced", { source: feed.source, fetched: opps.length, upserted });
    } catch (e) {
      const error = (e as Error).message;
      results.push({ source: feed.source, status: "error", fetched: 0, upserted: 0, error, durationMs: Date.now() - start });

      await pool.query(
        `UPDATE gov_source_feeds SET error_count = error_count + 1, updated_at = NOW() WHERE id = $1`,
        [feed.id],
      ).catch(() => {});

      log.error("gov_source_sync_error", { source: feed.source, error });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Get status of all gov source feeds
// ---------------------------------------------------------------------------
export async function getGovSourceStatus(): Promise<GovSourceConfig[]> {
  const pool = getPool();
  if (!pool) return [];

  try {
    const { rows } = await pool.query("SELECT * FROM gov_source_feeds ORDER BY source");
    return rows as GovSourceConfig[];
  } catch {
    return [];
  }
}
