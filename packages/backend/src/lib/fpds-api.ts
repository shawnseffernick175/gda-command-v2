// ---------------------------------------------------------------------------
// USAspending / FPDS Awards API Client
// Fetches contract award data from api.usaspending.gov (no API key required)
// Docs: https://api.usaspending.gov/docs/endpoints
// ---------------------------------------------------------------------------

import { log } from "./logger";

const USA_SPENDING_BASE = "https://api.usaspending.gov/api/v2";

// USAspending API returns field names with spaces, not underscores
export interface USASpendingAward {
  internal_id: number;
  "Award ID": string;
  generated_internal_id: string;
  "Recipient Name": string;
  recipient_id?: string | null;
  "Awarding Agency": string;
  "Awarding Sub Agency": string;
  "Award Amount": number;
  "Total Outlays": number;
  Description: string;
  "Start Date": string;
  "End Date": string;
  "Last Date to Order"?: string | null;
  "Award Type": string | null;
  "Contract Award Type"?: string;
  "Funding Agency"?: string;
  "Funding Sub Agency"?: string;
  awarding_agency_id?: number;
  funding_agency_id?: number;
  "Recipient UEI"?: string;
  "Place of Performance City Code"?: string;
  "Place of Performance State Code"?: string;
  "Place of Performance Country Code"?: string;
  def_codes?: string[];
  agency_slug?: string;
}

export interface USASpendingSearchResponse {
  spending_level?: string;
  limit: number;
  results: USASpendingAward[];
  page_metadata: {
    page: number;
    hasNext: boolean;
    hasPrevious?: boolean;
    total?: number;
    last_record_unique_id?: number;
    last_record_sort_value?: string;
  };
  messages?: string[];
}

export interface FPDSSearchParams {
  keywords?: string[];
  agencies?: string[];
  naicsCodes?: string[];
  dateRange?: { start_date: string; end_date: string }; // YYYY-MM-DD
  awardAmountMin?: number;
  awardAmountMax?: number;
  limit?: number;
  page?: number;
}

export async function searchAwards(
  params: FPDSSearchParams,
): Promise<USASpendingSearchResponse> {
  const url = `${USA_SPENDING_BASE}/search/spending_by_award/`;

  const filters: Record<string, unknown> = {
    award_type_codes: ["A", "B", "C", "D"], // contracts only
  };

  if (params.keywords?.length) {
    filters.keywords = params.keywords;
  }

  if (params.agencies?.length) {
    filters.agencies = params.agencies.map((name) => ({
      type: "awarding",
      tier: "toptier",
      name,
    }));
  }

  if (params.naicsCodes?.length) {
    filters.naics_codes = params.naicsCodes.map((code) => ({ naics_code: code }));
  }

  if (params.dateRange) {
    filters.time_period = [params.dateRange];
  } else {
    // Default: last 90 days
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 90);
    filters.time_period = [{
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
    }];
  }

  if (params.awardAmountMin !== undefined || params.awardAmountMax !== undefined) {
    filters.award_amounts = [{
      lower_bound: params.awardAmountMin ?? 0,
      upper_bound: params.awardAmountMax ?? 1_000_000_000,
    }];
  }

  // USAspending API uses space-separated field names
  const body = {
    filters,
    fields: [
      "Award ID", "Recipient Name", "Awarding Agency", "Awarding Sub Agency",
      "Award Amount", "Total Outlays", "Description", "Start Date", "End Date",
      "Last Date to Order", "Award Type", "Contract Award Type",
      "Funding Agency", "Funding Sub Agency",
      "Place of Performance City Code", "Place of Performance State Code",
      "Place of Performance Country Code",
    ],
    limit: params.limit ?? 50,
    page: params.page ?? 1,
    sort: "Award Amount",
    order: "desc",
    subawards: false,
  };

  log.info("usaspending_api_request", {
    url,
    keywords: params.keywords,
    page: params.page ?? 1,
  });

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`USAspending API ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = (await resp.json()) as USASpendingSearchResponse;
  log.info("usaspending_api_response", {
    total: data.page_metadata?.total ?? 0,
    returned: data.results?.length ?? 0,
  });
  return data;
}

/** Fetch multiple pages of awards. */
export async function fetchAllAwards(
  params: Omit<FPDSSearchParams, "limit" | "page">,
  maxPages = 5,
  pageSize = 100,
): Promise<USASpendingAward[]> {
  const all: USASpendingAward[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const result = await searchAwards({ ...params, limit: pageSize, page });

    if (result.results?.length) {
      all.push(...result.results);
    }

    if (!result.page_metadata?.hasNext || !result.results?.length) {
      break;
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  return all;
}

/** Award type code to human label */
const AWARD_TYPE_MAP: Record<string, string> = {
  "BPA CALL": "BPA Call",
  "PURCHASE ORDER": "Purchase Order",
  "DELIVERY ORDER": "Delivery Order",
  "DEFINITIVE CONTRACT": "Definitive Contract",
};

/** Map USAspending response to our fpds_awards DB schema. */
export function mapToDBRecord(raw: USASpendingAward): Record<string, unknown> {
  const pop = [
    raw["Place of Performance City Code"],
    raw["Place of Performance State Code"],
  ].filter(Boolean).join(", ");

  const contractType = raw["Contract Award Type"] ?? "";

  return {
    id: `fpds-${raw.generated_internal_id ?? raw["Award ID"]}`,
    piid: raw["Award ID"] ?? "",
    title: raw.Description ?? `Award ${raw["Award ID"]}`,
    agency: raw["Awarding Agency"] ?? "",
    vendor: raw["Recipient Name"] ?? "",
    vendor_duns: null,
    award_amount: raw["Award Amount"] ?? 0,
    ceiling_amount: null,
    award_date: raw["Start Date"] ?? new Date().toISOString().slice(0, 10),
    period_of_performance_start: raw["Start Date"] ?? null,
    period_of_performance_end: raw["End Date"] ?? null,
    award_type: AWARD_TYPE_MAP[contractType] ?? (contractType || raw["Award Type"]) ?? "unknown",
    competition_type: "unknown",
    naics: null,
    psc: null,
    place_of_performance: pop || null,
    is_competitor: false,
    competitor_name: null,
    is_recompete_candidate: false,
    recompete_date: null,
    relevance_score: 50,
    fpds_url: `https://usaspending.gov/award/${raw.generated_internal_id ?? ""}`,
  };
}
