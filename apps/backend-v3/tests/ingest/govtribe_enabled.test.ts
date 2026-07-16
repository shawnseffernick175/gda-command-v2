import { beforeEach, describe, expect, it, vi } from 'vitest';

const { registerAdapter, registerSource } = vi.hoisted(() => ({
  registerAdapter: vi.fn(),
  registerSource: vi.fn(),
}));

vi.mock('../../src/ingest/adapter/registry.js', () => ({
  registerAdapter,
}));

vi.mock('../../src/ingest/framework/registry.js', () => ({
  registerSource,
}));

import { isGovTribeEnabled } from '../../src/ingest/govtribe/enabled.js';
import { registerGovTribeSource } from '../../src/ingest/govtribe/index.js';

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env['GOVTRIBE_ENABLED'];
});

describe('GovTribe feature flag', () => {
  it('defaults to disabled and registers no sources', () => {
    expect(isGovTribeEnabled()).toBe(false);

    registerGovTribeSource();

    expect(registerAdapter).not.toHaveBeenCalled();
    expect(registerSource).not.toHaveBeenCalled();
  });

  it('restores all four sources when explicitly enabled', () => {
    process.env['GOVTRIBE_ENABLED'] = 'true';

    registerGovTribeSource();

    expect(registerAdapter).toHaveBeenCalledOnce();
    expect(registerSource).toHaveBeenCalledTimes(3);
    expect(registerSource.mock.calls.map(([key]) => key)).toEqual([
      'govtribe.contacts',
      'govtribe.vehicles',
      'govtribe.budget',
    ]);
  });
});
