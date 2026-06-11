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

import { lookupIncumbent, type OpportunityForIncumbent } from '../../../src/services/enrichment/incumbent.js';
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
    place_of_performance_state: 'VA',
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

  it('skips POP-based search when place_of_performance_state is null', async () => {
    // Solicitation search returns empty
    mockedRequest.mockResolvedValueOnce(mockUSASpendingEmpty() as never);
    // Should skip NAICS+agency+POP (null state) and go to value range
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
      makeOpp({ place_of_performance_state: null }),
    );

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Booz Allen Hamilton');
    // Without POP, it should match on value range (low confidence)
    expect(result!.confidence).toBe('low');
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
});
