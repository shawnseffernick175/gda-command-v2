import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../../src/lib/logger.js', () => ({
  logger: {
    warn: vi.fn(),
  },
}));

const envNames = [
  'GOVWIN_CAS_BASE',
  'GOVWIN_CAS_OPP_SEARCH_PATH',
  'GOVWIN_CAS_OPP_DETAIL_PATH',
] as const;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('GovWin CAS client URL construction', () => {
  beforeEach(() => {
    vi.resetModules();
    mockAuthenticate.mockReset();
    mockAuthenticate.mockResolvedValue(['JSESSIONID=test; Path=/']);
    mockInvalidateAuth.mockReset();
    for (const name of envNames) process.env[name] = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const name of envNames) delete process.env[name];
  });

  it('uses absolute default URLs when compose injects empty env values', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ opportunities: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'GW-1', title: 'Detail' }))
      .mockResolvedValueOnce(jsonResponse({ opportunities: [] }))
      .mockResolvedValueOnce(jsonResponse({ opportunities: [] }));
    vi.stubGlobal('fetch', mockFetch);

    const {
      discoverRecentOpportunitiesApiCas,
      fetchOpportunityByIdApiCas,
      searchBySolicitationNumberCas,
      searchByTitleAgencyCas,
    } = await import('../../src/services/govwin/cas_client.js');

    await discoverRecentOpportunitiesApiCas(50);
    await fetchOpportunityByIdApiCas('GW-1');
    await searchBySolicitationNumberCas('W15QKN-26-R-0001');
    await searchByTitleAgencyCas('Logistics Support', 'Department of the Army');

    const urls = mockFetch.mock.calls.map(([url]) => String(url));
    expect(urls[0]).toBe(
      'https://iq.govwin.com/neo/rest/opportunities?sort=updatedDate&order=desc&max=50&oppSelectionDateFrom=-30D',
    );
    expect(urls[1]).toBe('https://iq.govwin.com/neo/rest/opportunities/GW-1');
    expect(urls[2]).toBe(
      'https://iq.govwin.com/neo/rest/opportunities?solicitationNumber=W15QKN-26-R-0001&max=5',
    );
    expect(urls[3]).toBe(
      'https://iq.govwin.com/neo/rest/opportunities?q=Logistics+Support+Department+of+the+Army&max=5',
    );
  });

  it('rejects a non-absolute configured base before fetching', async () => {
    process.env['GOVWIN_CAS_BASE'] = 'iq.govwin.com';
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const { discoverRecentOpportunitiesApiCas } = await import(
      '../../src/services/govwin/cas_client.js'
    );

    await expect(discoverRecentOpportunitiesApiCas()).rejects.toThrow(
      'GovWin CAS URL must be absolute',
    );
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockAuthenticate).not.toHaveBeenCalled();
  });
});
