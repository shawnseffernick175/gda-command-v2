import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for the USAspending client group-split fetch logic.
 * Verifies that contracts and IDVs are fetched as separate groups,
 * partial failures produce degraded results, and both-fail throws.
 */

const { mockRequest } = vi.hoisted(() => {
  const mockRequest = vi.fn();
  return { mockRequest };
});

vi.mock('undici', () => ({ request: mockRequest }));

vi.mock('../../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { fetchUSASpendingAwards } from '../../src/ingest/usaspending/client.js';
import type { USASpendingFetchResult } from '../../src/ingest/usaspending/client.js';

function makeApiResponse(
  results: Record<string, unknown>[],
  hasNext = false,
  page = 1,
  total = results.length,
) {
  return {
    statusCode: 200,
    body: {
      json: async () => ({
        results,
        page_metadata: { page, hasNext, total, limit: 100 },
      }),
      text: async () => '',
    },
  };
}

function make422Response() {
  return {
    statusCode: 422,
    body: {
      json: async () => ({}),
      text: async () => "'award_type_codes' must only contain types from one group",
    },
  };
}

function makeContractRecord(id: string) {
  return {
    'Award ID': id,
    'Recipient Name': 'ACME Corp',
    'Contract Award Type': 'Firm Fixed Price',
    'generated_internal_id': `CONT_${id}`,
  };
}

function makeIdvRecord(id: string) {
  return {
    'Award ID': id,
    'Recipient Name': 'IDV Vendor',
    'Contract Award Type': 'IDV_B',
    'generated_internal_id': `IDV_${id}`,
  };
}

describe('fetchUSASpendingAwards — group-split', () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  it('sends two separate requests with correct award_type_codes', async () => {
    const contractRecords = [makeContractRecord('C001'), makeContractRecord('C002')];
    const idvRecords = [makeIdvRecord('I001')];

    mockRequest
      .mockResolvedValueOnce(makeApiResponse(contractRecords))
      .mockResolvedValueOnce(makeApiResponse(idvRecords));

    const from = new Date('2026-05-30T00:00:00Z');
    const to = new Date('2026-05-31T00:00:00Z');
    const result: USASpendingFetchResult = await fetchUSASpendingAwards(from, to);

    expect(mockRequest).toHaveBeenCalledTimes(2);

    // First call: contracts group
    const firstBody = JSON.parse(mockRequest.mock.calls[0][1].body);
    expect(firstBody.filters.award_type_codes).toEqual(['A', 'B', 'C', 'D']);

    // Second call: IDVs group
    const secondBody = JSON.parse(mockRequest.mock.calls[1][1].body);
    expect(secondBody.filters.award_type_codes).toEqual([
      'IDV_A', 'IDV_B', 'IDV_B_A', 'IDV_B_B', 'IDV_B_C', 'IDV_C', 'IDV_D', 'IDV_E',
    ]);

    expect(result.records).toHaveLength(3);
    expect(result.contracts_rows).toBe(2);
    expect(result.idvs_rows).toBe(1);
    expect(result.degraded).toBe(false);
  });

  it('paginates each group independently', async () => {
    const page1 = [makeContractRecord('C001')];
    const page2 = [makeContractRecord('C002')];
    const idvPage = [makeIdvRecord('I001')];

    mockRequest
      .mockResolvedValueOnce(makeApiResponse(page1, true, 1, 2))
      .mockResolvedValueOnce(makeApiResponse(page2, false, 2, 2))
      .mockResolvedValueOnce(makeApiResponse(idvPage, false, 1, 1));

    const from = new Date('2026-05-30T00:00:00Z');
    const to = new Date('2026-05-31T00:00:00Z');
    const result = await fetchUSASpendingAwards(from, to);

    // 2 contract pages + 1 IDV page = 3 calls
    expect(mockRequest).toHaveBeenCalledTimes(3);
    expect(result.records).toHaveLength(3);
    expect(result.contracts_rows).toBe(2);
    expect(result.idvs_rows).toBe(1);
  });

  it('returns degraded when contracts fail but IDVs succeed', async () => {
    mockRequest
      .mockResolvedValueOnce(make422Response())
      .mockResolvedValueOnce(makeApiResponse([makeIdvRecord('I001')]));

    const from = new Date('2026-05-30T00:00:00Z');
    const to = new Date('2026-05-31T00:00:00Z');
    const result = await fetchUSASpendingAwards(from, to);

    expect(result.degraded).toBe(true);
    expect(result.degradedReason).toContain('contracts group failed');
    expect(result.contracts_rows).toBe(0);
    expect(result.idvs_rows).toBe(1);
    expect(result.records).toHaveLength(1);
  });

  it('returns degraded when IDVs fail but contracts succeed', async () => {
    mockRequest
      .mockResolvedValueOnce(makeApiResponse([makeContractRecord('C001')]))
      .mockResolvedValueOnce(make422Response());

    const from = new Date('2026-05-30T00:00:00Z');
    const to = new Date('2026-05-31T00:00:00Z');
    const result = await fetchUSASpendingAwards(from, to);

    expect(result.degraded).toBe(true);
    expect(result.degradedReason).toContain('idvs group failed');
    expect(result.contracts_rows).toBe(1);
    expect(result.idvs_rows).toBe(0);
  });

  it('throws when both groups fail', async () => {
    mockRequest
      .mockResolvedValueOnce(make422Response())
      .mockResolvedValueOnce(make422Response());

    const from = new Date('2026-05-30T00:00:00Z');
    const to = new Date('2026-05-31T00:00:00Z');

    await expect(fetchUSASpendingAwards(from, to)).rejects.toThrow(
      'Both award groups failed',
    );
  });

  it('returns empty results when both groups return no data', async () => {
    mockRequest
      .mockResolvedValueOnce(makeApiResponse([]))
      .mockResolvedValueOnce(makeApiResponse([]));

    const from = new Date('2026-05-30T00:00:00Z');
    const to = new Date('2026-05-31T00:00:00Z');
    const result = await fetchUSASpendingAwards(from, to);

    expect(result.records).toHaveLength(0);
    expect(result.contracts_rows).toBe(0);
    expect(result.idvs_rows).toBe(0);
    expect(result.degraded).toBe(false);
  });
});
