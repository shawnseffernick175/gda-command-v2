/**
 * Thin fetch wrapper for the LegiScan API (F-506).
 * Docs: https://legiscan.com/gaits/documentation/legiscan
 */

const LEGISCAN_BASE = 'https://api.legiscan.com/';
const TIMEOUT_MS = 10_000;

export interface LegiScanBill {
  bill_id: number;
  bill_number: string;
  title: string;
  state: string;
  status: string;
  status_date: string;
  last_action: string;
  last_action_date: string;
  url: string;
  sponsors: string[];
}

interface LegiScanSearchItem {
  relevance: number;
  bill_id: number;
  number: string;
  title: string;
  state: string;
  status: string;
  status_date: string;
  last_action: string;
  last_action_date: string;
  url: string;
}

interface LegiScanSearchResponse {
  status: string;
  searchresult: Record<string, LegiScanSearchItem | { count: number; page: number; range: string }>;
}

interface LegiScanBillDetail {
  status: string;
  bill: {
    bill_id: number;
    sponsors: Array<{ name: string }>;
  };
}

export class LegiScanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegiScanError';
  }
}

export async function searchBills(params: {
  query: string;
  state: string;
  year: number;
  limit: number;
}): Promise<LegiScanBill[]> {
  const apiKey = process.env['LEGISCAN_API_KEY'];
  if (!apiKey) throw new LegiScanError('LEGISCAN_API_KEY not set');

  const url = new URL(LEGISCAN_BASE);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('op', 'getSearch');
  url.searchParams.set('state', params.state);
  url.searchParams.set('query', params.query);
  url.searchParams.set('year', String(params.year));

  const res = await fetchWithTimeout(url.toString());
  const data = (await res.json()) as LegiScanSearchResponse;

  if (data.status !== 'OK') {
    const msg =
      typeof data.searchresult?.['0'] === 'object' && 'count' in (data.searchresult['0'] as Record<string, unknown>)
        ? JSON.stringify(data.searchresult)
        : `LegiScan API error: ${data.status}`;
    throw new LegiScanError(msg);
  }

  const items: LegiScanSearchItem[] = [];
  for (const [key, val] of Object.entries(data.searchresult)) {
    if (key === 'summary' || !val || typeof val !== 'object' || !('bill_id' in val)) continue;
    items.push(val as LegiScanSearchItem);
  }

  const limited = items.slice(0, params.limit);

  // Fetch sponsors for each bill
  const bills: LegiScanBill[] = await Promise.all(
    limited.map(async (item) => {
      let sponsors: string[] = [];
      try {
        sponsors = await fetchSponsors(apiKey, item.bill_id);
      } catch {
        // Non-fatal: return bill without sponsors
      }
      return {
        bill_id: item.bill_id,
        bill_number: item.number,
        title: item.title,
        state: item.state,
        status: item.status,
        status_date: item.status_date,
        last_action: item.last_action,
        last_action_date: item.last_action_date,
        url: item.url,
        sponsors,
      };
    }),
  );

  return bills;
}

async function fetchSponsors(apiKey: string, billId: number): Promise<string[]> {
  const url = new URL(LEGISCAN_BASE);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('op', 'getBill');
  url.searchParams.set('id', String(billId));

  const res = await fetchWithTimeout(url.toString());
  const data = (await res.json()) as LegiScanBillDetail;
  if (data.status !== 'OK' || !data.bill?.sponsors) return [];
  return data.bill.sponsors.map((s) => s.name);
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}
