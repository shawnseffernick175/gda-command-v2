import { beforeEach, describe, expect, it, vi } from 'vitest';

const { registerSource } = vi.hoisted(() => ({
  registerSource: vi.fn(),
}));

vi.mock('../../src/ingest/framework/registry.js', () => ({
  registerSource,
}));

import { isResearchFeedsEnabled } from '../../src/ingest/framework/research-feeds.js';
import { registerNSFSource } from '../../src/ingest/nsf/index.js';
import { registerArxivSource } from '../../src/ingest/arxiv/index.js';
import { registerNIHSource } from '../../src/ingest/nih/index.js';
import { registerSBIRSource } from '../../src/ingest/sbir/index.js';
import { registerDoDRSSSource } from '../../src/ingest/dod_rss/index.js';

const registerAll = (): void => {
  registerNSFSource();
  registerArxivSource();
  registerNIHSource();
  registerSBIRSource();
  registerDoDRSSSource();
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env['RESEARCH_FEEDS_ENABLED'];
});

describe('research feeds feature flag', () => {
  it('defaults to disabled and registers no research-feed sources', () => {
    expect(isResearchFeedsEnabled()).toBe(false);

    registerAll();

    expect(registerSource).not.toHaveBeenCalled();
  });

  it('restores all five sources when explicitly enabled', () => {
    process.env['RESEARCH_FEEDS_ENABLED'] = 'true';
    expect(isResearchFeedsEnabled()).toBe(true);

    registerAll();

    expect(registerSource.mock.calls.map(([key]) => key)).toEqual([
      'nsf',
      'arxiv',
      'nih',
      'sbir',
      'dod_rss',
    ]);
  });
});
