import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/govwin/oauth2_auth.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('test-token'),
  invalidateOAuth2Token: vi.fn(),
}));

vi.mock('../../src/services/govwin/cas_client.js', () => ({
  discoverRecentOpportunitiesApiCas: vi.fn(),
  fetchOpportunityByIdApiCas: vi.fn(),
  fetchOpportunityDetailHtmlCas: vi.fn(),
  searchBySolicitationNumberCas: vi.fn(),
  searchByTitleAgencyCas: vi.fn(),
}));

vi.mock('../../src/lib/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('discoverRecentOpportunitiesWithDetailApi (#1134)', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env['GOVWIN_AUTH_MODE'] = 'oauth2';
    process.env['GOVWIN_DAILY_LIMIT'] = '200';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env['GOVWIN_AUTH_MODE'];
    delete process.env['GOVWIN_DAILY_LIMIT'];
  });

  it('calls the detail endpoint for every discovered opportunity and merges enrichment', async () => {
    const listBody = {
      opportunities: [
        { id: 'GW-1', title: 'Opp One', agency: 'DOD' },
        { id: 'GW-2', title: 'Opp Two', agency: 'DHS' },
      ],
    };
    const detailById: Record<string, unknown> = {
      'GW-1': {
        id: 'GW-1',
        title: 'Opp One',
        status: 'pre-rfp',
        incumbent: 'Acme Federal LLC',
        competitors: ['Booz Allen', 'Leidos'],
        value_min: 1_000_000,
        value_max: 5_000_000,
      },
      'GW-2': {
        id: 'GW-2',
        title: 'Opp Two',
        status: 'active',
        incumbent: 'Globex Corp',
        competitors: ['SAIC'],
        value_min: 250_000,
        value_max: 750_000,
      },
    };

    const detailUrls: string[] = [];
    const mockFetch = vi.fn((url: string) => {
      const detailMatch = /\/opportunities\/(GW-\d+)$/.exec(url);
      if (detailMatch) {
        detailUrls.push(url);
        return Promise.resolve(jsonResponse(detailById[detailMatch[1]!]));
      }
      return Promise.resolve(jsonResponse(listBody));
    });
    vi.stubGlobal('fetch', mockFetch);

    const { discoverRecentOpportunitiesWithDetailApi } = await import(
      '../../src/services/govwin/api_client.js'
    );

    const result = await discoverRecentOpportunitiesWithDetailApi();

    // Detail endpoint hit once per discovered opportunity.
    expect(detailUrls).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/opportunities/GW-1'),
        expect.stringContaining('/opportunities/GW-2'),
      ]),
    );
    expect(result.detailFetches).toBe(2);
    expect(result.detailCapSkipped).toBe(0);

    const gw1 = result.opportunities.find((o) => o.govwinId === 'GW-1')!;
    expect(gw1.incumbent).toBe('Acme Federal LLC');
    expect(gw1.competitors).toEqual(['Booz Allen', 'Leidos']);
    expect(gw1.valueMin).toBe(1_000_000);
    expect(gw1.valueMax).toBe(5_000_000);
    expect(gw1.status).toBe('pre-rfp');

    const gw2 = result.opportunities.find((o) => o.govwinId === 'GW-2')!;
    expect(gw2.incumbent).toBe('Globex Corp');
    expect(gw2.status).toBe('active');
  });

  it('stops calling the detail endpoint once the daily cap is reached', async () => {
    process.env['GOVWIN_DAILY_LIMIT'] = '1';

    const listBody = {
      opportunities: [
        { id: 'GW-1', title: 'Opp One' },
        { id: 'GW-2', title: 'Opp Two' },
      ],
    };

    const detailUrls: string[] = [];
    const mockFetch = vi.fn((url: string) => {
      if (/\/opportunities\/GW-\d+$/.test(url)) {
        detailUrls.push(url);
        return Promise.resolve(jsonResponse({ id: 'GW-1', title: 'Opp One', incumbent: 'Acme' }));
      }
      return Promise.resolve(jsonResponse(listBody));
    });
    vi.stubGlobal('fetch', mockFetch);

    const { discoverRecentOpportunitiesWithDetailApi } = await import(
      '../../src/services/govwin/api_client.js'
    );

    const result = await discoverRecentOpportunitiesWithDetailApi();

    // Cap is 1 and the list call consumes it, so no detail fetch succeeds and
    // the run does not throw — records are returned summary-only.
    expect(result.detailFetches).toBe(0);
    expect(result.detailCapSkipped).toBe(2);
    expect(result.opportunities).toHaveLength(2);
  });
});
