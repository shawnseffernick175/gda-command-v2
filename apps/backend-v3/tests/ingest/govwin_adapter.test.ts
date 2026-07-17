import { describe, it, expect } from 'vitest';
import {
  GovWinForecastAdapter,
  GovWinSolicitationAdapter,
  classifyGovWinStage,
} from '../../src/ingest/govwin/adapter.js';
import type { GovWinApiOpportunity } from '../../src/services/govwin/api_client.js';

function makeOpp(overrides: Partial<GovWinApiOpportunity> = {}): GovWinApiOpportunity {
  return {
    govwinId: 'GW-1',
    title: 'Enterprise Cyber Support',
    agency: 'DOD',
    subAgency: 'DISA',
    solicitationNumber: 'HC1234-25-R-0001',
    status: 'active',
    naics: '541512',
    setAside: 'SDVOSB',
    incumbent: 'Acme Federal LLC',
    competitors: ['Booz Allen', 'Leidos'],
    valueMin: 1_000_000,
    valueMax: 5_000_000,
    responseDueAt: '2026-09-01T00:00:00Z',
    postedAt: '2026-07-01T00:00:00Z',
    description: 'Cyber support services',
    sourceUri: 'https://iq.govwin.com/neo/opportunity/view/GW-1',
    ...overrides,
  };
}

describe('classifyGovWinStage', () => {
  it('maps forecast/pre-RFP statuses to forecast', () => {
    for (const s of ['pre-rfp', 'forecast', 'planning', 'draft rfp', 'FORECAST', ' Pre-RFP ']) {
      expect(classifyGovWinStage(s)).toBe('forecast');
    }
  });

  it('maps active/other statuses to solicitation', () => {
    for (const s of ['active', 'source selection', 'award', null, undefined, '']) {
      expect(classifyGovWinStage(s)).toBe('solicitation');
    }
  });
});

describe('GovWin adapter toNormalized enrichment mapping (#1134)', () => {
  it('carries incumbent, competitors, value and stage through for a solicitation', () => {
    const adapter = new GovWinSolicitationAdapter();
    const normalized = adapter.normalize(makeOpp() as unknown as Record<string, unknown>);

    expect(normalized).not.toBeNull();
    expect(normalized!.lifecycle_stage).toBe('solicitation');
    expect(normalized!.incumbent).toBe('Acme Federal LLC');
    expect(normalized!.incumbent_confidence).toBe('high');
    expect(normalized!.incumbent_source).toBe('govwin');
    expect(normalized!.competitors).toEqual(['Booz Allen', 'Leidos']);
    expect(normalized!.value_min).toBe(1_000_000);
    expect(normalized!.value_max).toBe(5_000_000);
    expect(normalized!.estimated_value_cents).toBe(100_000_000);
    expect(normalized!.source_status).toBe('active');
  });

  it('classifies pre-RFP records as forecast stage', () => {
    const adapter = new GovWinForecastAdapter();
    const normalized = adapter.normalize(
      makeOpp({ status: 'pre-rfp' }) as unknown as Record<string, unknown>,
    );

    expect(normalized).not.toBeNull();
    expect(normalized!.lifecycle_stage).toBe('forecast');
    expect(normalized!.source_status).toBe('pre-rfp');
  });

  it('leaves incumbent confidence/source null when there is no incumbent', () => {
    const adapter = new GovWinSolicitationAdapter();
    const normalized = adapter.normalize(
      makeOpp({ incumbent: null, competitors: [], valueMin: null, valueMax: null }) as unknown as Record<
        string,
        unknown
      >,
    );

    expect(normalized).not.toBeNull();
    expect(normalized!.incumbent).toBeNull();
    expect(normalized!.incumbent_confidence).toBeNull();
    expect(normalized!.incumbent_source).toBeNull();
    expect(normalized!.competitors).toEqual([]);
    expect(normalized!.estimated_value_cents).toBeNull();
  });
});
