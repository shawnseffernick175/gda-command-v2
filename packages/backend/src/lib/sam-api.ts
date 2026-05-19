// ---------------------------------------------------------------------------
// SAM.gov Opportunities API Client
// Fetches contract opportunities from api.sam.gov/opportunities/v2/search
// Docs: https://open.gsa.gov/api/get-opportunities-public-api/
// ---------------------------------------------------------------------------

import { log } from "./logger";

const SAM_API_BASE = "https://api.sam.gov/opportunities/v2/search";

export interface SAMOpportunityRaw {
  noticeId: string;
  title: string;
  solicitationNumber?: string;
  fullParentPathName?: string;
  fullParentPathCode?: string;
  postedDate: string;
  type: string;
  baseType: string;
  archiveType?: string;
  archiveDate?: string;
  typeOfSetAsideDescription?: string;
  typeOfSetAside?: string;
  responseDeadLine?: string;
  naicsCode?: string;
  naicsCodes?: string[];
  classificationCode?: string;
  active: string;
  organizationType?: string;
  description?: string;
  organizationId?: string;
  pointOfContact?: Array<{
    fax?: string;
    type: string;
    email?: string;
    phone?: string;
    title?: string;
    fullName?: string;
  }>;
  officeAddress?: {
    zipcode?: string;
    city?: string;
    countryCode?: string;
    state?: string;
  };
  placeOfPerformance?: {
    city?: { code?: string; name?: string };
    state?: { code?: string; name?: string };
    country?: { code?: string; name?: string };
  };
  award?: {
    date?: string;
    number?: string;
    amount?: string;
    awardee?: {
      name?: string;
      duns?: string;
      ueiSAM?: string;
    };
  };
  additionalInfoLink?: string;
  uiLink?: string;
  links?: Array<{ rel: string; href: string }>;
}

export interface SAMSearchResponse {
  totalRecords: number;
  limit: number;
  offset: number;
  opportunitiesData: SAMOpportunityRaw[];
}

export interface SAMSearchParams {
  postedFrom: string; // MM/dd/yyyy
  postedTo: string;   // MM/dd/yyyy
  ptype?: string;     // o=Solicitation, p=Pre-solicitation, k=Combined, etc.
  ncode?: string;     // NAICS code filter
  typeOfSetAside?: string;
  title?: string;
  solnum?: string;
  limit?: number;     // max 1000
  offset?: number;
}

export function isSAMConfigured(): boolean {
  return Boolean(process.env.SAM_API_KEY);
}

export async function searchOpportunities(
  params: SAMSearchParams,
): Promise<SAMSearchResponse> {
  const apiKey = process.env.SAM_API_KEY;
  if (!apiKey) {
    throw new Error("SAM_API_KEY environment variable is not set");
  }

  const url = new URL(SAM_API_BASE);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("postedFrom", params.postedFrom);
  url.searchParams.set("postedTo", params.postedTo);
  url.searchParams.set("limit", String(params.limit ?? 100));
  url.searchParams.set("offset", String(params.offset ?? 0));

  if (params.ptype) url.searchParams.set("ptype", params.ptype);
  if (params.ncode) url.searchParams.set("ncode", params.ncode);
  if (params.typeOfSetAside) url.searchParams.set("typeOfSetAside", params.typeOfSetAside);
  if (params.title) url.searchParams.set("title", params.title);
  if (params.solnum) url.searchParams.set("solnum", params.solnum);

  log.info("sam_api_request", { url: SAM_API_BASE, params: { ...params, api_key: "***" } });

  const resp = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`SAM API ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = (await resp.json()) as SAMSearchResponse;
  log.info("sam_api_response", {
    totalRecords: data.totalRecords,
    returned: data.opportunitiesData?.length ?? 0,
  });
  return data;
}

/** Fetch ALL pages of results for the given date range. */
export async function fetchAllOpportunities(
  params: Omit<SAMSearchParams, "limit" | "offset">,
  maxPages = 10,
): Promise<SAMOpportunityRaw[]> {
  const all: SAMOpportunityRaw[] = [];
  const pageSize = 1000;

  for (let page = 0; page < maxPages; page++) {
    const result = await searchOpportunities({
      ...params,
      limit: pageSize,
      offset: page * pageSize,
    });

    if (result.opportunitiesData?.length) {
      all.push(...result.opportunitiesData);
    }

    if (!result.opportunitiesData?.length || all.length >= result.totalRecords) {
      break;
    }

    // Rate limiting: SAM.gov recommends modest request rates
    await new Promise((r) => setTimeout(r, 500));
  }

  return all;
}

/** Format a Date to SAM's required MM/dd/yyyy format. */
export function toSAMDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/** Convert empty strings to null for timestamp columns. */
function tsOrNull(value: string | undefined): string | null {
  return value && value.trim() !== "" ? value : null;
}

/** Map raw SAM API response to our DB schema shape. */
export function mapToDBRecord(raw: SAMOpportunityRaw): Record<string, unknown> {
  const orgParts = raw.fullParentPathName?.split(".") ?? [];
  const agency = orgParts[0]?.trim() ?? "";
  const subAgency = orgParts.slice(1).join(" / ").trim() || null;

  let placeOfPerf = "";
  if (raw.placeOfPerformance) {
    const parts: string[] = [];
    if (raw.placeOfPerformance.city?.name) parts.push(raw.placeOfPerformance.city.name);
    if (raw.placeOfPerformance.state?.name) parts.push(raw.placeOfPerformance.state.name);
    if (raw.placeOfPerformance.country?.name && raw.placeOfPerformance.country.name !== "UNITED STATES") {
      parts.push(raw.placeOfPerformance.country.name);
    }
    placeOfPerf = parts.join(", ");
  }

  return {
    id: `sam-${raw.noticeId}`,
    notice_id: raw.noticeId,
    title: raw.title ?? "Untitled",
    agency,
    sub_agency: subAgency,
    type: raw.type ?? raw.baseType ?? "unknown",
    set_aside: raw.typeOfSetAsideDescription ?? raw.typeOfSetAside ?? null,
    naics: raw.naicsCode ?? (raw.naicsCodes?.[0]) ?? null,
    naics_description: null, // SAM API doesn't return NAICS description inline
    psc: raw.classificationCode ?? null,
    value_estimate: raw.award?.amount ? parseFloat(raw.award.amount) : null,
    response_deadline: tsOrNull(raw.responseDeadLine),
    posted_date: tsOrNull(raw.postedDate),
    archive_date: tsOrNull(raw.archiveDate),
    place_of_performance: placeOfPerf || null,
    relevance_score: 50, // default; overridden by AI scoring later
    relevance_reasons: [],
    ai_summary: null,
    scan_status: "new",
    matched_naics: false,
    matched_keywords: [],
    sam_url: raw.uiLink ?? (raw.additionalInfoLink ?? `https://sam.gov/opp/${raw.noticeId}/view`),
  };
}
