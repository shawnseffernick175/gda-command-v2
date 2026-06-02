/**
 * F-509 integration tests — gda_company_financials (SEC EDGAR).
 * All tests mock global fetch; NO live API calls.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getCompanyFilings, resolveCik, EdgarError } from '../src/lib/edgar-client.js';
import { gdaCompanyFinancials } from '../src/tools/financials.js';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TICKERS_FIXTURE = {
  '0': { cik_str: 936468, ticker: 'LMT', title: 'LOCKHEED MARTIN CORP' },
  '1': { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
  '2': { cik_str: 4962, ticker: 'AXP', title: 'AMERICAN EXPRESS CO' },
};

const SUBMISSIONS_FIXTURE = {
  cik: '936468',
  name: 'LOCKHEED MARTIN CORP',
  tickers: ['LMT'],
  sic: '3760',
  sicDescription: 'Guided Missiles & Space Vehicles & Parts',
  fiscalYearEnd: '1231',
  filings: {
    recent: {
      accessionNumber: ['0000936468-26-000010', '0000936468-26-000008', '0000936468-26-000005'],
      form: ['10-K', '8-K', '10-Q'],
      filingDate: ['2026-02-01', '2026-01-15', '2025-10-20'],
      reportDate: ['2025-12-31', '2026-01-15', '2025-09-30'],
      primaryDocument: ['lmt-20251231.htm', 'lmt-8k.htm', 'lmt-20250930.htm'],
      primaryDocDescription: ['10-K', '8-K', '10-Q'],
    },
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function mockFetch(opts: { tickers?: unknown; submissions?: unknown; submissionsStatus?: number }) {
  const fn = vi.fn(async (url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    if (urlStr.includes('company_tickers.json')) {
      return new Response(JSON.stringify(opts.tickers ?? TICKERS_FIXTURE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (urlStr.includes('/submissions/')) {
      const status = opts.submissionsStatus ?? 200;
      if (status === 404) return new Response('Not Found', { status: 404 });
      return new Response(JSON.stringify(opts.submissions ?? SUBMISSIONS_FIXTURE), {
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

describe('edgar-client: resolveCik', () => {
  afterEach(() => vi.restoreAllMocks());

  it('resolves by exact ticker (case-insensitive)', async () => {
    mockFetch({});
    const r = await resolveCik('lmt');
    expect(r).toMatchObject({ cik: '0000936468', ticker: 'LMT', name: 'LOCKHEED MARTIN CORP' });
  });

  it('resolves by partial company name', async () => {
    mockFetch({});
    const r = await resolveCik('Lockheed');
    expect(r?.ticker).toBe('LMT');
  });

  it('returns null when no match', async () => {
    mockFetch({});
    const r = await resolveCik('zzz-not-a-real-company');
    expect(r).toBeNull();
  });
});

describe('edgar-client: getCompanyFilings', () => {
  afterEach(() => vi.restoreAllMocks());

  it('resolves a ticker and returns profile + filings with URLs', async () => {
    mockFetch({});
    const c = await getCompanyFilings({ query: 'LMT', limit: 15 });
    expect(c.cik).toBe('0000936468');
    expect(c.name).toBe('LOCKHEED MARTIN CORP');
    expect(c.sic_description).toBe('Guided Missiles & Space Vehicles & Parts');
    expect(c.recent_filings).toHaveLength(3);
    expect(c.recent_filings[0]).toMatchObject({ form: '10-K', accession_number: '0000936468-26-000010' });
    expect(c.recent_filings[0]!.url).toBe(
      'https://www.sec.gov/Archives/edgar/data/936468/000093646826000010/lmt-20251231.htm',
    );
  });

  it('accepts a raw CIK without resolving via tickers', async () => {
    mockFetch({});
    const c = await getCompanyFilings({ query: '936468', limit: 15 });
    expect(c.cik).toBe('0000936468');
  });

  it('filters by form_type', async () => {
    mockFetch({});
    const c = await getCompanyFilings({ query: 'LMT', formType: '10-K', limit: 15 });
    expect(c.recent_filings).toHaveLength(1);
    expect(c.recent_filings[0]!.form).toBe('10-K');
  });

  it('respects the limit parameter', async () => {
    mockFetch({});
    const c = await getCompanyFilings({ query: 'LMT', limit: 2 });
    expect(c.recent_filings).toHaveLength(2);
  });

  it('throws EdgarError when company name cannot be resolved', async () => {
    mockFetch({});
    await expect(getCompanyFilings({ query: 'zzz-nope', limit: 15 })).rejects.toThrow(EdgarError);
  });

  it('throws EdgarError on 404 submissions', async () => {
    mockFetch({ submissionsStatus: 404 });
    await expect(getCompanyFilings({ query: '936468', limit: 15 })).rejects.toThrow(EdgarError);
  });

  it('handles network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    await expect(getCompanyFilings({ query: 'LMT', limit: 15 })).rejects.toThrow('Network error');
  });
});

describe('gda_company_financials tool handler', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns company JSON text content', async () => {
    mockFetch({});
    const result = await gdaCompanyFinancials.handler({ query: 'LMT' });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.name).toBe('LOCKHEED MARTIN CORP');
    expect(parsed.recent_filings.length).toBeGreaterThan(0);
  });

  it('returns MCP error on validation failure (missing query)', async () => {
    const result = await gdaCompanyFinancials.handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Validation error');
  });

  it('returns MCP error when company not found', async () => {
    mockFetch({});
    const result = await gdaCompanyFinancials.handler({ query: 'zzz-nope' });
    expect(result.isError).toBe(true);
  });

  it('returns MCP error on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));
    const result = await gdaCompanyFinancials.handler({ query: 'LMT' });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('fetch failed');
  });
});
