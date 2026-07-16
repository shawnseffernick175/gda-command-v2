import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { poolQuery } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
}));

vi.mock('../src/lib/db.js', () => ({
  pool: { query: poolQuery },
}));

import { govtribeRoutes } from '../src/routes/govtribe.js';
import { govtribeSavedSearchRoutes } from '../src/routes/govtribe-saved-search.js';

beforeEach(() => {
  delete process.env['GOVTRIBE_ENABLED'];
  poolQuery.mockClear();
});

afterEach(() => {
  delete process.env['GOVTRIBE_ENABLED'];
});

describe('disabled GovTribe routes', () => {
  it('returns disabled without querying GovTribe tables', async () => {
    const app = Fastify();
    await app.register(govtribeRoutes);

    const response = await app.inject({
      method: 'GET',
      url: '/v3/govtribe/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      enabled: false,
      status: 'disabled',
    });
    expect(poolQuery).not.toHaveBeenCalled();

    await app.close();
  });

  it('disables saved-search execution before validation or database access', async () => {
    const app = Fastify();
    await app.register(govtribeSavedSearchRoutes);

    const response = await app.inject({
      method: 'POST',
      url: '/v3/govtribe/saved-search/run',
      payload: { savedSearchId: 'gda-opps-core' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      enabled: false,
      status: 'disabled',
    });
    expect(poolQuery).not.toHaveBeenCalled();

    await app.close();
  });
});
