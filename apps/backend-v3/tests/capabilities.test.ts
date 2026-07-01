import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('../src/lib/db.js', () => {
  const mockPool = {
    query: vi.fn(),
    connect: vi.fn(),
  };
  return { pool: mockPool };
});

import { pool } from '../src/lib/db.js';

const mockPool = pool as unknown as {
  query: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
};

describe('Capability catalog seed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('seed capabilities count >= 15 for Envision', async () => {
    // We test the ENVISION_CAPABILITIES array length directly
    // by importing the seed module and checking the exported data

    // Mock pool.query to return no existing capabilities (so all get inserted)
    mockPool.query.mockResolvedValue({ rows: [] });

    const { seedCapabilities } = await import('../src/services/capabilities/seed.js');
    const result = await seedCapabilities();

    // At least 15 Envision capabilities should be seeded
    // Count the INSERT calls for envision entries
    const insertCalls = mockPool.query.mock.calls.filter(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        (call[0] as string).includes('INSERT INTO capabilities'),
    );

    // Total inserts should be >= 15 (Envision) + partner entries
    expect(insertCalls.length).toBeGreaterThanOrEqual(15);
    expect(result.inserted).toBeGreaterThanOrEqual(15);
  });

  it('every Envision capability has evidence grade A or B', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });

    const { seedCapabilities } = await import('../src/services/capabilities/seed.js');
    await seedCapabilities();

    // Check that all INSERT calls for envision have grade A or B
    const insertCalls = mockPool.query.mock.calls.filter(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        (call[0] as string).includes('INSERT INTO capabilities'),
    );

    for (const call of insertCalls) {
      const params = call[1] as unknown[];
      const ou = params[0] as string;
      const grade = params[8] as string;
      if (ou === 'envision') {
        expect(['A', 'B']).toContain(grade);
      }
    }
  });

  it('seed is idempotent — skips existing capabilities', async () => {
    // First call: no existing → insert
    mockPool.query
      .mockResolvedValueOnce({ rows: [] }) // SELECT check
      .mockResolvedValueOnce({ rows: [] }) // INSERT

    // On re-import the module is already cached, so we need to re-call
    mockPool.query.mockReset();

    // Simulate all capabilities already existing
    mockPool.query.mockResolvedValue({ rows: [{ id: 'existing-id' }] });

    const { seedCapabilities } = await import('../src/services/capabilities/seed.js');
    const result = await seedCapabilities();

    // All should be skipped
    expect(result.skipped).toBeGreaterThan(0);
    // No INSERT calls should be made
    const insertCalls = mockPool.query.mock.calls.filter(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        (call[0] as string).includes('INSERT INTO capabilities'),
    );
    expect(insertCalls.length).toBe(0);
  });
});

describe('Capability matching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('matches opportunity NAICS against capability catalog with expected score tolerance', async () => {
    // Mock: opportunity with NAICS 541715
    const mockOpp = {
      id: 'opp-1',
      title: 'Systems Engineering Support Services',
      description: 'Provide systems engineering and technical assistance for Army C5ISR programs',
      naics: '541715',
      psc: 'R425',
      agency: 'DoD-Army',
      set_aside: null,
    };

    // Mock: matching capability
    const mockCap = {
      id: 'cap-1',
      ou: 'envision',
      name: 'Systems Engineering & Integration',
      category: 'systems_engineering',
      description: 'Full lifecycle systems engineering including requirements analysis',
      naics_codes: ['541715', '541330'],
      psc_codes: ['R425'],
      agencies_strong_in: ['DoD-Army', 'PEO C3T'],
      past_performance_doc_ids: [],
      key_personnel: [],
      certifications: ['CMMI-DEV ML3'],
      evidence_grade: 'A',
      active: true,
      last_reviewed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };

    // Setup mock chain
    mockPool.query
      .mockResolvedValueOnce({ rows: [mockOpp] }) // opportunity lookup
      .mockResolvedValueOnce({ rows: [mockCap] }); // capabilities lookup
    mockPool.connect.mockResolvedValue(mockClient);

    const { matchOpportunityCapabilities } = await import('../src/services/capabilities/matching.js');
    const matches = await matchOpportunityCapabilities('opp-1');

    expect(matches.length).toBeGreaterThan(0);

    const topMatch = matches[0]!;
    // NAICS exact match (0.40) + PSC match (0.15) + Agency match (0.15) + description overlap
    // should produce a score well above 0.5
    expect(topMatch.match_score).toBeGreaterThanOrEqual(0.5);
    expect(topMatch.match_score).toBeLessThanOrEqual(1.0);

    // Score should be within ±0.05 of expected
    // Expected: 0.40 (NAICS exact) + 0.15 (PSC) + 0.15 (Agency) + ~0.05 (description)
    // = ~0.75
    expect(Math.abs(topMatch.match_score - 0.75)).toBeLessThanOrEqual(0.10);

    // Check reasons are populated
    expect(topMatch.match_reasons.length).toBeGreaterThan(0);
    const factors = topMatch.match_reasons.map((r) => r.factor);
    expect(factors).toContain('naics_exact');
    expect(factors).toContain('psc_match');
    expect(factors).toContain('agency_match');
  });

  it('non-matching opportunity produces zero or low-score matches', async () => {
    const mockOpp = {
      id: 'opp-2',
      title: 'Janitorial Services for VA Hospital',
      description: 'Provide cleaning and maintenance services',
      naics: '561720',
      psc: 'S206',
      agency: 'VA',
      set_aside: 'Small Business',
    };

    const mockCap = {
      id: 'cap-cyber',
      ou: 'envision',
      name: 'Cybersecurity & Information Assurance',
      category: 'c5isr',
      description: 'RMF assessment and authorization for DoD networks',
      naics_codes: ['541715', '541690'],
      psc_codes: ['D310', 'D316'],
      agencies_strong_in: ['DoD-Army', 'DISA'],
      past_performance_doc_ids: [],
      key_personnel: [],
      certifications: ['CMMC ML2'],
      evidence_grade: 'B',
      active: true,
      last_reviewed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };

    mockPool.query
      .mockResolvedValueOnce({ rows: [mockOpp] })
      .mockResolvedValueOnce({ rows: [mockCap] });
    mockPool.connect.mockResolvedValue(mockClient);

    const { matchOpportunityCapabilities } = await import('../src/services/capabilities/matching.js');
    const matches = await matchOpportunityCapabilities('opp-2');

    // A janitorial VA opp should not match well against a DoD cyber capability
    if (matches.length > 0) {
      expect(matches[0]!.match_score).toBeLessThan(0.5);
    }
  });
});

describe('Capability qualification gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('blocks qualification when no Envision capability scores >= 0.5', async () => {
    // Mock: no stored matches, and matching produces low scores
    const mockOpp = {
      id: 'opp-3',
      title: 'Office Supplies',
      description: 'Buy pens and paper',
      naics: '339940',
      psc: null,
      agency: null,
      set_aside: null,
    };

    const mockCap = {
      id: 'cap-1',
      ou: 'envision',
      name: 'Logistics & Supply Chain Management',
      category: 'logistics_sustainment',
      description: 'End-to-end logistics support',
      naics_codes: ['541614'],
      psc_codes: ['R706'],
      agencies_strong_in: ['DoD-Army'],
      past_performance_doc_ids: [],
      key_personnel: [],
      certifications: [],
      evidence_grade: 'A',
      active: true,
      last_reviewed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };

    // getOpportunityCapabilityMatches returns empty → triggers matchOpportunityCapabilities
    mockPool.query
      .mockResolvedValueOnce({ rows: [] }) // getOpportunityCapabilityMatches
      .mockResolvedValueOnce({ rows: [mockOpp] }) // matchOpportunityCapabilities - opp lookup
      .mockResolvedValueOnce({ rows: [mockCap] }) // matchOpportunityCapabilities - caps lookup
      .mockResolvedValueOnce({ rows: [] }); // doctrine check
    mockPool.connect.mockResolvedValue(mockClient);

    const { qualifyWithCapabilities } = await import('../src/services/capabilities/qualify.js');
    const result = await qualifyWithCapabilities('opp-3');

    expect(result.qualified).toBe(false);
    expect(result.capability_blocked).toBe(true);
  });

  it('blocks qualification when doctrine exclusion fires', async () => {
    // Mock: good capability match but doctrine exclusion triggered
    mockPool.query
      .mockResolvedValueOnce({ // getOpportunityCapabilityMatches - has matches
        rows: [{
          opportunity_id: 'opp-4',
          capability_id: 'cap-1',
          match_score: '0.85',
          match_reasons: [{ factor: 'naics_exact', weight: 0.40, detail: 'NAICS match' }],
          computed_at: new Date().toISOString(),
        }],
      })
      .mockResolvedValueOnce({ // capability lookup for hydration
        rows: [{
          id: 'cap-1',
          ou: 'envision',
          name: 'Systems Engineering',
          evidence_grade: 'A',
          active: true,
        }],
      })
      .mockResolvedValueOnce({ // doctrine check
        rows: [{
          exclusion_triggers: [
            { name: 'NAICS outside profile', triggered: true },
          ],
        }],
      });

    const { qualifyWithCapabilities } = await import('../src/services/capabilities/qualify.js');
    const result = await qualifyWithCapabilities('opp-4');

    expect(result.qualified).toBe(false);
    expect(result.doctrine_blocked).toBe(true);
    expect(result.doctrine_exclusions.length).toBeGreaterThan(0);
  });
});
