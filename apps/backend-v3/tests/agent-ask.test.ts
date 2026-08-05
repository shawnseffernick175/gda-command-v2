import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock('../src/config/index.js', () => ({
  config: {
    agentV3Url: 'http://agent:9000',
    agentServiceToken: 'test-token',
    analysisVersion: 'v1.0.0',
  },
}));

// Mock undici request
const mockRequest = vi.fn();
vi.mock('undici', () => ({
  request: (...args: unknown[]) => mockRequest(...args),
}));

import Fastify from 'fastify';
import { agentRoutes } from '../src/routes/agent.js';

describe('POST /v3/agent/ask', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await agentRoutes(app);
    await app.ready();
  });

  it('returns 400 when body.task is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/agent/ask',
      payload: { question: 'hello' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain('task');
  });

  it('returns JSON envelope with answer from SSE stream', async () => {
    const ssePayload = 'data: {"answer":"The incumbent is SAIC."}\n\n';
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      body: { text: () => Promise.resolve(ssePayload) },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v3/agent/ask',
      payload: { task: 'ask_ai', input: { question: 'Who is the incumbent?' } },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.answer).toBe('The incumbent is SAIC.');
  });

  it('returns 502 when agent-v3 is unreachable', async () => {
    mockRequest.mockRejectedValueOnce(new Error('connection refused'));

    const res = await app.inject({
      method: 'POST',
      url: '/v3/agent/ask',
      payload: { task: 'ask_ai', input: { question: 'Test' } },
    });
    expect(res.statusCode).toBe(502);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
  });

  it('handles empty SSE stream gracefully', async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      body: { text: () => Promise.resolve('') },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v3/agent/ask',
      payload: { task: 'ask_ai', input: { question: 'Test' } },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.answer).toBe('No response from analysis service.');
  });

  it('unwraps envelope-wrapped SSE data', async () => {
    const ssePayload = 'data: {"success":true,"data":{"answer":"42","model":"claude"}}\n\n';
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      body: { text: () => Promise.resolve(ssePayload) },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v3/agent/ask',
      payload: { task: 'ask_ai', input: { question: 'What is the answer?' } },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.answer).toBe('42');
  });

  it('returns retrieved sources and no unverified citations when the answer only cites them', async () => {
    const finalEvent = {
      run_id: 'r1',
      status: 'ok',
      output:
        'The incumbent is SAIC (https://sam.gov/opp/abc/view). See also https://usaspending.gov/award/xyz.',
      sources: [
        { url: 'https://sam.gov/opp/abc/view', tool: 'sam_search' },
        { url: 'https://usaspending.gov/award/xyz', tool: 'usaspending_search' },
      ],
    };
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      body: { text: () => Promise.resolve(`data: ${JSON.stringify(finalEvent)}\n\n`) },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v3/agent/ask',
      payload: { task: 'ask_ai', input: { question: 'Who is the incumbent?' } },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.sources).toHaveLength(2);
    expect(body.data.unverified_citations).toEqual([]);
  });

  it('flags a citation URL that is not backed by any retrieved source', async () => {
    const finalEvent = {
      run_id: 'r1',
      status: 'ok',
      output:
        'The award went to Acme, see https://totally-made-up.example.com/award/999 for details.',
      sources: [{ url: 'https://sam.gov/opp/abc/view', tool: 'sam_search' }],
    };
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      body: { text: () => Promise.resolve(`data: ${JSON.stringify(finalEvent)}\n\n`) },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v3/agent/ask',
      payload: { task: 'ask_ai', input: { question: 'Who won?' } },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    // Answer text is never rewritten — the URL is flagged, not stripped.
    expect(body.data.answer).toContain('https://totally-made-up.example.com/award/999');
    expect(body.data.unverified_citations).toEqual([
      'https://totally-made-up.example.com/award/999',
    ]);
  });

  it('ignores trailing punctuation and trailing slash when matching citations', async () => {
    const finalEvent = {
      run_id: 'r1',
      status: 'ok',
      output: 'Source: https://sam.gov/opp/abc/view/.',
      sources: [{ url: 'https://sam.gov/opp/abc/view', tool: 'sam_search' }],
    };
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      body: { text: () => Promise.resolve(`data: ${JSON.stringify(finalEvent)}\n\n`) },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v3/agent/ask',
      payload: { task: 'ask_ai', input: { question: 'Source?' } },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.unverified_citations).toEqual([]);
  });
});
