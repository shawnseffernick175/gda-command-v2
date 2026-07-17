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

describe('parseOppValue — Deltek oppValue String parsing', () => {
  it('parses a single currency value', async () => {
    const { parseOppValue } = await import('../../src/services/govwin/api_client.js');
    expect(parseOppValue('$5,000,000')).toEqual({
      valueMin: 5_000_000,
      valueMax: 5_000_000,
      valueRaw: '$5,000,000',
    });
  });

  it('parses a range and returns min/max', async () => {
    const { parseOppValue } = await import('../../src/services/govwin/api_client.js');
    expect(parseOppValue('$1M - $5M')).toEqual({
      valueMin: 1_000_000,
      valueMax: 5_000_000,
      valueRaw: '$1M - $5M',
    });
  });

  it('handles shorthand suffixes (K/M/B)', async () => {
    const { parseOppValue } = await import('../../src/services/govwin/api_client.js');
    expect(parseOppValue('2.5M').valueMin).toBe(2_500_000);
    expect(parseOppValue('750K').valueMin).toBe(750_000);
    expect(parseOppValue('1.2B').valueMax).toBe(1_200_000_000);
  });

  it('returns nulls for non-numeric text without throwing', async () => {
    const { parseOppValue } = await import('../../src/services/govwin/api_client.js');
    expect(parseOppValue('Undisclosed')).toEqual({
      valueMin: null,
      valueMax: null,
      valueRaw: 'Undisclosed',
    });
    expect(parseOppValue(null)).toEqual({ valueMin: null, valueMax: null, valueRaw: null });
  });
});

describe('classifyGovWinStage — status → lifecycle stage', () => {
  it('maps forecast-family statuses to forecast', async () => {
    const { classifyGovWinStage } = await import('../../src/ingest/govwin/adapter.js');
    for (const s of ['Pre-RFP', 'Forecast', 'Planning', 'Draft RFP']) {
      expect(classifyGovWinStage(s)).toBe('forecast');
    }
  });

  it('maps solicitation-family statuses to solicitation', async () => {
    const { classifyGovWinStage } = await import('../../src/ingest/govwin/adapter.js');
    for (const s of ['Source Sought', 'Pre-Solicitation', 'Solicitation', 'Post-RFP']) {
      expect(classifyGovWinStage(s)).toBe('solicitation');
    }
  });

  it('maps Awarded to awarded', async () => {
    const { classifyGovWinStage } = await import('../../src/ingest/govwin/adapter.js');
    expect(classifyGovWinStage('Awarded')).toBe('awarded');
  });

  it('never returns discovery for a recognized status', async () => {
    const { classifyGovWinStage } = await import('../../src/ingest/govwin/adapter.js');
    for (const s of ['Pre-RFP', 'Solicitation', 'Awarded', 'Something Else']) {
      expect(classifyGovWinStage(s)).not.toBe('discovery');
    }
  });
});

describe('fetchOpportunityByIdApi — Deltek V3 field mapping', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env['GOVWIN_AUTH_MODE'] = 'oauth2';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env['GOVWIN_AUTH_MODE'];
  });

  it('maps a real Deltek-shaped opportunity object to our shape', async () => {
    const raw = {
      id: 'BID252338',
      iqOppId: 'IQ-1',
      title: 'Enterprise IT Support Services',
      status: 'Awarded',
      oppValue: '$10,000,000',
      primaryNAICS: { id: '541512', title: 'Computer Systems Design', sizeStandard: '$34M' },
      additionalNaics: [{ id: '541519' }],
      competitionTypes: [{ title: 'Full and Open' }],
      contractTypes: [{ title: 'FFP' }],
      typeOfAward: 'New',
      solicitationNumber: 'W15QKN-26-R-0001',
      solicitationDate: { value: '2026-09-01T00:00:00Z' },
      sourceURL: 'https://iq.govwin.com/neo/opportunity/view/BID252338',
      updateDate: '2026-07-10T12:00:00Z',
      createdDate: '2026-06-01T00:00:00Z',
      description: 'Support services for enterprise IT.',
      govEntity: { id: 'ARMY', title: 'Department of the Army' },
    };
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(raw))));

    const { fetchOpportunityByIdApi } = await import('../../src/services/govwin/api_client.js');
    const opp = await fetchOpportunityByIdApi('BID252338');

    expect(opp).not.toBeNull();
    expect(opp!.govwinId).toBe('BID252338');
    expect(opp!.title).toBe('Enterprise IT Support Services');
    expect(opp!.status).toBe('Awarded');
    expect(opp!.agency).toBe('Department of the Army');
    expect(opp!.naics).toBe('541512');
    expect(opp!.solicitationNumber).toBe('W15QKN-26-R-0001');
    expect(opp!.responseDueAt).toBe('2026-09-01T00:00:00Z');
    expect(opp!.updateDate).toBe('2026-07-10T12:00:00Z');
    expect(opp!.valueMin).toBe(10_000_000);
    expect(opp!.valueMax).toBe(10_000_000);
    expect(opp!.valueRaw).toBe('$10,000,000');
    expect(opp!.sourceUri).toBe('https://iq.govwin.com/neo/opportunity/view/BID252338');
    // Incumbent/competitors are NOT on the opportunity object.
    expect(opp!.incumbent).toBeNull();
    expect(opp!.competitors).toEqual([]);
  });
});

describe('discoverRecentOpportunitiesApi — Deltek V3 discovery query', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env['GOVWIN_AUTH_MODE'] = 'oauth2';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env['GOVWIN_AUTH_MODE'];
    delete process.env['GOVWIN_OPP_SELECTION_DATE_FROM'];
  });

  it('uses sort=updatedDate, oppType=OPP and a NAICS filter (never sort=updateDate)', async () => {
    const calledUrls: string[] = [];
    const mockFetch = vi.fn((url: string) => {
      calledUrls.push(url);
      // Single short page so the pager stops after one call.
      return Promise.resolve(jsonResponse({ opportunities: [], meta: { paging: { totalCount: 0 } } }));
    });
    vi.stubGlobal('fetch', mockFetch);

    const { discoverRecentOpportunitiesApi } = await import('../../src/services/govwin/api_client.js');
    await discoverRecentOpportunitiesApi();

    expect(calledUrls.length).toBeGreaterThan(0);
    const url = calledUrls[0]!;
    const qs = new URLSearchParams(url.split('?')[1]);

    // Bug 1 regression guard: the sort VALUE must be updatedDate (with the "d").
    expect(qs.get('sort')).toBe('updatedDate');
    expect(url).not.toMatch(/sort=updateDate(&|$)/);
    // Bug 2: restrict to GovWin Tracked Opps, not the FBO/SAM firehose.
    expect(qs.get('oppType')).toBe('OPP');
    // Bug 3: a non-empty Envision NAICS filter that excludes GSA MAS SINs.
    const naics = qs.get('naics') ?? '';
    expect(naics.length).toBeGreaterThan(0);
    expect(naics.split(',')).toContain('541330');
    expect(naics).not.toMatch(/54151S|54151HACS/);
    // Bug 4: capture updates and use the relative window default.
    expect(qs.get('oppCategory')).toBe('2');
    expect(qs.get('oppSelectionDateFrom')).toBe('-12H');
  });

  it('honours GOVWIN_OPP_SELECTION_DATE_FROM for a full backfill', async () => {
    process.env['GOVWIN_OPP_SELECTION_DATE_FROM'] = '01/01/1900';
    const calledUrls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        calledUrls.push(url);
        return Promise.resolve(jsonResponse({ opportunities: [], meta: { paging: { totalCount: 0 } } }));
      }),
    );

    const { discoverRecentOpportunitiesApi } = await import('../../src/services/govwin/api_client.js');
    await discoverRecentOpportunitiesApi();

    const qs = new URLSearchParams(calledUrls[0]!.split('?')[1]);
    expect(qs.get('oppSelectionDateFrom')).toBe('01/01/1900');
  });
});

describe('hourly rolling limiter + 429 backoff', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env['GOVWIN_AUTH_MODE'] = 'oauth2';
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env['GOVWIN_AUTH_MODE'];
    delete process.env['GOVWIN_HOURLY_LIMIT'];
  });

  it('backs off on HTTP 429 honouring Retry-After and then succeeds', async () => {
    vi.useFakeTimers();
    let call = 0;
    const mockFetch = vi.fn(() => {
      call += 1;
      if (call === 1) {
        return Promise.resolve(
          new Response('rate limited', { status: 429, headers: { 'retry-after': '2' } }),
        );
      }
      return Promise.resolve(jsonResponse({ companies: [{ companyName: 'Acme', role: 'Incumbent' }] }));
    });
    vi.stubGlobal('fetch', mockFetch);

    const { fetchOpportunityCompanies } = await import('../../src/services/govwin/api_client.js');
    const promise = fetchOpportunityCompanies('GW-1');

    // Let the first (429) fetch resolve, then advance past the Retry-After delay.
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.incumbent).toBe('Acme');
  });

  it('counts calls against the rolling hour and exposes the configured limit', async () => {
    process.env['GOVWIN_HOURLY_LIMIT'] = '3500';
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ companies: [] }))),
    );

    const { fetchOpportunityCompanies, getCallsThisHour, getHourlyLimit } = await import(
      '../../src/services/govwin/api_client.js'
    );

    expect(getHourlyLimit()).toBe(3500);
    expect(getCallsThisHour()).toBe(0);
    await fetchOpportunityCompanies('GW-1');
    await fetchOpportunityCompanies('GW-2');
    expect(getCallsThisHour()).toBe(2);
  });

  it('waits for a slot instead of aborting when the hourly cap is hit', async () => {
    vi.useFakeTimers();
    process.env['GOVWIN_HOURLY_LIMIT'] = '1';
    const mockFetch = vi.fn(() => Promise.resolve(jsonResponse({ companies: [] })));
    vi.stubGlobal('fetch', mockFetch);

    const { fetchOpportunityCompanies } = await import('../../src/services/govwin/api_client.js');

    await fetchOpportunityCompanies('GW-1'); // consumes the only slot
    const second = fetchOpportunityCompanies('GW-2'); // must wait, not throw

    await vi.advanceTimersByTimeAsync(60_000);
    await expect(second).resolves.toBeDefined();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
