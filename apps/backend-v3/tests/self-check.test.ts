import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock('../src/config/index.js', () => ({
  config: {
    analysisVersion: 'v1.0.0',
  },
}));

import { logger } from '../src/lib/logger.js';
import { runAnalyzerSelfCheck } from '../src/workers/self-check.js';

const mockLogger = logger as unknown as { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };

function makePool(overrides: {
  total_current?: number;
  with_llm?: number;
  errored?: number;
  stub_remaining?: number;
  last_written?: string | null;
}) {
  const defaults = {
    total_current: 100,
    with_llm: 90,
    errored: 5,
    stub_remaining: 0,
    last_written: new Date().toISOString(),
  };
  const data = { ...defaults, ...overrides };

  return {
    query: vi.fn().mockResolvedValue({
      rows: [{
        total_current: String(data.total_current),
        with_llm: String(data.with_llm),
        errored: String(data.errored),
        stub_remaining: String(data.stub_remaining),
        last_written: data.last_written,
      }],
    }),
  } as unknown as import('pg').Pool;
}

describe('runAnalyzerSelfCheck', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = globalThis.fetch;
    delete process.env['ALERT_WEBHOOK_URL'];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('reports HEALTHY when coverage >= 80% and errors <= 20%', async () => {
    const pool = makePool({ total_current: 100, with_llm: 85, errored: 10 });

    const result = await runAnalyzerSelfCheck(pool);

    expect(result.healthy).toBe(true);
    expect(result.reason).toBeNull();
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ total_current: 100, with_llm: 85 }),
      '[selfcheck] analyzer healthy',
    );
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('reports UNHEALTHY when total_current is 0', async () => {
    const pool = makePool({ total_current: 0, with_llm: 0, errored: 0 });

    const result = await runAnalyzerSelfCheck(pool);

    expect(result.healthy).toBe(false);
    expect(result.reason).toContain('no opportunities');
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('reports UNHEALTHY when LLM coverage < 80%', async () => {
    const pool = makePool({ total_current: 100, with_llm: 50, errored: 5 });

    const result = await runAnalyzerSelfCheck(pool);

    expect(result.healthy).toBe(false);
    expect(result.reason).toContain('coverage');
    expect(result.reason).toContain('< 80%');
  });

  it('reports UNHEALTHY when error rate > 20%', async () => {
    const pool = makePool({ total_current: 100, with_llm: 90, errored: 25 });

    const result = await runAnalyzerSelfCheck(pool);

    expect(result.healthy).toBe(false);
    expect(result.reason).toContain('error rate');
    expect(result.reason).toContain('> 20%');
  });

  it('reports UNHEALTHY when worker is stalled (last_written > 6h ago with stubs remaining)', async () => {
    const sevenHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    const pool = makePool({
      total_current: 100,
      with_llm: 90,
      errored: 5,
      stub_remaining: 10,
      last_written: sevenHoursAgo,
    });

    const result = await runAnalyzerSelfCheck(pool);

    expect(result.healthy).toBe(false);
    expect(result.reason).toContain('stalled');
  });

  it('fires webhook POST when UNHEALTHY and ALERT_WEBHOOK_URL is set', async () => {
    process.env['ALERT_WEBHOOK_URL'] = 'https://hooks.example.com/alert';
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = mockFetch;

    const pool = makePool({ total_current: 0, with_llm: 0, errored: 0 });

    await runAnalyzerSelfCheck(pool);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://hooks.example.com/alert',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('UNHEALTHY'),
      }),
    );
  });

  it('does NOT fire webhook when HEALTHY even if ALERT_WEBHOOK_URL is set', async () => {
    process.env['ALERT_WEBHOOK_URL'] = 'https://hooks.example.com/alert';
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = mockFetch;

    const pool = makePool({ total_current: 100, with_llm: 90, errored: 5 });

    await runAnalyzerSelfCheck(pool);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does NOT fire webhook when UNHEALTHY but ALERT_WEBHOOK_URL is unset', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = mockFetch;

    const pool = makePool({ total_current: 0, with_llm: 0, errored: 0 });

    await runAnalyzerSelfCheck(pool);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('swallows webhook errors without throwing', async () => {
    process.env['ALERT_WEBHOOK_URL'] = 'https://hooks.example.com/alert';
    const mockFetch = vi.fn().mockRejectedValue(new Error('network error'));
    globalThis.fetch = mockFetch;

    const pool = makePool({ total_current: 0, with_llm: 0, errored: 0 });

    await expect(runAnalyzerSelfCheck(pool)).resolves.not.toThrow();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      '[selfcheck] alert webhook POST failed',
    );
  });
});
