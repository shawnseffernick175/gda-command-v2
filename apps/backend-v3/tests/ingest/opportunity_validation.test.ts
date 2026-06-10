import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OpportunityValidationFields } from '../../src/ingest/framework/opportunity_validation.js';

// Mock the logger before importing the module under test
vi.mock('../../src/lib/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mock is set up
const { validateAndRecompute, rejectReason } = await import(
  '../../src/ingest/framework/opportunity_validation.js'
);

function makeRow(overrides: Partial<OpportunityValidationFields> = {}): OpportunityValidationFields {
  return {
    title: 'Test Opportunity',
    description: 'A real description for testing.',
    data_source: 'sam.gov',
    agency: 'Department of Defense',
    agency_name: null,
    department_name: null,
    office: null,
    naics: '541330',
    set_aside: 'Total Small Business',
    value_min: 100_000,
    value_max: 500_000,
    response_due_at: '2027-01-15T17:00:00Z',
    posted_at: '2026-06-01T00:00:00Z',
    tags: [],
    sam_notice_id: 'abc123',
    ...overrides,
  };
}

describe('validateAndRecompute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('R1: nulls response_due_at when it is before posted_at', () => {
    const row = makeRow({
      posted_at: '2026-06-01T00:00:00Z',
      response_due_at: '2026-05-01T00:00:00Z',
    });
    const result = validateAndRecompute(row);
    expect(result.response_due_at).toBeNull();
    expect(result.posted_at).toBe('2026-06-01T00:00:00Z');
  });

  it('R2: nulls response_due_at when it is >10 years in the future', () => {
    const farFuture = new Date(Date.now() + 11 * 365 * 24 * 60 * 60 * 1000).toISOString();
    const row = makeRow({ response_due_at: farFuture });
    const result = validateAndRecompute(row);
    expect(result.response_due_at).toBeNull();
  });

  it('R3: nulls posted_at when it is >7 days in the future', () => {
    const eightDaysOut = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();
    const row = makeRow({ posted_at: eightDaysOut });
    const result = validateAndRecompute(row);
    expect(result.posted_at).toBeNull();
  });

  it('R4: swaps value_min and value_max when min > max', () => {
    const row = makeRow({ value_min: 100, value_max: 10 });
    const result = validateAndRecompute(row);
    expect(result.value_min).toBe(10);
    expect(result.value_max).toBe(100);
  });

  it('R5: nulls both values when value_min is negative', () => {
    const row = makeRow({ value_min: -5, value_max: 100 });
    const result = validateAndRecompute(row);
    expect(result.value_min).toBeNull();
    expect(result.value_max).toBeNull();
  });

  it('R5: nulls both values when value_max >= $1T', () => {
    const row = makeRow({ value_min: 100, value_max: 2e12 });
    const result = validateAndRecompute(row);
    expect(result.value_min).toBeNull();
    expect(result.value_max).toBeNull();
  });

  it('R6: nulls naics when not 6 digits and preserves raw in tags', () => {
    const row = makeRow({ naics: '12345' });
    const result = validateAndRecompute(row);
    expect(result.naics).toBeNull();
    expect(result.tags).toContain('bad_naics:12345');
  });

  it('R6: trims valid naics whitespace', () => {
    const row = makeRow({ naics: ' 541330 ' });
    const result = validateAndRecompute(row);
    expect(result.naics).toBe('541330');
  });

  it('R7: fills agency from agency_name when agency is empty', () => {
    const row = makeRow({ agency: '', agency_name: 'Air Force' });
    const result = validateAndRecompute(row);
    expect(result.agency).toBe('Air Force');
  });

  it('R7: fills agency from department_name when agency and agency_name are empty', () => {
    const row = makeRow({ agency: '', agency_name: '', department_name: 'DoD' });
    const result = validateAndRecompute(row);
    expect(result.agency).toBe('DoD');
  });

  it('R7: agency stays null when every fallback is empty', () => {
    const row = makeRow({ agency: null, agency_name: null, department_name: null, office: null });
    const result = validateAndRecompute(row);
    expect(result.agency).toBeNull();
  });

  it('R8: trims and collapses whitespace in set_aside', () => {
    const row = makeRow({ set_aside: '  Total   Small Business  ' });
    const result = validateAndRecompute(row);
    expect(result.set_aside).toBe('Total Small Business');
  });

  it('accepts ExternalOpportunityRow-shaped input and returns the same shape', () => {
    const externalRow = {
      ...makeRow(),
      external_id: 'ext-123',
      agency_subtype: 'sub-agency',
      data_source: 'govtribe',
      sam_notice_id: undefined,
    };
    const result = validateAndRecompute(externalRow);
    expect(result.external_id).toBe('ext-123');
    expect(result.agency_subtype).toBe('sub-agency');
    expect(result.data_source).toBe('govtribe');
  });

  it('does not mutate the input row', () => {
    const row = makeRow({ naics: '12345', value_min: 200, value_max: 100 });
    const original = { ...row, tags: [...row.tags] };
    validateAndRecompute(row);
    expect(row.naics).toBe(original.naics);
    expect(row.value_min).toBe(original.value_min);
    expect(row.value_max).toBe(original.value_max);
    expect(row.tags).toEqual(original.tags);
  });

  it('never throws on any field permutation (table-test)', () => {
    const permutations: Partial<OpportunityValidationFields>[] = [
      { title: '', description: null, agency: null, naics: null, set_aside: null, value_min: null, value_max: null, response_due_at: null, posted_at: null, tags: [] },
      { title: 'x', description: '', agency: '', naics: '', set_aside: '', value_min: 0, value_max: 0, response_due_at: 'garbage', posted_at: 'garbage', tags: ['a'] },
      { title: 'x', naics: 'ABCDEF', value_min: -999, value_max: 1e15, response_due_at: '9999-12-31', posted_at: '9999-12-31' },
      { title: 'x', naics: undefined as unknown as string | null },
    ];
    for (const overrides of permutations) {
      expect(() => validateAndRecompute(makeRow(overrides))).not.toThrow();
    }
  });
});

describe('rejectReason', () => {
  it('X1: rejects when title is empty and description is empty', () => {
    const row = makeRow({ title: '', description: '' });
    expect(rejectReason(row)).toBe('no title and no description');
  });

  it('X1: rejects when title is "Untitled" and description is null', () => {
    const row = makeRow({ title: 'Untitled', description: null });
    expect(rejectReason(row)).toBe('no title and no description');
  });

  it('X1: does NOT reject when title is "Untitled" but description has real text', () => {
    const row = makeRow({ title: 'Untitled', description: 'real text' });
    expect(rejectReason(row)).toBeNull();
  });

  it('X2: rejects when due >90 days ago and posted_at is null', () => {
    const past = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    const row = makeRow({ response_due_at: past, posted_at: null });
    expect(rejectReason(row)).toBe('response_due_at >90 days in the past with no posted_at (stale junk)');
  });

  it('X2: does NOT reject when due >90 days ago but posted_at is present', () => {
    const past = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    const row = makeRow({ response_due_at: past, posted_at: '2026-01-01T00:00:00Z' });
    expect(rejectReason(row)).toBeNull();
  });

  it('never throws', () => {
    const rows: Partial<OpportunityValidationFields>[] = [
      { title: '', description: null },
      { title: 'x', description: 'y' },
      { title: '', description: '', response_due_at: 'garbage', posted_at: null },
      { title: 'x', response_due_at: null, posted_at: null },
    ];
    for (const overrides of rows) {
      expect(() => rejectReason(makeRow(overrides))).not.toThrow();
    }
  });
});
