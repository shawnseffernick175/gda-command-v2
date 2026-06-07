import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('assertAnalysisConfig', () => {
  let mockLogger: { fatal: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
  let mockProcessExit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockLogger = { fatal: vi.fn(), warn: vi.fn() };
    mockProcessExit = vi.fn();
    vi.spyOn(process, 'exit').mockImplementation(mockProcessExit as unknown as (code?: number) => never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function loadGuardWithConfig(overrides: { analysisVersion?: string; analysisTimeoutMs?: number; nodeEnv?: string }) {
    vi.doMock('../src/config/index.js', () => ({
      config: {
        analysisVersion: overrides.analysisVersion ?? 'v1.0.0',
        analysisTimeoutMs: overrides.analysisTimeoutMs ?? 20_000,
        nodeEnv: overrides.nodeEnv ?? 'development',
      },
    }));
    vi.doMock('../src/lib/logger.js', () => ({ logger: mockLogger }));

    const mod = await import('../src/lib/config-guard.js');
    return mod.assertAnalysisConfig;
  }

  it('exits in production when analysisVersion contains "stub"', async () => {
    const assertAnalysisConfig = await loadGuardWithConfig({
      analysisVersion: 'stub-v0',
      nodeEnv: 'production',
    });

    assertAnalysisConfig();

    expect(mockLogger.fatal).toHaveBeenCalledWith(
      expect.objectContaining({ analysisVersion: 'stub-v0' }),
      expect.stringContaining('stub value in production'),
    );
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  it('warns but does not exit in non-production when analysisVersion contains "stub"', async () => {
    const assertAnalysisConfig = await loadGuardWithConfig({
      analysisVersion: 'STUB-test',
      nodeEnv: 'development',
    });

    assertAnalysisConfig();

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ analysisVersion: 'STUB-test', nodeEnv: 'development' }),
      expect.stringContaining('stub value'),
    );
    expect(mockProcessExit).not.toHaveBeenCalled();
  });

  it('warns when analysisTimeoutMs is below 15000', async () => {
    const assertAnalysisConfig = await loadGuardWithConfig({
      analysisTimeoutMs: 10_000,
    });

    assertAnalysisConfig();

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ analysisTimeoutMs: 10_000 }),
      expect.stringContaining('below 15'),
    );
    expect(mockProcessExit).not.toHaveBeenCalled();
  });

  it('does not warn or exit for healthy config', async () => {
    const assertAnalysisConfig = await loadGuardWithConfig({
      analysisVersion: 'v1.0.0',
      analysisTimeoutMs: 30_000,
      nodeEnv: 'production',
    });

    assertAnalysisConfig();

    expect(mockLogger.fatal).not.toHaveBeenCalled();
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockProcessExit).not.toHaveBeenCalled();
  });
});
