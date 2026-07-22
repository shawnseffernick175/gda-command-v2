import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Sentinel hooks are DB/LLM-backed; mock them so we can assert which one runIngest routes to.
const onIngestSuccess = vi.fn().mockResolvedValue(undefined);
const onIngestFailure = vi.fn().mockResolvedValue(undefined);
const onIngestDegraded = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/services/sentinel/hooks.js', () => ({
  onIngestSuccess: (...a: unknown[]) => onIngestSuccess(...a),
  onIngestFailure: (...a: unknown[]) => onIngestFailure(...a),
  onIngestDegraded: (...a: unknown[]) => onIngestDegraded(...a),
}));

vi.mock('../../src/ingest/framework/run_logger.js', () => ({
  startRun: vi.fn().mockResolvedValue(1n),
  finishRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('runIngest — Sentinel routing by outcome', () => {
  beforeEach(() => {
    vi.resetModules();
    onIngestSuccess.mockClear();
    onIngestFailure.mockClear();
    onIngestDegraded.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves events on a clean success (onIngestSuccess only)', async () => {
    const { registerSource, runIngest } = await import('../../src/ingest/framework/registry.js');
    registerSource('src-ok', 'OK Source', async () => ({ inserted: 3, updated: 1, skipped: 0 }));

    await runIngest('src-ok');
    // fire-and-forget hooks — let microtasks flush
    await new Promise((r) => setTimeout(r, 0));

    expect(onIngestSuccess).toHaveBeenCalledWith('src-ok');
    expect(onIngestDegraded).not.toHaveBeenCalled();
    expect(onIngestFailure).not.toHaveBeenCalled();
  });

  // Regression: a degraded run (soft failure that did NOT throw — e.g. GovWin's
  // swallowed 422) previously called onIngestSuccess, which RESOLVED events, so
  // sentinel_events stayed empty for weeks despite the failure.
  it('records a Sentinel event on a degraded run and does NOT resolve', async () => {
    const { registerSource, runIngest } = await import('../../src/ingest/framework/registry.js');
    registerSource('src-degraded', 'Degraded Source', async () => ({
      inserted: 0,
      updated: 0,
      skipped: 0,
      degraded: true,
      degradedReason: 'API discovery failed: GovWin API 422',
    }));

    await runIngest('src-degraded');
    await new Promise((r) => setTimeout(r, 0));

    expect(onIngestDegraded).toHaveBeenCalledWith('src-degraded', 'API discovery failed: GovWin API 422');
    expect(onIngestSuccess).not.toHaveBeenCalled();
    expect(onIngestFailure).not.toHaveBeenCalled();
  });

  it('records a Sentinel failure when the ingest throws', async () => {
    const { registerSource, runIngest } = await import('../../src/ingest/framework/registry.js');
    registerSource('src-throw', 'Throwing Source', async () => {
      const err = new Error('boom') as Error & { statusCode?: number };
      err.statusCode = 429;
      throw err;
    });

    await expect(runIngest('src-throw')).rejects.toThrow('boom');
    await new Promise((r) => setTimeout(r, 0));

    expect(onIngestFailure).toHaveBeenCalledWith('src-throw', 'boom', 429);
    expect(onIngestSuccess).not.toHaveBeenCalled();
    expect(onIngestDegraded).not.toHaveBeenCalled();
  });
});
