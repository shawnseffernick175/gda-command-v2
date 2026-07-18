import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// CAS session auth: mock the CAS ticket flow so casGetJson gets a cookie.
const { mockAuthenticate, mockInvalidateAuth } = vi.hoisted(() => ({
  mockAuthenticate: vi.fn(),
  mockInvalidateAuth: vi.fn(),
}));

vi.mock('../../src/services/govwin/auth.js', () => ({
  authenticate: mockAuthenticate,
  invalidateAuth: mockInvalidateAuth,
}));

vi.mock('../../src/services/govwin/oauth2_auth.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('unused-in-cas'),
  invalidateOAuth2Token: vi.fn(),
}));

vi.mock('../../src/services/govwin/client.js', () => ({
  parseOpportunityPage: vi.fn(),
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

/** CAS NEO-portal shaped opportunity summary in an Envision-relevant NAICS. */
function casSummary(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Opportunity ${id}`,
    status: 'Pre-RFP',
    naics: '541512',
    // Far in the future so the deadline gate does not auto-pass.
    dueDate: '2099-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('CAS-mode enrichment — subEndpointCalls>0 and incumbent from Contracts', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env['GOVWIN_AUTH_MODE'] = 'cas';
    mockAuthenticate.mockReset();
    mockAuthenticate.mockResolvedValue(['JSESSIONID=test; Path=/']);
    mockInvalidateAuth.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env['GOVWIN_AUTH_MODE'];
  });

  it('fires detail + /companies + /contracts under CAS auth and maps incumbent from Contracts.incumbent', async () => {
    const list = { opportunities: [casSummary('GW-1')] };
    const companies = {
      companies: [{ companyName: 'Booz Allen' }, { companyName: 'Leidos' }],
    };
    const contracts = {
      contracts: [
        { incumbent: 'true', company: { id: 'C1', name: 'Acme Federal LLC' } },
        { incumbent: 'false', company: { id: 'C2', name: 'Northrop' } },
      ],
    };

    const calledPaths: string[] = [];
    const mockFetch = vi.fn((url: string) => {
      calledPaths.push(url);
      if (/\/opportunities\/GW-1\/companies/.test(url)) return Promise.resolve(jsonResponse(companies));
      if (/\/opportunities\/GW-1\/contracts/.test(url)) return Promise.resolve(jsonResponse(contracts));
      if (/\/opportunities\/GW-1$/.test(url)) return Promise.resolve(jsonResponse(casSummary('GW-1')));
      return Promise.resolve(jsonResponse(list));
    });
    vi.stubGlobal('fetch', mockFetch);

    const { discoverRecentOpportunitiesWithDetailApi } = await import(
      '../../src/services/govwin/api_client.js'
    );
    const result = await discoverRecentOpportunitiesWithDetailApi();

    // Both sub-endpoints were called against the CAS NEO portal (no OAuth short-circuit).
    expect(calledPaths.some((p) => /iq\.govwin\.com.*\/opportunities\/GW-1\/companies/.test(p))).toBe(true);
    expect(calledPaths.some((p) => /iq\.govwin\.com.*\/opportunities\/GW-1\/contracts/.test(p))).toBe(true);
    expect(result.subEndpointCalls).toBeGreaterThan(0);
    expect(result.detailFetches).toBe(1);

    const gw1 = result.opportunities.find((o) => o.govwinId === 'GW-1')!;
    expect(gw1.incumbent).toBe('Acme Federal LLC');
    expect(gw1.competitors).toEqual(['Booz Allen', 'Leidos', 'Northrop']);
  });

  it('enrichIncumbentCompetitors resolves incumbent from Contracts under CAS auth', async () => {
    const contracts = {
      contracts: [{ incumbent: 'true', company: { id: 'X', name: 'Globex Corp' } }],
    };
    const mockFetch = vi.fn((url: string) => {
      if (/\/opportunities\/GW-2\/companies/.test(url)) return Promise.resolve(jsonResponse({ companies: [] }));
      if (/\/opportunities\/GW-2\/contracts/.test(url)) return Promise.resolve(jsonResponse(contracts));
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', mockFetch);

    const { enrichIncumbentCompetitors } = await import(
      '../../src/services/govwin/api_client.js'
    );
    const result = await enrichIncumbentCompetitors('GW-2');

    expect(result.incumbent).toBe('Globex Corp');
    expect(result.calls).toBe(2);
  });
});
