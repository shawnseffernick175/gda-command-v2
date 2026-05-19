// ---------------------------------------------------------------------------
// Multi-Source Government Feed Manager
// Provides a unified interface for pulling data from:
// - GovTribe (via MCP server at govtribe.com/mcp — 57 tools available)
//   Tier 1: Opportunities, Awards, Forecasts (scheduled + on-demand)
//   Tier 2: Contacts, Vendors, Contract Vehicles (on-demand)
//   Tier 3: Labor Rate Benchmarks, BLS Wage Data (on-demand)
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
// GovTribe data types for Tier 1+2 integrations
// ---------------------------------------------------------------------------

export interface GovTribeAward {
  govtribe_id: string;
  name: string;
  contract_number?: string;
  award_date?: string;
  completion_date?: string;
  dollars_obligated?: number;
  ceiling_value?: number;
  set_aside_type?: string;
  extent_competed?: string;
  pricing_type?: string;
  contract_type?: string;
  agency?: string;
  vendor?: string;
  vendor_uei?: string;
  naics_code?: string;
  psc_code?: string;
  place_of_performance?: string;
  govtribe_url?: string;
}

export interface GovTribeForecast {
  govtribe_id: string;
  name: string;
  description?: string;
  estimated_value?: number;
  estimated_award_date?: string;
  agency?: string;
  naics_code?: string;
  place_of_performance?: string;
  govtribe_url?: string;
}

export interface GovTribeContact {
  govtribe_id: string;
  name: string;
  email?: string;
  phone?: string;
  title?: string;
  organization?: string;
  types?: string[];
  govtribe_url?: string;
}

export interface GovTribeVendor {
  govtribe_id: string;
  name: string;
  uei?: string;
  dba?: string;
  location?: string;
  address?: string;
  sba_certifications?: string[];
  business_types?: string[];
  cage_codes?: string[];
  activation_date?: string;
  registration_expiration_date?: string;
  naics_code?: string;
  govtribe_url?: string;
}

export interface GovTribeVehicle {
  govtribe_id: string;
  name: string;
  description?: string;
  agency?: string;
  vehicle_type?: string;
  govtribe_url?: string;
}

export interface GovTribeLaborRate {
  labor_category: string;
  vendor_name?: string;
  contract_number?: string;
  benchmark_price?: number;
  current_price?: number;
  worksite?: string;
  business_size?: string;
  education_level?: string;
  security_clearance?: string;
}

export interface GovTribeSearchResult<T> {
  data: T[];
  total: number;
  current_page: number;
  last_page: number;
  per_page: number;
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

interface GovTribeAwardRow {
  govtribe_id?: string;
  name?: string;
  contract_number?: string;
  award_date?: string;
  completion_date?: string;
  dollars_obligated?: number;
  ceiling_value?: number;
  set_aside_type?: string;
  extent_competed?: string;
  pricing_type?: string;
  contract_type?: string;
  govtribe_url?: string;
  awardee?: { govtribe_id?: string; name?: string; uei?: string };
  contracting_federal_agency?: { name?: string };
  naics_category?: { govtribe_id?: string; name?: string };
  psc_category?: { govtribe_id?: string; name?: string };
  place_of_performance?: { name?: string };
}

interface GovTribeForecastRow {
  govtribe_id?: string;
  name?: string;
  description?: string;
  estimated_value_low?: number;
  estimated_value_high?: number;
  estimated_solicitation_date?: string;
  estimated_award_date?: string;
  govtribe_url?: string;
  federal_agency?: { name?: string };
  naics_category?: { govtribe_id?: string; name?: string };
  place_of_performance?: { name?: string };
}

interface GovTribeContactRow {
  govtribe_id?: string;
  name?: string;
  email?: string;
  phone?: string;
  title?: string;
  types?: string[];
  organization?: string;
  govtribe_url?: string;
  parent_organization_details?: { name?: string };
}

interface GovTribeVendorRow {
  govtribe_id?: string;
  name?: string;
  uei?: string;
  dba?: string;
  location?: { name?: string };
  address?: string;
  sba_certifications?: string[];
  business_types?: string[];
  cage_codes?: string[];
  activation_date?: string;
  registration_expiration_date?: string;
  govtribe_url?: string;
  naics_category?: { govtribe_id?: string; name?: string };
}

interface GovTribeVehicleRow {
  govtribe_id?: string;
  name?: string;
  description?: string;
  govtribe_url?: string;
  federal_agency?: { name?: string };
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
// GovTribe Awards (Tier 1 — scheduled + on-demand)
// ---------------------------------------------------------------------------

function mapGovTribeAward(row: GovTribeAwardRow): GovTribeAward {
  return {
    govtribe_id: row.govtribe_id ?? "",
    name: row.name ?? "",
    contract_number: row.contract_number,
    award_date: row.award_date,
    completion_date: row.completion_date,
    dollars_obligated: row.dollars_obligated,
    ceiling_value: row.ceiling_value,
    set_aside_type: row.set_aside_type,
    extent_competed: row.extent_competed,
    pricing_type: row.pricing_type,
    contract_type: row.contract_type,
    agency: row.contracting_federal_agency?.name,
    vendor: row.awardee?.name,
    vendor_uei: row.awardee?.uei,
    naics_code: row.naics_category?.govtribe_id,
    psc_code: row.psc_category?.govtribe_id,
    place_of_performance: row.place_of_performance?.name,
    govtribe_url: row.govtribe_url,
  };
}

export async function searchGovTribeAwards(
  query: string,
  options: { per_page?: number; page?: number; date_range?: string } = {},
): Promise<GovTribeSearchResult<GovTribeAward>> {
  if (!GOVTRIBE_API_KEY) throw new Error("GOVTRIBE_API_KEY not configured");

  const args: Record<string, unknown> = {
    search_mode: "keyword",
    fields_to_return: [
      "govtribe_id", "name", "contract_number", "award_date",
      "completion_date", "dollars_obligated", "ceiling_value",
      "set_aside_type", "extent_competed", "pricing_type", "contract_type",
      "awardee", "contracting_federal_agency", "naics_category",
      "psc_category", "place_of_performance", "govtribe_url",
    ],
    per_page: options.per_page ?? 25,
    page: options.page ?? 1,
    sort: { key: "awardDate", direction: "desc" },
  };
  if (query) args.query = query;
  if (options.date_range) args.award_date_range = options.date_range;

  const text = await callGovTribeMCP("Search_Federal_Contract_Awards", args);
  const result = JSON.parse(text) as {
    data?: GovTribeAwardRow[]; total?: number;
    current_page?: number; last_page?: number; per_page?: number;
  };

  log.info("govtribe_awards_search", { query: query || "(all)", total: result.total ?? 0 });

  return {
    data: (result.data ?? []).map(mapGovTribeAward),
    total: result.total ?? 0,
    current_page: result.current_page ?? 1,
    last_page: result.last_page ?? 1,
    per_page: result.per_page ?? 25,
  };
}

// ---------------------------------------------------------------------------
// GovTribe Forecasts (Tier 1 — scheduled + on-demand)
// ---------------------------------------------------------------------------

function mapGovTribeForecast(row: GovTribeForecastRow): GovTribeForecast {
  return {
    govtribe_id: row.govtribe_id ?? "",
    name: row.name ?? "",
    description: row.description,
    estimated_value: row.estimated_value_high ?? row.estimated_value_low,
    estimated_award_date: row.estimated_award_date,
    agency: row.federal_agency?.name,
    naics_code: row.naics_category?.govtribe_id,
    place_of_performance: row.place_of_performance?.name,
    govtribe_url: row.govtribe_url,
  };
}

export async function searchGovTribeForecasts(
  query: string,
  options: { per_page?: number; page?: number } = {},
): Promise<GovTribeSearchResult<GovTribeForecast>> {
  if (!GOVTRIBE_API_KEY) throw new Error("GOVTRIBE_API_KEY not configured");

  const args: Record<string, unknown> = {
    search_mode: "keyword",
    fields_to_return: [
      "govtribe_id", "name", "description",
      "estimated_value_low", "estimated_value_high",
      "estimated_solicitation_date", "estimated_award_date",
      "federal_agency", "naics_category", "place_of_performance",
      "govtribe_url",
    ],
    per_page: options.per_page ?? 25,
    page: options.page ?? 1,
  };
  if (query) args.query = query;

  const text = await callGovTribeMCP("Search_Federal_Forecasts", args);
  const result = JSON.parse(text) as {
    data?: GovTribeForecastRow[]; total?: number;
    current_page?: number; last_page?: number; per_page?: number;
  };

  log.info("govtribe_forecasts_search", { query: query || "(all)", total: result.total ?? 0 });

  return {
    data: (result.data ?? []).map(mapGovTribeForecast),
    total: result.total ?? 0,
    current_page: result.current_page ?? 1,
    last_page: result.last_page ?? 1,
    per_page: result.per_page ?? 25,
  };
}

// ---------------------------------------------------------------------------
// GovTribe Contacts (Tier 2 — on-demand)
// ---------------------------------------------------------------------------

function mapGovTribeContact(row: GovTribeContactRow): GovTribeContact {
  return {
    govtribe_id: row.govtribe_id ?? "",
    name: row.name ?? "",
    email: row.email,
    phone: row.phone,
    title: row.title,
    organization: row.parent_organization_details?.name ?? row.organization,
    types: row.types,
    govtribe_url: row.govtribe_url,
  };
}

export async function searchGovTribeContacts(
  query: string,
  options: { per_page?: number; page?: number; agency_ids?: string[] } = {},
): Promise<GovTribeSearchResult<GovTribeContact>> {
  if (!GOVTRIBE_API_KEY) throw new Error("GOVTRIBE_API_KEY not configured");

  const args: Record<string, unknown> = {
    search_mode: "keyword",
    fields_to_return: [
      "govtribe_id", "name", "email", "phone", "title",
      "types", "organization", "parent_organization_details",
      "govtribe_url",
    ],
    per_page: options.per_page ?? 25,
    page: options.page ?? 1,
  };
  if (query) args.query = query;
  if (options.agency_ids?.length) args.federal_agency_ids = options.agency_ids;

  const text = await callGovTribeMCP("Search_Contacts", args);
  const result = JSON.parse(text) as {
    data?: GovTribeContactRow[]; total?: number;
    current_page?: number; last_page?: number; per_page?: number;
  };

  log.info("govtribe_contacts_search", { query: query || "(all)", total: result.total ?? 0 });

  return {
    data: (result.data ?? []).map(mapGovTribeContact),
    total: result.total ?? 0,
    current_page: result.current_page ?? 1,
    last_page: result.last_page ?? 1,
    per_page: result.per_page ?? 25,
  };
}

// ---------------------------------------------------------------------------
// GovTribe Vendors (Tier 2 — on-demand)
// ---------------------------------------------------------------------------

function mapGovTribeVendor(row: GovTribeVendorRow): GovTribeVendor {
  return {
    govtribe_id: row.govtribe_id ?? "",
    name: row.name ?? "",
    uei: row.uei,
    dba: row.dba,
    location: row.location?.name,
    address: row.address,
    sba_certifications: row.sba_certifications,
    business_types: row.business_types,
    cage_codes: row.cage_codes,
    activation_date: row.activation_date,
    registration_expiration_date: row.registration_expiration_date,
    naics_code: row.naics_category?.govtribe_id,
    govtribe_url: row.govtribe_url,
  };
}

export async function searchGovTribeVendors(
  query: string,
  options: { per_page?: number; page?: number; sba_certs?: string[] } = {},
): Promise<GovTribeSearchResult<GovTribeVendor>> {
  if (!GOVTRIBE_API_KEY) throw new Error("GOVTRIBE_API_KEY not configured");

  const args: Record<string, unknown> = {
    search_mode: "keyword",
    fields_to_return: [
      "govtribe_id", "name", "uei", "dba", "location", "address",
      "sba_certifications", "business_types", "cage_codes",
      "activation_date", "registration_expiration_date",
      "naics_category", "govtribe_url",
    ],
    per_page: options.per_page ?? 25,
    page: options.page ?? 1,
  };
  if (query) args.query = query;
  if (options.sba_certs?.length) args.sba_certifications = options.sba_certs;

  const text = await callGovTribeMCP("Search_Vendors", args);
  const result = JSON.parse(text) as {
    data?: GovTribeVendorRow[]; total?: number;
    current_page?: number; last_page?: number; per_page?: number;
  };

  log.info("govtribe_vendors_search", { query: query || "(all)", total: result.total ?? 0 });

  return {
    data: (result.data ?? []).map(mapGovTribeVendor),
    total: result.total ?? 0,
    current_page: result.current_page ?? 1,
    last_page: result.last_page ?? 1,
    per_page: result.per_page ?? 25,
  };
}

// ---------------------------------------------------------------------------
// GovTribe Contract Vehicles (Tier 2 — on-demand)
// ---------------------------------------------------------------------------

function mapGovTribeVehicle(row: GovTribeVehicleRow): GovTribeVehicle {
  return {
    govtribe_id: row.govtribe_id ?? "",
    name: row.name ?? "",
    description: row.description,
    agency: row.federal_agency?.name,
    govtribe_url: row.govtribe_url,
  };
}

export async function searchGovTribeVehicles(
  query: string,
  options: { per_page?: number; page?: number } = {},
): Promise<GovTribeSearchResult<GovTribeVehicle>> {
  if (!GOVTRIBE_API_KEY) throw new Error("GOVTRIBE_API_KEY not configured");

  const args: Record<string, unknown> = {
    search_mode: "keyword",
    fields_to_return: [
      "govtribe_id", "name", "description",
      "federal_agency", "govtribe_url",
    ],
    per_page: options.per_page ?? 25,
    page: options.page ?? 1,
  };
  if (query) args.query = query;

  const text = await callGovTribeMCP("Search_Federal_Contract_Vehicles", args);
  const result = JSON.parse(text) as {
    data?: GovTribeVehicleRow[]; total?: number;
    current_page?: number; last_page?: number; per_page?: number;
  };

  log.info("govtribe_vehicles_search", { query: query || "(all)", total: result.total ?? 0 });

  return {
    data: (result.data ?? []).map(mapGovTribeVehicle),
    total: result.total ?? 0,
    current_page: result.current_page ?? 1,
    last_page: result.last_page ?? 1,
    per_page: result.per_page ?? 25,
  };
}

// ---------------------------------------------------------------------------
// GovTribe Labor Rate Benchmarks (Tier 3 — on-demand)
// ---------------------------------------------------------------------------

export async function searchGovTribeLaborRates(
  keyword: string,
  options: { worksite?: string[]; business_size?: string[]; contract_year?: string } = {},
): Promise<{ items: GovTribeLaborRate[]; summary: Record<string, unknown> }> {
  if (!GOVTRIBE_API_KEY) throw new Error("GOVTRIBE_API_KEY not configured");

  const args: Record<string, unknown> = {
    mode: "search",
    keyword,
    search_by: "labor_category",
    contract_year: options.contract_year ?? "current",
    fields_to_return: ["items", "summary"],
    item_fields_to_return: [
      "labor_category", "benchmark_price", "current_price",
      "vendor_name", "idv_piid", "schedule",
    ],
  };
  if (options.worksite?.length) args.worksite = options.worksite;
  if (options.business_size?.length) args.business_size = options.business_size;

  const text = await callGovTribeMCP("Labor_Ceiling_Rate_Benchmarks", args);
  const result = JSON.parse(text) as {
    items?: Array<Record<string, unknown>>;
    summary?: Record<string, unknown>;
  };

  log.info("govtribe_labor_rates_search", { keyword, count: result.items?.length ?? 0 });

  return {
    items: (result.items ?? []).map((item) => ({
      labor_category: String(item.labor_category ?? ""),
      vendor_name: item.vendor_name ? String(item.vendor_name) : undefined,
      contract_number: item.idv_piid ? String(item.idv_piid) : undefined,
      benchmark_price: item.benchmark_price != null ? Number(item.benchmark_price) : undefined,
      current_price: item.current_price != null ? Number(item.current_price) : undefined,
      worksite: item.worksite ? String(item.worksite) : undefined,
      business_size: item.business_size ? String(item.business_size) : undefined,
    })),
    summary: result.summary ?? {},
  };
}

// ---------------------------------------------------------------------------
// GovTribe MCP Health Check (Follow-up 1 — automated API key validation)
// ---------------------------------------------------------------------------

export async function checkGovTribeHealth(): Promise<{
  status: "healthy" | "error" | "no_key";
  latencyMs: number;
  toolCount?: number;
  error?: string;
}> {
  if (!GOVTRIBE_API_KEY) {
    return { status: "no_key", latencyMs: 0, error: "GOVTRIBE_API_KEY not set" };
  }

  const start = Date.now();
  try {
    const resp = await fetch(GOVTRIBE_MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GOVTRIBE_API_KEY}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    const latencyMs = Date.now() - start;

    if (!resp.ok) {
      return { status: "error", latencyMs, error: `HTTP ${resp.status}: ${resp.statusText}` };
    }

    const data = (await resp.json()) as { result?: { tools?: unknown[] }; error?: { message?: string } };

    if (data.error) {
      return { status: "error", latencyMs, error: data.error.message ?? "MCP error" };
    }

    return {
      status: "healthy",
      latencyMs,
      toolCount: data.result?.tools?.length ?? 0,
    };
  } catch (e) {
    return { status: "error", latencyMs: Date.now() - start, error: (e as Error).message };
  }
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
