/**
 * F-508 integration tests — gda_company_awards (USAspending.gov).
 * All tests mock global fetch; NO live API calls.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getCompanyAwards, UsaSpendingError } from '../src/lib/usaspending-client.js';
import { gdaCompanyAwards } from '../src/tools/awards.js';

const AWARDS_FIXTURE = {
  results: [
    {
      'Award ID': 'FA8807-26-C-0001',
      'Recipient Name': 'LOCKHEED MARTIN CORPORATION',
      'Award Amount': 1250000000,
      'Description': 'NEXT GEN INTERCEPTOR',
      'Contract Award Type': 'Definitive Contract',
      'Awarding Agency': 'Department of Defense',
      'Awarding Sub Agency': 'Department of the Air Force',
      'Start Date': '2026-01-01',
      'End Date': '2031-12-31',
      'NAICS Code': '336414',
      'PSC Code': '1410',
      'generated_internal_id': 'CONT_AWD_FA880726C0001',
    },
    {
      'Award ID': 'N0001925C0042',
      'Recipient Name': 'LOCKHEED MARTIN CORPORATION',
      'Award Amount': 480000000,
      'Description': 'AEGIS COMBAT SYSTEM',
      'Contract Award Type': 'Definitive Contract',
      'Awarding Agency': 'Department of Defense',
      'Awarding Sub Agency': 'Department of the Navy',
      'Start Date': '2025-06-01',
      'End Date': '2030-05-31',
      'NAICS Code': '541330',
      'PSC Code': 'AC12',
      'generated_internal_id': 'CONT_AWD_N0001925C0042',
    },
  ],
};

function mockFetch(payload: unknown, ok = true, status = 200) {
  const fn = vi.fn(async () =>
    new Response(JSON.stringify(payload), {
      status: ok ? status : status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('usaspending-client: getCompanyAwards', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps awards with amount, agency, codes, and a usaspending URL', async () => {
    mockFetch(AWARDS_FIXTURE);
    const r = await getCompanyAwards({ company: 'Lockheed Martin', dodOnly: true, years: 5, limit: 25 });
    expect(r.count).toBe(2);
    expect(r.dod_only).toBe(true);
    expect(r.awards[0]).toMatchObject({
      award_id: 'FA8807-26-C-0001',
      recipient: 'LOCKHEED MARTIN CORPORATION',
      amount: 1250000000,
      awarding_sub_agency: 'Department of the Air Force',
      naics: '336414',
    });
    expect(r.awards[0]!.url).toBe('https://www.usaspending.gov/award/CONT_AWD_FA880726C0001');
  });

  it('sends DoD agency filter only when dodOnly is true', async () => {
    const fn = mockFetch(AWARDS_FIXTURE);
    await getCompanyAwards({ company: 'X', dodOnly: true, years: 3, limit: 10 });
    const body = JSON.parse((fn.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.filters.agencies?.[0]?.name).toBe('Department of Defense');

    fn.mockClear();
    await getCompanyAwards({ company: 'X', dodOnly: false, years: 3, limit: 10 });
    const body2 = JSON.parse((fn.mock.calls[0]![1] as RequestInit).body as string);
    expect(body2.filters.agencies).toBeUndefined();
  });

  it('returns empty list when no results', async () => {
    mockFetch({ results: [] });
    const r = await getCompanyAwards({ company: 'zzz', dodOnly: true, years: 5, limit: 25 });
    expect(r.count).toBe(0);
    expect(r.awards).toEqual([]);
  });

  it('throws UsaSpendingError on non-ok response', async () => {
    mockFetch({ detail: 'bad request' }, false, 400);
    await expect(
      getCompanyAwards({ company: 'X', dodOnly: true, years: 5, limit: 25 }),
    ).rejects.toThrow(UsaSpendingError);
  });

  it('handles network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    await expect(
      getCompanyAwards({ company: 'X', dodOnly: true, years: 5, limit: 25 }),
    ).rejects.toThrow('Network error');
  });

  it('caps limit at 100', async () => {
    const fn = mockFetch(AWARDS_FIXTURE);
    await getCompanyAwards({ company: 'X', dodOnly: true, years: 5, limit: 100 });
    const body = JSON.parse((fn.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.limit).toBeLessThanOrEqual(100);
  });
});

describe('gda_company_awards tool handler', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns awards JSON text content', async () => {
    mockFetch(AWARDS_FIXTURE);
    const result = await gdaCompanyAwards.handler({ company: 'Lockheed Martin' });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.count).toBe(2);
    expect(parsed.awards[0].recipient).toContain('LOCKHEED');
  });

  it('defaults dod_only to true', async () => {
    const fn = mockFetch(AWARDS_FIXTURE);
    await gdaCompanyAwards.handler({ company: 'Lockheed' });
    const body = JSON.parse((fn.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.filters.agencies?.[0]?.name).toBe('Department of Defense');
  });

  it('returns MCP error on validation failure (missing company)', async () => {
    const result = await gdaCompanyAwards.handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Validation error');
  });

  it('returns MCP error on API failure', async () => {
    mockFetch({ detail: 'rate limited' }, false, 429);
    const result = await gdaCompanyAwards.handler({ company: 'X' });
    expect(result.isError).toBe(true);
  });

  it('returns MCP error on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));
    const result = await gdaCompanyAwards.handler({ company: 'X' });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('fetch failed');
  });
});
