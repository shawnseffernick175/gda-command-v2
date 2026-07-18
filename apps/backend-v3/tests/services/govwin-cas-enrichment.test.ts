import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CAS-mode enrichment (#1145).
 *
 * Proves that in CAS mode `discoverRecentOpportunitiesWithDetailApi()` no longer
 * short-circuits: it fetches per-opportunity detail plus the companies/contracts
 * sub-endpoints through the NEO portal session client, maps the incumbent from
 * Contracts.incumbent, and reports `subEndpointCalls > 0` (the acceptance
 * criterion that was 0/351 before).
 */

const { mockAuthenticate, mockInvalidateAuth } = vi.hoisted(() => ({
  mockAuthenticate: vi.fn(),
  mockInvalidateAuth: vi.fn(),
}));

vi.mock('../../src/services/govwin/auth.js', () => ({
  authenticate: mockAuthenticate,
  invalidateAuth: mockInvalidateAuth,
}));

vi.mock('../../src/services/govwin/client.js', () => ({
  parseOpportunityPage: vi.fn(),
}));

vi.mock('../../src/services/govwin/oauth2_auth.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('unused-in-cas'),
  invalidateOAuth2Token: vi.fn(),
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

/** NEO-portal-shaped detail in an Envision-relevant NAICS with a far deadline. */
function casDetail(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Opportunity ${id}`,
    status: 'Pre-RFP',
    naics: '541512',
    responseDueDate: '2099-01-01T00:00:00Z',
    updateDate: '2026-07-10T00:00:00Z',
    ...overrides,
  };
}

describe('discoverRecentOpportunitiesWithDetailApi — CAS-mode enrichment', () => {
  beforeEach(() => {
    vi.resetModules();
    mockAuthenticate.mockReset();
    mockAuthenticate.mockResolvedValue(['JSESSIONID=test; Path=/']);
    mockInvalidateAuth.mockReset();
    process.env['GOVWIN_AUTH_MODE'] = 'cas';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env['GOVWIN_AUTH_MODE'];
  });

  it('fetches companies/contracts under CAS and maps incumbent from Contracts.incumbent', async () => {
    const search = { opportunities: [casDetail('GW-1')] };
    const companies = { companies: [{ companyName: 'Booz Allen' }, { companyName: 'Leidos' }] };
    const contracts = {
      contracts: [
        { incumbent: 'true', company: { id: 'C1', name: 'Acme Federal LLC' } },
        { incumbent: 'false', company: { id: 'C2', name: 'Northrop' } },
      ],
    };

    const calledPaths: string[] = [];
    const mockFetch = vi.fn((url: string) => {
      calledPaths.push(url);
      if (/\/neo\/rest\/opportunities\/GW-1\/companies$/.test(url)) {
        return Promise.resolve(jsonResponse(companies));
      }
      if (/\/neo\/rest\/opportunities\/GW-1\/contracts$/.test(url)) {
        return Promise.resolve(jsonResponse(contracts));
      }
      if (/\/neo\/rest\/opportunities\/GW-1$/.test(url)) {
        return Promise.resolve(jsonResponse(casDetail('GW-1')));
      }
      return Promise.resolve(jsonResponse(search));
    });
    vi.stubGlobal('fetch', mockFetch);

    const { discoverRecentOpportunitiesWithDetailApi } = await import(
      '../../src/services/govwin/api_client.js'
    );
    const result = await discoverRecentOpportunitiesWithDetailApi();

    // Sub-endpoint calls actually fire in CAS mode (the whole point of #1145).
    expect(calledPaths.some((p) => /\/GW-1\/companies$/.test(p))).toBe(true);
    expect(calledPaths.some((p) => /\/GW-1\/contracts$/.test(p))).toBe(true);
    expect(result.subEndpointCalls).toBeGreaterThan(0);
    expect(result.detailFetches).toBe(1);

    const gw1 = result.opportunities.find((o) => o.govwinId === 'GW-1')!;
    expect(gw1.incumbent).toBe('Acme Federal LLC');
    expect(gw1.competitors).toEqual(['Booz Allen', 'Leidos', 'Northrop']);
  });

  it('uses incumbent/competitors carried on the CAS detail without extra sub-calls', async () => {
    const detail = casDetail('GW-2', {
      incumbent: 'Globex Corp',
      competitors: ['Raytheon', 'SAIC'],
    });
    const search = { opportunities: [detail] };

    const calledPaths: string[] = [];
    const mockFetch = vi.fn((url: string) => {
      calledPaths.push(url);
      if (/\/neo\/rest\/opportunities\/GW-2$/.test(url)) {
        return Promise.resolve(jsonResponse(detail));
      }
      return Promise.resolve(jsonResponse(search));
    });
    vi.stubGlobal('fetch', mockFetch);

    const { discoverRecentOpportunitiesWithDetailApi } = await import(
      '../../src/services/govwin/api_client.js'
    );
    const result = await discoverRecentOpportunitiesWithDetailApi();

    // Detail already carried both — no companies/contracts calls needed.
    expect(calledPaths.some((p) => /\/companies$|\/contracts$/.test(p))).toBe(false);
    const gw2 = result.opportunities.find((o) => o.govwinId === 'GW-2')!;
    expect(gw2.incumbent).toBe('Globex Corp');
    expect(gw2.competitors).toEqual(['Raytheon', 'SAIC']);
  });
});
