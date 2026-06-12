/**
 * Unit tests for the incumbent enrichment pipeline.
 *
 * Mocks USAspending and FPDS network calls; verifies match-level
 * confidence scoring and source-field formatting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock undici before importing the module under test
vi.mock('undici', () => ({
  request: vi.fn(),
}));

// Mock the FPDS client
vi.mock('../../../src/integrations/fpds/client.js', () => ({
  searchFpdsAwards: vi.fn(),
}));

import { lookupIncumbent, parseStateCode, type OpportunityForIncumbent } from '../../../src/services/enrichment/incumbent.js';
import { request } from 'undici';
import { searchFpdsAwards } from '../../../src/integrations/fpds/client.js';

const mockedRequest = vi.mocked(request);
const mockedFpds = vi.mocked(searchFpdsAwards);

function makeOpp(overrides: Partial<OpportunityForIncumbent> = {}): OpportunityForIncumbent {
  return {
    id: 1,
    solicitation_number: 'W56KGZ-25-R-0001',
    naics: '541330',
    agency: 'Department of Defense',
    place_of_performance: 'Norfolk, VA',
    value_min: 1_000_000,
    value_max: 5_000_000,
    ...overrides,
  };
}

function mockUSASpendingResponse(results: Record<string, unknown>[]) {
  return {
    statusCode: 200,
    body: {
      json: () => Promise.resolve({
        results,
        page_metadata: { page: 1, hasNext: false },
      }),
      text: () => Promise.resolve(''),
    },
  };
}

function mockUSASpendingEmpty() {
  return mockUSASpendingResponse([]);
}

describe('lookupIncumbent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns high confidence when solicitation_number matches in USAspending', async () => {
    mockedRequest.mockResolvedValueOnce(
      mockUSASpendingResponse([
        {
          'Award ID': 'CONT_AWD_W56KGZ25C0001',
          'Recipient Name': 'CACI International',
          'Start Date': '2024-01-15',
          'generated_internal_id': 'CONT_AWD_123',
        },
      ]) as never,
    );

    const result = await lookupIncumbent(makeOpp());

    expect(result).not.toBeNull();
    expect(result!.name).toBe('CACI International');
    expect(result!.confidence).toBe('high');
    expect(result!.source).toContain('usaspending:');
    expect(result!.source).toContain('CONT_AWD_W56KGZ25C0001');
  });

  it('returns medium confidence on NAICS+agency+POP match from USAspending', async () => {
    // Solicitation search returns empty
    mockedRequest.mockResolvedValueOnce(mockUSASpendingEmpty() as never);
    // NAICS+agency+POP search returns match
    mockedRequest.mockResolvedValueOnce(
      mockUSASpendingResponse([
        {
          'Award ID': 'CONT_AWD_MED_001',
          'Recipient Name': 'Leidos',
          'Start Date': '2023-06-01',
          'generated_internal_id': 'CONT_AWD_MED',
        },
      ]) as never,
    );

    const result = await lookupIncumbent(makeOpp());

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Leidos');
    expect(result!.confidence).toBe('medium');
    expect(result!.source).toContain('usaspending:');
  });

  it('returns low confidence on NAICS+agency+value range match from USAspending', async () => {
    // Solicitation empty
    mockedRequest.mockResolvedValueOnce(mockUSASpendingEmpty() as never);
    // NAICS+agency+POP empty
    mockedRequest.mockResolvedValueOnce(mockUSASpendingEmpty() as never);
    // NAICS+agency+value match
    mockedRequest.mockResolvedValueOnce(
      mockUSASpendingResponse([
        {
          'Award ID': 'CONT_AWD_LOW_001',
          'Recipient Name': 'SAIC',
          'Start Date': '2023-01-01',
          'generated_internal_id': 'CONT_AWD_LOW',
        },
      ]) as never,
    );

    const result = await lookupIncumbent(makeOpp());

    expect(result).not.toBeNull();
    expect(result!.name).toBe('SAIC');
    expect(result!.confidence).toBe('low');
  });

  it('falls back to FPDS when USAspending returns no results', async () => {
    // All USAspending searches empty
    mockedRequest.mockResolvedValue(mockUSASpendingEmpty() as never);

    // FPDS solicitation match
    mockedFpds.mockResolvedValueOnce({
      entries: [
        {
          piid: 'W56KGZ-22-D-0001',
          recipientName: 'ManTech International',
          recipientUei: null,
          contractingAgency: 'Department of Defense',
          naicsCode: '541330',
          dollarsObligated: 2_000_000,
          periodOfPerformanceStart: '2022-01-01',
          periodOfPerformanceEnd: '2025-01-01',
          placeOfPerformanceState: 'VA',
          solicitationId: 'W56KGZ-25-R-0001',
          description: null,
        },
      ],
      degraded: false,
    });

    const result = await lookupIncumbent(makeOpp());

    expect(result).not.toBeNull();
    expect(result!.name).toBe('ManTech International');
    expect(result!.confidence).toBe('high');
    expect(result!.source).toContain('fpds:');
    expect(result!.source).toContain('W56KGZ-22-D-0001');
  });

  it('returns null when neither source has results (no_match)', async () => {
    // All USAspending empty
    mockedRequest.mockResolvedValue(mockUSASpendingEmpty() as never);

    // All FPDS empty
    mockedFpds.mockResolvedValue({
      entries: [],
      degraded: false,
    });

    const result = await lookupIncumbent(makeOpp());

    expect(result).toBeNull();
  });

  it('throws on rate limiting for caller to handle', async () => {
    mockedRequest.mockResolvedValueOnce({
      statusCode: 429,
      body: {
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('Rate limited'),
      },
    } as never);
    // After retries exhausted, it should throw
    mockedRequest.mockResolvedValue({
      statusCode: 429,
      body: {
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('Rate limited'),
      },
    } as never);

    await expect(lookupIncumbent(makeOpp())).rejects.toThrow();
  });

  it('proceeds without state filter when place_of_performance is unparseable', async () => {
    // Solicitation search returns empty
    mockedRequest.mockResolvedValueOnce(mockUSASpendingEmpty() as never);
    // NAICS+agency+POP (no state filter) returns match
    mockedRequest.mockResolvedValueOnce(
      mockUSASpendingResponse([
        {
          'Award ID': 'CONT_AWD_NOPOP',
          'Recipient Name': 'Booz Allen Hamilton',
          'Start Date': '2023-03-01',
          'generated_internal_id': 'CONT_AWD_NOPOP_ID',
        },
      ]) as never,
    );

    const result = await lookupIncumbent(
      makeOpp({ place_of_performance: 'Multiple Locations, USA' }),
    );

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Booz Allen Hamilton');
    // Without parseable state the POP-level search still fires (medium confidence)
    expect(result!.confidence).toBe('medium');
  });

  it('skips solicitation search when solicitation_number is null', async () => {
    // NAICS+agency+POP match (first call since solicitation is skipped)
    mockedRequest.mockResolvedValueOnce(
      mockUSASpendingResponse([
        {
          'Award ID': 'CONT_AWD_NOSOL',
          'Recipient Name': 'Deloitte',
          'Start Date': '2023-09-01',
          'generated_internal_id': 'CONT_AWD_NOSOL_ID',
        },
      ]) as never,
    );

    const result = await lookupIncumbent(
      makeOpp({ solicitation_number: null }),
    );

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Deloitte');
    expect(result!.confidence).toBe('medium');
  });

  it('proceeds without state filter when place_of_performance is null', async () => {
    // Solicitation search returns empty
    mockedRequest.mockResolvedValueOnce(mockUSASpendingEmpty() as never);
    // NAICS+agency+POP (no state filter) returns match
    mockedRequest.mockResolvedValueOnce(
      mockUSASpendingResponse([
        {
          'Award ID': 'CONT_AWD_NULLPOP',
          'Recipient Name': 'Northrop Grumman',
          'Start Date': '2023-05-01',
          'generated_internal_id': 'CONT_AWD_NULLPOP_ID',
        },
      ]) as never,
    );

    const result = await lookupIncumbent(
      makeOpp({ place_of_performance: null }),
    );

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Northrop Grumman');
    expect(result!.confidence).toBe('medium');
  });
});

describe('parseStateCode', () => {
  it('parses "Norfolk, VA" → "VA"', () => {
    expect(parseStateCode('Norfolk, VA')).toBe('VA');
  });

  it('parses "Norfolk, VA 23501" → "VA"', () => {
    expect(parseStateCode('Norfolk, VA 23501')).toBe('VA');
  });

  it('parses "Washington, DC" → "DC"', () => {
    expect(parseStateCode('Washington, DC')).toBe('DC');
  });

  it('parses "Washington, DC 20301" → "DC"', () => {
    expect(parseStateCode('Washington, DC 20301')).toBe('DC');
  });

  it('parses bare state code "VA" → "VA"', () => {
    expect(parseStateCode('VA')).toBe('VA');
  });

  it('returns null for "Multiple Locations"', () => {
    expect(parseStateCode('Multiple Locations')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(parseStateCode(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseStateCode('')).toBeNull();
  });

  it('returns null for invalid two-letter code "foo bar XX"', () => {
    expect(parseStateCode('foo bar XX')).toBeNull();
  });

  it('returns null for full state name "Norfolk, Virginia"', () => {
    expect(parseStateCode('Norfolk, Virginia')).toBeNull();
  });

  it('parses zip+4 format "Norfolk, VA 23501-1234" → "VA"', () => {
    expect(parseStateCode('Norfolk, VA 23501-1234')).toBe('VA');
  });

  it('parses territory code "San Juan, PR" → "PR"', () => {
    expect(parseStateCode('San Juan, PR')).toBe('PR');
  });

  it('handles lowercase input "norfolk, va" → "VA"', () => {
    expect(parseStateCode('norfolk, va')).toBe('VA');
  });

  it('handles whitespace-padded input', () => {
    expect(parseStateCode('  Norfolk, VA  ')).toBe('VA');
  });

  it('parses GovTribe format "Aberdeen, MD, 21005, US" → "MD"', () => {
    expect(parseStateCode('Aberdeen, MD, 21005, US')).toBe('MD');
  });

  it('parses GovTribe format without zip "Norfolk, VA, US" → "VA"', () => {
    expect(parseStateCode('Norfolk, VA, US')).toBe('VA');
  });

  it('returns null for "Multiple Locations, USA"', () => {
    expect(parseStateCode('Multiple Locations, USA')).toBeNull();
  });
});
