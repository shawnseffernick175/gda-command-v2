/**
 * Route tests for GET /v3/llm-cost-rollup.
 *
 * Validates:
 * 1. Response includes provider, model, error_count per entry
 * 2. window=live is accepted (date_trunc bound, no interval param)
 * 3. Totals include error_count
 * 4. Invalid window values return 400
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../src/lib/db.js', () => ({
  pool: {
    query: (sql: string, params?: unknown[]) => queryMock(sql, params),
  },
}));

vi.mock('../../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'test-secret-test-secret-test-secret-1234';
process.env['DATABASE_URL'] = 'postgres://test:test@localhost:5432/test';

import Fastify, { type FastifyInstance } from 'fastify';
import { llmCostRollupRoutes } from '../../src/routes/llm-cost-rollup.js';

const MOCK_ROWS = [
  {
    task: 'opportunity_analysis',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
    call_count: 100,
    error_count: 0,
    total_latency_ms: 50000,
    avg_latency_ms: 500,
    total_tokens_input: 200000,
    total_tokens_output: 50000,
    total_cost_usd: '0.000000',
  },
  {
    task: 'opportunity_analysis',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    call_count: 5,
    error_count: 5,
    total_latency_ms: 2000,
    avg_latency_ms: 400,
    total_tokens_input: 10000,
    total_tokens_output: 0,
    total_cost_usd: '0.000000',
  },
  {
    task: 'competitor_contact_discovery',
    provider: 'perplexity',
    model: 'sonar-pro',
    call_count: 20,
    error_count: 0,
    total_latency_ms: 40000,
    avg_latency_ms: 2000,
    total_tokens_input: 8000,
    total_tokens_output: 4000,
    total_cost_usd: '0.120000',
  },
];

describe('GET /v3/llm-cost-rollup', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(llmCostRollupRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 400 for missing window param', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/llm-cost-rollup' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid window param', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/llm-cost-rollup?window=2d' });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error.message).toContain('live');
  });

  it('accepts window=live and returns entries with provider, model, error_count', async () => {
    queryMock.mockResolvedValueOnce({ rows: MOCK_ROWS, rowCount: MOCK_ROWS.length });

    const res = await app.inject({ method: 'GET', url: '/v3/llm-cost-rollup?window=live' });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);

    const data = body.data;
    expect(data.window).toBe('live');
    expect(data.entries).toHaveLength(3);

    const entry = data.entries[0];
    expect(entry).toHaveProperty('provider');
    expect(entry).toHaveProperty('model');
    expect(entry).toHaveProperty('error_count');
    expect(entry).toHaveProperty('avg_latency_ms');
    expect(entry.provider).toBe('anthropic');
    expect(entry.model).toBe('claude-sonnet-4-5-20250929');

    // live window should NOT pass an interval param
    const [sql, params] = queryMock.mock.calls[queryMock.mock.calls.length - 1];
    expect(sql).toContain("date_trunc('day', NOW())");
    expect(params).toEqual([]);
  });

  it('accepts window=7d and passes interval param', async () => {
    queryMock.mockResolvedValueOnce({ rows: MOCK_ROWS, rowCount: MOCK_ROWS.length });

    const res = await app.inject({ method: 'GET', url: '/v3/llm-cost-rollup?window=7d' });
    expect(res.statusCode).toBe(200);

    const [sql, params] = queryMock.mock.calls[queryMock.mock.calls.length - 1];
    expect(sql).toContain('$1::interval');
    expect(params).toEqual(['7 days']);
  });

  it('totals include error_count', async () => {
    queryMock.mockResolvedValueOnce({ rows: MOCK_ROWS, rowCount: MOCK_ROWS.length });

    const res = await app.inject({ method: 'GET', url: '/v3/llm-cost-rollup?window=30d' });
    const body = JSON.parse(res.payload);

    expect(body.data.totals).toHaveProperty('error_count');
    expect(body.data.totals.error_count).toBe(5);
    expect(body.data.totals.call_count).toBe(125);
  });

  it('SQL groups by task, provider, model', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await app.inject({ method: 'GET', url: '/v3/llm-cost-rollup?window=1d' });

    const [sql] = queryMock.mock.calls[queryMock.mock.calls.length - 1];
    expect(sql).toContain('GROUP BY task, provider, model');
  });
});
