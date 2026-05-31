import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockFetchGroup,
  mockStartRun,
  mockFinishRun,
  mockUpsertAwardWithSources,
  mockMapUSASpendingAward,
} = vi.hoisted(() => ({
  mockFetchGroup: vi.fn(),
  mockStartRun: vi.fn(),
  mockFinishRun: vi.fn(),
  mockUpsertAwardWithSources: vi.fn(),
  mockMapUSASpendingAward: vi.fn(),
}));

vi.mock('../../src/ingest/usaspending/client.js', () => ({
  fetchGroup: mockFetchGroup,
  formatDate: (d: Date) => d.toISOString().slice(0, 10),
  CONTRACT_TYPE_CODES: ['A', 'B', 'C', 'D'],
  IDV_TYPE_CODES: ['IDV_A', 'IDV_B', 'IDV_B_A', 'IDV_B_B', 'IDV_B_C', 'IDV_C', 'IDV_D', 'IDV_E'],
}));

vi.mock('../../src/ingest/usaspending/mapper.js', () => ({
  mapUSASpendingAward: (...args: unknown[]) => mockMapUSASpendingAward(...args),
}));

vi.mock('../../src/ingest/usaspending/job.js', () => ({
  upsertAwardWithSources: (...args: unknown[]) => mockUpsertAwardWithSources(...args),
}));

vi.mock('../../src/ingest/framework/run_logger.js', () => ({
  startRun: (...args: unknown[]) => mockStartRun(...args),
  finishRun: (...args: unknown[]) => mockFinishRun(...args),
}));

vi.mock('../../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { runBackfill } from '../../src/ingest/usaspending/backfill.js';

function makeRawRecord(id: string) {
  return { 'Award ID': id, 'Recipient Name': 'Test Corp' };
}

describe('runBackfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStartRun.mockResolvedValue(BigInt(42));
    mockFinishRun.mockResolvedValue(undefined);
    mockMapUSASpendingAward.mockImplementation((raw: Record<string, unknown>) => ({
      award: { piid: raw['Award ID'] },
      citations: [],
    }));
    mockUpsertAwardWithSources.mockResolvedValue('inserted');
  });

  it('creates a single ingest_runs row with usaspending.gov.backfill source_key', async () => {
    mockFetchGroup.mockResolvedValue([]);

    await runBackfill({ days: 7 });

    expect(mockStartRun).toHaveBeenCalledTimes(1);
    expect(mockStartRun).toHaveBeenCalledWith('usaspending.gov.backfill');
    expect(mockFinishRun).toHaveBeenCalledTimes(1);
    expect(mockFinishRun.mock.calls[0][0]).toBe(BigInt(42));
    expect(mockFinishRun.mock.calls[0][1]).toBe('success');
  });

  it('splits a 14-day range into two 7-day chunks', async () => {
    mockFetchGroup.mockResolvedValue([]);

    const result = await runBackfill({ days: 14 });

    expect(result.chunks.length).toBe(2);
    expect(result.days).toBe(14);
  });

  it('splits a 30-day range into 5 chunks (4x7 + remainder)', async () => {
    mockFetchGroup.mockResolvedValue([]);

    const result = await runBackfill({ days: 30 });

    expect(result.chunks.length).toBe(5);
  });

  it('fetches contracts and idvs separately for each chunk', async () => {
    mockFetchGroup.mockResolvedValue([]);

    await runBackfill({ days: 7 });

    // 1 chunk x 2 groups = 2 calls
    expect(mockFetchGroup).toHaveBeenCalledTimes(2);
    expect(mockFetchGroup.mock.calls[0][0]).toBe('contracts');
    expect(mockFetchGroup.mock.calls[0][1]).toEqual(['A', 'B', 'C', 'D']);
    expect(mockFetchGroup.mock.calls[1][0]).toBe('idvs');
    expect(mockFetchGroup.mock.calls[1][1]).toEqual(
      ['IDV_A', 'IDV_B', 'IDV_B_A', 'IDV_B_B', 'IDV_B_C', 'IDV_C', 'IDV_D', 'IDV_E'],
    );
  });

  it('upserts each record via the F-241c upsert path', async () => {
    const records = [makeRawRecord('C001'), makeRawRecord('C002')];
    mockFetchGroup
      .mockResolvedValueOnce(records)
      .mockResolvedValueOnce([]);

    const result = await runBackfill({ days: 7 });

    expect(mockUpsertAwardWithSources).toHaveBeenCalledTimes(2);
    expect(result.total_inserted).toBe(2);
    expect(result.total_skipped).toBe(0);
  });

  it('counts skipped rows when upsert returns skipped (idempotency)', async () => {
    mockFetchGroup
      .mockResolvedValueOnce([makeRawRecord('C001')])
      .mockResolvedValueOnce([]);
    mockUpsertAwardWithSources.mockResolvedValue('skipped');

    const result = await runBackfill({ days: 7 });

    expect(result.total_inserted).toBe(0);
    expect(result.total_skipped).toBe(1);
  });

  it('continues when one chunk fails and marks run degraded', async () => {
    // First chunk: contracts throws, idvs ok
    mockFetchGroup
      .mockRejectedValueOnce(new Error('API timeout'))
      .mockResolvedValueOnce([makeRawRecord('I001')])
      // Second chunk: both ok
      .mockResolvedValueOnce([makeRawRecord('C002')])
      .mockResolvedValueOnce([]);

    const result = await runBackfill({ days: 14 });

    expect(result.chunks.length).toBe(2);
    expect(result.chunks[0].error).toContain('contracts: API timeout');
    expect(result.total_inserted).toBe(2);
    expect(mockFinishRun.mock.calls[0][1]).toBe('degraded');
  });

  it('returns run_id, days, duration_ms, and chunks in response shape', async () => {
    mockFetchGroup.mockResolvedValue([]);

    const result = await runBackfill({ days: 7 });

    expect(result.run_id).toBe('42');
    expect(result.days).toBe(7);
    expect(typeof result.duration_ms).toBe('number');
    expect(Array.isArray(result.chunks)).toBe(true);
    expect(result.chunks[0]).toHaveProperty('chunk_start');
    expect(result.chunks[0]).toHaveProperty('chunk_end');
    expect(result.chunks[0]).toHaveProperty('contracts_rows');
    expect(result.chunks[0]).toHaveProperty('idvs_rows');
  });

  it('skips records that mapper returns null for', async () => {
    mockFetchGroup
      .mockResolvedValueOnce([makeRawRecord('C001')])
      .mockResolvedValueOnce([]);
    mockMapUSASpendingAward.mockReturnValue(null);

    const result = await runBackfill({ days: 7 });

    expect(mockUpsertAwardWithSources).not.toHaveBeenCalled();
    expect(result.total_skipped).toBe(1);
  });

  it('logs row errors without aborting the chunk', async () => {
    mockFetchGroup
      .mockResolvedValueOnce([makeRawRecord('C001'), makeRawRecord('C002')])
      .mockResolvedValueOnce([]);
    mockUpsertAwardWithSources
      .mockRejectedValueOnce(new Error('db error'))
      .mockResolvedValueOnce('inserted');

    const result = await runBackfill({ days: 7 });

    expect(result.total_inserted).toBe(1);
    expect(result.total_skipped).toBe(1);
  });
});
