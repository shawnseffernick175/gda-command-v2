// ---------------------------------------------------------------------------
// USAspending / FPDS Awards API Client
// Fetches contract award data from api.usaspending.gov (no API key required)
// Docs: https://api.usaspending.gov/docs/endpoints
// ---------------------------------------------------------------------------

import { log } from "./logger";

const USA_SPENDING_BASE = "https://api.usaspending.gov/api/v2";

export interface USASpendingAward {
  internal_id: number;
  Award_ID: string;
  generated_internal_id: string;
  Recipient_Name: string;
  recipient_id: string | null;
  Awarding_Agency: string;
  Awarding_Sub_Agency: string;
  Award_Amount: number;
  Total_Outlays: number;
  Description: string;
  Start_Date: string;
  End_Date: string;
  Last_Date_to_Order: string | null;
  Award_Type: string;
  contract_award_type?: string;
  Funding_Agency?: string;
  Funding_Sub_Agency?: string;
  awarding_agency_id?: number;
  funding_agency_id?: number;
  recipient_uei?: string;
  Place_of_Performance_City?: string;
  Place_of_Performance_State_Code?: string;
  Place_of_Performance_Country_Code?: string;
  def_codes?: string[];
  COVID_Spending?: string;
  Infrastructure_Spending?: string;
}

export interface USASpendingSearchResponse {
  limit: number;
  results: USASpendingAward[];
  page_metadata: {
    page: number;
    hasNext: boolean;
    hasPrevious: boolean;
    total: number;
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

  const body = {
    filters,
    fields: [
      "Award_ID", "Recipient_Name", "Awarding_Agency", "Awarding_Sub_Agency",
      "Award_Amount", "Total_Outlays", "Description", "Start_Date", "End_Date",
      "Last_Date_to_Order", "Award_Type", "contract_award_type",
      "Funding_Agency", "Funding_Sub_Agency",
      "Place_of_Performance_City", "Place_of_Performance_State_Code",
      "Place_of_Performance_Country_Code",
    ],
    limit: params.limit ?? 50,
    page: params.page ?? 1,
    sort: "Award_Amount",
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
  A: "BPA Call",
  B: "Purchase Order",
  C: "Delivery Order",
  D: "Definitive Contract",
};

/** Map USAspending response to our fpds_awards DB schema. */
export function mapToDBRecord(raw: USASpendingAward): Record<string, unknown> {
  const pop = [
    raw.Place_of_Performance_City,
    raw.Place_of_Performance_State_Code,
  ].filter(Boolean).join(", ");

  return {
    id: `fpds-${raw.generated_internal_id ?? raw.Award_ID}`,
    piid: raw.Award_ID ?? "",
    title: raw.Description ?? `Award ${raw.Award_ID}`,
    agency: raw.Awarding_Agency ?? "",
    vendor: raw.Recipient_Name ?? "",
    vendor_duns: null,
    award_amount: raw.Award_Amount ?? 0,
    ceiling_amount: null,
    award_date: raw.Start_Date ?? new Date().toISOString().slice(0, 10),
    period_of_performance_start: raw.Start_Date ?? null,
    period_of_performance_end: raw.End_Date ?? null,
    award_type: AWARD_TYPE_MAP[raw.contract_award_type ?? ""] ?? raw.Award_Type ?? "unknown",
    competition_type: "unknown", // USAspending doesn't return this directly
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
