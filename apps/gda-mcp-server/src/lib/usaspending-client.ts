/**
 * Thin fetch wrapper for the USAspending.gov award-search API (F-508).
 * Free, no API key. Used by the gda_company_awards MCP tool to pull a
 * company's recent federal contract awards for competitor intelligence.
 * Docs: https://api.usaspending.gov/docs/endpoints
 */

const SEARCH_URL = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';
const TIMEOUT_MS = 30_000;

// USAspending requires award_type_codes from a SINGLE group per request.
// We use the contract group (definitive contracts + orders), which is what
// matters for competitor/prime intelligence on DoD opportunities.
const CONTRACT_TYPE_CODES = ['A', 'B', 'C', 'D'];

const REQUESTED_FIELDS = [
  'Award ID',
  'Recipient Name',
  'Award Amount',
  'Description',
  'Contract Award Type',
  'Awarding Agency',
  'Awarding Sub Agency',
  'Start Date',
  'End Date',
  'NAICS Code',
  'PSC Code',
  'generated_internal_id',
];

export interface UsaAward {
  award_id: string | null;
  recipient: string | null;
  amount: number | null;
  description: string | null;
  award_type: string | null;
  awarding_agency: string | null;
  awarding_sub_agency: string | null;
  start_date: string | null;
  end_date: string | null;
  naics: string | null;
  psc: string | null;
  url: string;
}

export interface UsaAwardsResult {
  recipient_query: string;
  dod_only: boolean;
  count: number;
  awards: UsaAward[];
}

export class UsaSpendingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsaSpendingError';
  }
}

interface SpendingByAwardResponse {
  results?: Array<Record<string, unknown>>;
  detail?: string;
}

/**
 * Fetch a company's recent federal contract awards from USAspending.gov.
 * Filters by recipient name (substring match handled server-side), optional
 * DoD-only scope, time window (default last N years), sorted by award amount.
 */
export async function getCompanyAwards(params: {
  company: string;
  dodOnly: boolean;
  years: number;
  limit: number;
}): Promise<UsaAwardsResult> {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - params.years);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const filters: Record<string, unknown> = {
    recipient_search_text: [params.company],
    award_type_codes: CONTRACT_TYPE_CODES,
    time_period: [{ start_date: fmt(start), end_date: fmt(end) }],
  };
  if (params.dodOnly) {
    filters['agencies'] = [
      { type: 'awarding', tier: 'toptier', name: 'Department of Defense' },
    ];
  }

  const body = {
    filters,
    fields: REQUESTED_FIELDS,
    sort: 'Award Amount',
    order: 'desc',
    limit: Math.min(params.limit, 100),
    page: 1,
  };

  const res = await fetchWithTimeout(SEARCH_URL, body);
  const data = (await res.json()) as SpendingByAwardResponse;

  if (!res.ok) {
    throw new UsaSpendingError(
      `USAspending API error (${res.status}): ${data.detail ?? 'unknown'}`,
    );
  }

  const rows = data.results ?? [];
  const awards: UsaAward[] = rows.map((r) => {
    const internalId = (r['generated_internal_id'] as string | null) ?? null;
    return {
      award_id: (r['Award ID'] as string | null) ?? null,
      recipient: (r['Recipient Name'] as string | null) ?? null,
      amount: (r['Award Amount'] as number | null) ?? null,
      description: (r['Description'] as string | null) ?? null,
      award_type: (r['Contract Award Type'] as string | null) ?? null,
      awarding_agency: (r['Awarding Agency'] as string | null) ?? null,
      awarding_sub_agency: (r['Awarding Sub Agency'] as string | null) ?? null,
      start_date: (r['Start Date'] as string | null) ?? null,
      end_date: (r['End Date'] as string | null) ?? null,
      naics: (r['NAICS Code'] as string | null) ?? null,
      psc: (r['PSC Code'] as string | null) ?? null,
      url: internalId
        ? `https://www.usaspending.gov/award/${internalId}`
        : 'https://www.usaspending.gov/',
    };
  });

  return {
    recipient_query: params.company,
    dod_only: params.dodOnly,
    count: awards.length,
    awards,
  };
}

async function fetchWithTimeout(url: string, body: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
