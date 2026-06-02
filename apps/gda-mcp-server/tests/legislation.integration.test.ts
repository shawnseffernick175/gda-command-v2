/**
 * F-506 integration tests — gda_search_bills (LegiScan).
 * All tests mock global fetch; NO live API calls.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { searchBills, LegiScanError } from '../src/lib/legiscan-client.js';
import { gdaSearchBills } from '../src/tools/legislation.js';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const SEARCH_FIXTURE = {
  status: 'OK',
  searchresult: {
    summary: { page: 1, range: '1-3', relevancy: 100, count: 3 },
    '0': {
      relevance: 99,
      bill_id: 1234567,
      number: 'HR1234',
      title: 'Defense Appropriations Act of 2026',
      state: 'US',
      status: 'Introduced',
      status_date: '2026-03-15',
      last_action: 'Referred to Committee on Armed Services',
      last_action_date: '2026-03-20',
      url: 'https://legiscan.com/US/bill/HR1234/2026',
    },
    '1': {
      relevance: 85,
      bill_id: 1234568,
      number: 'S567',
      title: 'Cybersecurity Infrastructure Protection Act',
      state: 'US',
      status: 'Engrossed',
      status_date: '2026-02-10',
      last_action: 'Passed Senate',
      last_action_date: '2026-04-01',
      url: 'https://legiscan.com/US/bill/S567/2026',
    },
    '2': {
      relevance: 70,
      bill_id: 1234569,
      number: 'HR890',
      title: 'Federal IT Modernization Act',
      state: 'US',
      status: 'Enrolled',
      status_date: '2026-01-05',
      last_action: 'Sent to President',
      last_action_date: '2026-05-10',
      url: 'https://legiscan.com/US/bill/HR890/2026',
    },
  },
};

const BILL_DETAIL_FIXTURE = (billId: number) => ({
  status: 'OK',
  bill: {
    bill_id: billId,
    sponsors: [
      { name: 'Sen. Jane Smith' },
      { name: 'Rep. John Doe' },
    ],
  },
});

const EMPTY_SEARCH_FIXTURE = {
  status: 'OK',
  searchresult: {
    summary: { page: 0, range: '', relevancy: 0, count: 0 },
  },
};

const ERROR_FIXTURE = {
  status: 'FAIL',
  searchresult: { error: 'Rate limit exceeded' },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function mockFetch(searchResponse: unknown, billDetailResponse?: (billId: number) => unknown) {
  const fn = vi.fn(async (url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    if (urlStr.includes('op=getSearch')) {
      return new Response(JSON.stringify(searchResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (urlStr.includes('op=getBill') && billDetailResponse) {
      const idMatch = urlStr.match(/id=(\d+)/);
      const billId = idMatch ? Number(idMatch[1]) : 0;
      return new Response(JSON.stringify(billDetailResponse(billId)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('Not Found', { status: 404 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('legiscan-client: searchBills', () => {
  beforeEach(() => {
    process.env['LEGISCAN_API_KEY'] = 'test-key-not-real';
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['LEGISCAN_API_KEY'];
  });

  it('throws LegiScanError when LEGISCAN_API_KEY is not set', async () => {
    delete process.env['LEGISCAN_API_KEY'];
    await expect(
      searchBills({ query: 'defense', state: 'US', year: 2026, limit: 20 }),
    ).rejects.toThrow('LEGISCAN_API_KEY not set');
  });

  it('parses search results and fetches sponsors', async () => {
    mockFetch(SEARCH_FIXTURE, BILL_DETAIL_FIXTURE);
    const bills = await searchBills({ query: 'defense', state: 'US', year: 2026, limit: 20 });

    expect(bills).toHaveLength(3);
    expect(bills[0]).toMatchObject({
      bill_id: 1234567,
      bill_number: 'HR1234',
      title: 'Defense Appropriations Act of 2026',
      state: 'US',
      status: 'Introduced',
      url: 'https://legiscan.com/US/bill/HR1234/2026',
    });
    expect(bills[0]!.sponsors).toEqual(['Sen. Jane Smith', 'Rep. John Doe']);
  });

  it('returns empty array for no results', async () => {
    mockFetch(EMPTY_SEARCH_FIXTURE);
    const bills = await searchBills({ query: 'xyznonexistent', state: 'US', year: 2026, limit: 20 });
    expect(bills).toEqual([]);
  });

  it('throws LegiScanError on API error response', async () => {
    mockFetch(ERROR_FIXTURE);
    await expect(
      searchBills({ query: 'defense', state: 'US', year: 2026, limit: 20 }),
    ).rejects.toThrow(LegiScanError);
  });

  it('respects limit parameter', async () => {
    mockFetch(SEARCH_FIXTURE, BILL_DETAIL_FIXTURE);
    const bills = await searchBills({ query: 'defense', state: 'US', year: 2026, limit: 1 });
    expect(bills).toHaveLength(1);
  });

  it('handles network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    await expect(
      searchBills({ query: 'defense', state: 'US', year: 2026, limit: 20 }),
    ).rejects.toThrow('Network error');
  });
});

describe('gda_search_bills tool handler', () => {
  beforeEach(() => {
    process.env['LEGISCAN_API_KEY'] = 'test-key-not-real';
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['LEGISCAN_API_KEY'];
  });

  it('returns bills as JSON text content', async () => {
    mockFetch(SEARCH_FIXTURE, BILL_DETAIL_FIXTURE);
    const result = await gdaSearchBills.handler({ query: 'defense' });
    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);

    const parsed = JSON.parse(result.content[0]!.text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].bill_number).toBe('HR1234');
  });

  it('returns MCP error when API key is missing', async () => {
    delete process.env['LEGISCAN_API_KEY'];
    const result = await gdaSearchBills.handler({ query: 'defense' });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('LEGISCAN_API_KEY not set');
  });

  it('returns MCP error on LegiScan API failure', async () => {
    mockFetch(ERROR_FIXTURE);
    const result = await gdaSearchBills.handler({ query: 'defense' });
    expect(result.isError).toBe(true);
  });

  it('returns MCP error on validation failure (missing query)', async () => {
    const result = await gdaSearchBills.handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Validation error');
  });

  it('returns empty array for no results (not an error)', async () => {
    mockFetch(EMPTY_SEARCH_FIXTURE);
    const result = await gdaSearchBills.handler({ query: 'xyznonexistent' });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed).toEqual([]);
  });

  it('returns MCP error on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));
    const result = await gdaSearchBills.handler({ query: 'defense' });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('fetch failed');
  });
});
