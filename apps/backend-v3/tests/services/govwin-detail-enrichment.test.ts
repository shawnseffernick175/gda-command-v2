import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/govwin/oauth2_auth.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('test-token'),
  invalidateOAuth2Token: vi.fn(),
}));

vi.mock('../../src/services/govwin/cas_client.js', () => ({
  discoverRecentOpportunitiesApiCas: vi.fn(),
  fetchOpportunityByIdApiCas: vi.fn(),
  fetchOpportunityDetailHtmlCas: vi.fn(),
}));

vi.mock('../../src/lib/db.js', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
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

/** Deltek V3-shaped opportunity summary in an Envision-relevant NAICS. */
function deltekSummary(id: string, overrides: Record<string, unknown> = {}) {
  const base = `https://services.govwin.com/neo-ws/opportunities/${id}`;
  return {
    id,
    iqOppId: `IQ-${id}`,
    title: `Opportunity ${id}`,
    status: 'Pre-RFP',
    oppValue: '$5,000,000',
    primaryNAICS: { id: '541512', title: 'Computer Systems Design', sizeStandard: '$34M' },
    solicitationNumber: `SOL-${id}`,
    // Far in the future so the deadline gate does not auto-pass.
    solicitationDate: { value: '2099-01-01T00:00:00Z' },
    updateDate: '2026-07-10T00:00:00Z',
    createdDate: '2026-06-01T00:00:00Z',
    govEntity: { id: 'A', title: 'Department of the Army' },
    links: {
      companies: { href: `${base}/companies` },
      contracts: { href: `${base}/contracts` },
      contacts: { href: `${base}/contacts` },
    },
    ...overrides,
  };
}

describe('discoverRecentOpportunitiesWithDetailApi — Deltek V3 sub-endpoint enrichment', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env['GOVWIN_AUTH_MODE'] = 'oauth2';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env['GOVWIN_AUTH_MODE'];
    delete process.env['GOVWIN_HOURLY_LIMIT'];
  });

  it('pulls incumbent from /companies and competitors from the other companies', async () => {
    const list = { opportunities: [deltekSummary('GW-1')] };
    const companies = {
      companies: [
        { companyName: 'Acme Federal LLC', role: 'Incumbent' },
        { companyName: 'Booz Allen', role: 'Competitor' },
        { companyName: 'Leidos', relationship: 'tracking' },
      ],
    };

    const calledPaths: string[] = [];
    const mockFetch = vi.fn((url: string) => {
      calledPaths.push(url);
      if (/\/opportunities\/GW-1\/companies/.test(url)) return Promise.resolve(jsonResponse(companies));
      if (/\/opportunities\/GW-1\/contracts/.test(url)) return Promise.resolve(jsonResponse({ contracts: [] }));
      if (/\/opportunities\/GW-1$/.test(url)) return Promise.resolve(jsonResponse(deltekSummary('GW-1')));
      return Promise.resolve(jsonResponse(list));
    });
    vi.stubGlobal('fetch', mockFetch);

    const { discoverRecentOpportunitiesWithDetailApi } = await import(
      '../../src/services/govwin/api_client.js'
    );
    const result = await discoverRecentOpportunitiesWithDetailApi();

    // The companies sub-endpoint was called (incumbent is NOT on the opp object).
    expect(calledPaths.some((p) => /\/opportunities\/GW-1\/companies/.test(p))).toBe(true);

    const gw1 = result.opportunities.find((o) => o.govwinId === 'GW-1')!;
    expect(gw1.incumbent).toBe('Acme Federal LLC');
    expect(gw1.competitors).toEqual(['Booz Allen', 'Leidos']);
    // oppValue string parsed to numeric dollars, raw preserved.
    expect(gw1.valueMin).toBe(5_000_000);
    expect(gw1.valueMax).toBe(5_000_000);
    expect(gw1.valueRaw).toBe('$5,000,000');
    expect(gw1.agency).toBe('Department of the Army');
    expect(gw1.naics).toBe('541512');
    expect(result.detailFetches).toBe(1);
  });

  it('falls back to /contracts for the incumbent when /companies is empty', async () => {
    const list = { opportunities: [deltekSummary('GW-2')] };
    const mockFetch = vi.fn((url: string) => {
      if (/\/opportunities\/GW-2\/companies/.test(url)) return Promise.resolve(jsonResponse({ companies: [] }));
      if (/\/opportunities\/GW-2\/contracts/.test(url)) {
        return Promise.resolve(jsonResponse({ contracts: [{ primeContractor: 'Globex Corp' }] }));
      }
      if (/\/opportunities\/GW-2$/.test(url)) return Promise.resolve(jsonResponse(deltekSummary('GW-2')));
      return Promise.resolve(jsonResponse(list));
    });
    vi.stubGlobal('fetch', mockFetch);

    const { discoverRecentOpportunitiesWithDetailApi } = await import(
      '../../src/services/govwin/api_client.js'
    );
    const result = await discoverRecentOpportunitiesWithDetailApi();

    const gw2 = result.opportunities.find((o) => o.govwinId === 'GW-2')!;
    expect(gw2.incumbent).toBe('Globex Corp');
  });

  it('skips sub-endpoint calls for off-profile opportunities (DLA-parts noise)', async () => {
    const offProfile = deltekSummary('GW-3', {
      title: '53--GASKET,DOOR',
      primaryNAICS: { id: '332999', title: 'Fabricated Metal' },
    });
    const list = { opportunities: [offProfile] };
    const calledPaths: string[] = [];
    const mockFetch = vi.fn((url: string) => {
      calledPaths.push(url);
      if (/\/opportunities\/GW-3$/.test(url)) return Promise.resolve(jsonResponse(offProfile));
      return Promise.resolve(jsonResponse(list));
    });
    vi.stubGlobal('fetch', mockFetch);

    const { discoverRecentOpportunitiesWithDetailApi } = await import(
      '../../src/services/govwin/api_client.js'
    );
    const result = await discoverRecentOpportunitiesWithDetailApi();

    // No companies/contracts calls for an off-profile NAICS.
    expect(calledPaths.some((p) => /\/companies|\/contracts/.test(p))).toBe(false);
    expect(result.skippedIrrelevant).toBe(1);
    expect(result.detailFetches).toBe(0);
  });
});
