import { describe, it, expect } from 'vitest';

process.env['JWT_SECRET'] = 'test-jwt-secret';
process.env['GDA_WEBHOOK_KEY'] = 'test-webhook-key';
process.env['DATABASE_URL'] ??= 'postgresql://gda:gda_dev_password@localhost:5432/gda_command';
process.env['NODE_ENV'] = 'test';
process.env['ANALYSIS_VERSION'] ??= 'v0.0.1-test';

const { computePwin, buildFullAnalysis } = await import('../src/workers/analysis.js');
const { evaluateTeamingFlags, ANALYSIS_AFFECTING_FIELDS } = await import(
  '../src/services/opportunities/index.js'
);
const { SOURCE_KINDS } = await import('../src/lib/sources.js');

describe('Pwin model determinism', () => {
  it('returns same value for same inputs', () => {
    const features = {
      set_aside: 'SDB',
      agency: 'Department of the Army',
      naics: '541330',
      value_min: 5000000,
      value_max: 15000000,
      response_due_at: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
      incumbent: null,
      grade: 'A',
    };

    const result1 = computePwin(features);
    const result2 = computePwin(features);
    const result3 = computePwin(features);

    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
  });

  it('returns value between 0.05 and 0.95', () => {
    const features = {
      set_aside: null,
      agency: null,
      naics: null,
      value_min: null,
      value_max: null,
      response_due_at: null,
      incumbent: null,
      grade: null,
    };
    const result = computePwin(features);
    expect(result).toBeGreaterThanOrEqual(0.05);
    expect(result).toBeLessThanOrEqual(0.95);
  });

  it('Envision set-aside increases pwin', () => {
    const base = {
      set_aside: null,
      agency: null,
      naics: null,
      value_min: null,
      value_max: null,
      response_due_at: null,
      incumbent: null,
      grade: null,
    };
    const withSetAside = { ...base, set_aside: 'SDB' };

    expect(computePwin(withSetAside)).toBeGreaterThan(computePwin(base));
  });

  it('Envision agency increases pwin', () => {
    const base = {
      set_aside: null,
      agency: null,
      naics: null,
      value_min: null,
      value_max: null,
      response_due_at: null,
      incumbent: null,
      grade: null,
    };
    const withAgency = { ...base, agency: 'Department of the Army' };

    expect(computePwin(withAgency)).toBeGreaterThan(computePwin(base));
  });

  it('NAICS match increases pwin', () => {
    const base = {
      set_aside: null,
      agency: null,
      naics: null,
      value_min: null,
      value_max: null,
      response_due_at: null,
      incumbent: null,
      grade: null,
    };
    const withNaics = { ...base, naics: '541330' };

    expect(computePwin(withNaics)).toBeGreaterThan(computePwin(base));
  });

  it('Grade A gives higher pwin than Grade B', () => {
    const base = {
      set_aside: null,
      agency: null,
      naics: null,
      value_min: null,
      value_max: null,
      response_due_at: null,
      incumbent: null,
      grade: null,
    };
    const gradeA = { ...base, grade: 'A' };
    const gradeB = { ...base, grade: 'B' };

    expect(computePwin(gradeA)).toBeGreaterThan(computePwin(gradeB));
  });

  it('known incumbent decreases pwin', () => {
    const base = {
      set_aside: null,
      agency: null,
      naics: null,
      value_min: null,
      value_max: null,
      response_due_at: null,
      incumbent: null,
      grade: null,
    };
    const withIncumbent = { ...base, incumbent: 'CACI International' };

    expect(computePwin(withIncumbent)).toBeLessThan(computePwin(base));
  });
});

describe('buildFullAnalysis', () => {
  it('produces a complete analysis with all required fields', () => {
    const row: Record<string, unknown> = {
      id: '1',
      title: 'Test',
      agency: 'Department of the Army',
      naics: '541330',
      set_aside: 'SDB',
      value_min: 5000000,
      value_max: 15000000,
      response_due_at: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
      posted_at: new Date().toISOString(),
      incumbent: null,
      grade: 'A',
      solicitation_number: 'W52P1J-26-R-0047',
      sam_notice_id: 'SAM-123',
    };

    const analysis = buildFullAnalysis(row);

    expect(analysis.pwin).toBeDefined();
    expect(typeof analysis.pwin).toBe('number');
    expect(analysis.pwin_sources).toBeDefined();
    expect(Array.isArray(analysis.pwin_sources)).toBe(true);

    expect(analysis.incumbent_sources).toBeDefined();
    expect(Array.isArray(analysis.incumbent_sources)).toBe(true);

    expect(analysis.competitors).toBeDefined();
    expect(Array.isArray(analysis.competitors)).toBe(true);
    expect(analysis.competitors_sources).toBeDefined();
    expect(Array.isArray(analysis.competitors_sources)).toBe(true);

    expect(analysis.blackhat).toBeDefined();
    expect(analysis.blackhat_sources).toBeDefined();

    expect(analysis.wargame).toBeDefined();
    expect(analysis.wargame_sources).toBeDefined();

    expect(analysis.timeline).toBeDefined();
    expect(analysis.timeline_sources).toBeDefined();

    expect(analysis.version).toBe('v0.0.1-test');
    expect(analysis.generated_at).toBeTruthy();
  });

  it('all source refs have valid kind values', () => {
    const row: Record<string, unknown> = {
      id: '1',
      title: 'Test',
      agency: 'Department of the Army',
      naics: '541330',
      set_aside: null,
      value_min: null,
      value_max: null,
      response_due_at: null,
      posted_at: null,
      incumbent: null,
      grade: null,
      solicitation_number: null,
      sam_notice_id: null,
    };

    const analysis = buildFullAnalysis(row);
    const allSources = [
      ...(analysis.pwin_sources as Array<{ kind: string }>),
      ...(analysis.incumbent_sources as Array<{ kind: string }>),
      ...(analysis.competitors_sources as Array<{ kind: string }>),
      ...(analysis.blackhat_sources as Array<{ kind: string }>),
      ...(analysis.wargame_sources as Array<{ kind: string }>),
      ...(analysis.timeline_sources as Array<{ kind: string }>),
    ];

    const validKinds = new Set(SOURCE_KINDS);
    for (const src of allSources) {
      expect(validKinds.has(src.kind as typeof SOURCE_KINDS[number])).toBe(true);
    }
  });

  it('source refs have required fields (kind, title, url, retrieved_at)', () => {
    const row: Record<string, unknown> = {
      id: '1', title: 'Test', agency: null, naics: null,
      set_aside: null, value_min: null, value_max: null,
      response_due_at: null, posted_at: null, incumbent: null,
      grade: null, solicitation_number: null, sam_notice_id: null,
    };

    const analysis = buildFullAnalysis(row);
    const allSources = [
      ...(analysis.pwin_sources as Array<Record<string, unknown>>),
      ...(analysis.incumbent_sources as Array<Record<string, unknown>>),
      ...(analysis.timeline_sources as Array<Record<string, unknown>>),
    ];

    for (const src of allSources) {
      expect(typeof src.kind).toBe('string');
      expect(typeof src.title).toBe('string');
      expect(typeof src.url).toBe('string');
      expect(typeof src.retrieved_at).toBe('string');
    }
  });
});

describe('Teaming flag evaluation', () => {
  it('flags HUBZone set-aside → Riverstone', () => {
    const row = {
      id: '1', title: 'Test', agency: null, sub_agency: null,
      solicitation_number: null, sam_notice_id: null, status: 'discovery',
      grade: null, grade_evidence: null, value_min: null, value_max: null,
      naics: null, psc: null, set_aside: 'HUBZone', place_of_performance: null,
      response_due_at: null, posted_at: null, incumbent: null, description: null,
      tags: [], data_source: 'manual', analysis: null, analysis_version: null,
      ai_analyzed_at: null, qualified_at: null, qualified_by: null,
      source_id: '1', created_at: '', updated_at: '',
    };

    const flags = evaluateTeamingFlags(row);
    expect(flags.length).toBeGreaterThan(0);
    expect(flags[0]!.suggested_partner).toBe('riverstone');
    expect(flags[0]!.reason).toContain('HUBZone');
  });

  it('flags veteran set-aside → PD Systems', () => {
    const row = {
      id: '2', title: 'Test', agency: null, sub_agency: null,
      solicitation_number: null, sam_notice_id: null, status: 'discovery',
      grade: null, grade_evidence: null, value_min: null, value_max: null,
      naics: null, psc: null, set_aside: 'SDVOSB', place_of_performance: null,
      response_due_at: null, posted_at: null, incumbent: null, description: null,
      tags: [], data_source: 'manual', analysis: null, analysis_version: null,
      ai_analyzed_at: null, qualified_at: null, qualified_by: null,
      source_id: '1', created_at: '', updated_at: '',
    };

    const flags = evaluateTeamingFlags(row);
    expect(flags.length).toBeGreaterThan(0);
    expect(flags.some((f) => f.suggested_partner === 'pd_systems')).toBe(true);
  });

  it('flags training scope in description → PD Systems', () => {
    const row = {
      id: '3', title: 'Test', agency: null, sub_agency: null,
      solicitation_number: null, sam_notice_id: null, status: 'discovery',
      grade: null, grade_evidence: null, value_min: null, value_max: null,
      naics: null, psc: null, set_aside: null, place_of_performance: null,
      response_due_at: null, posted_at: null, incumbent: null,
      description: 'Immersive training and LVC integration support',
      tags: [], data_source: 'manual', analysis: null, analysis_version: null,
      ai_analyzed_at: null, qualified_at: null, qualified_by: null,
      source_id: '1', created_at: '', updated_at: '',
    };

    const flags = evaluateTeamingFlags(row);
    expect(flags.some((f) => f.suggested_partner === 'pd_systems')).toBe(true);
  });

  it('flags cyber scope in description → Riverstone', () => {
    const row = {
      id: '4', title: 'Test', agency: null, sub_agency: null,
      solicitation_number: null, sam_notice_id: null, status: 'discovery',
      grade: null, grade_evidence: null, value_min: null, value_max: null,
      naics: null, psc: null, set_aside: null, place_of_performance: null,
      response_due_at: null, posted_at: null, incumbent: null,
      description: 'Classified cyber operations and SIGINT support',
      tags: [], data_source: 'manual', analysis: null, analysis_version: null,
      ai_analyzed_at: null, qualified_at: null, qualified_by: null,
      source_id: '1', created_at: '', updated_at: '',
    };

    const flags = evaluateTeamingFlags(row);
    expect(flags.some((f) => f.suggested_partner === 'riverstone')).toBe(true);
  });

  it('returns empty for Envision-fit opportunity', () => {
    const row = {
      id: '5', title: 'Test', agency: 'Department of the Army', sub_agency: null,
      solicitation_number: null, sam_notice_id: null, status: 'discovery',
      grade: null, grade_evidence: null, value_min: null, value_max: null,
      naics: '541330', psc: null, set_aside: 'SDB', place_of_performance: null,
      response_due_at: null, posted_at: null, incumbent: null,
      description: 'Logistics support services',
      tags: [], data_source: 'manual', analysis: null, analysis_version: null,
      ai_analyzed_at: null, qualified_at: null, qualified_by: null,
      source_id: '1', created_at: '', updated_at: '',
    };

    const flags = evaluateTeamingFlags(row);
    expect(flags.length).toBe(0);
  });
});

describe('ANALYSIS_AFFECTING_FIELDS', () => {
  it('includes all fields per F-201 Addendum A.2', () => {
    const required = [
      'title', 'agency', 'sub_agency', 'solicitation_number', 'sam_notice_id',
      'naics', 'psc', 'set_aside', 'value_min', 'value_max', 'incumbent',
      'description', 'tags', 'response_due_at',
    ];
    for (const field of required) {
      expect(ANALYSIS_AFFECTING_FIELDS.has(field)).toBe(true);
    }
  });
});

describe('SOURCE_KINDS enum', () => {
  it('includes all required kinds per F-207', () => {
    const required = [
      'sam_gov', 'fpds', 'usaspending', 'govwin', 'govtribe',
      'news', 'doctrine', 'partner_site', 'internal', 'manual', 'n8n_workflow',
    ];
    for (const kind of required) {
      expect(SOURCE_KINDS.includes(kind as typeof SOURCE_KINDS[number])).toBe(true);
    }
  });
});
