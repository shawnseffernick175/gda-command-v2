/**
 * Agent V3 proxy routes — JWT-protected gateway to gda-agent-v3 runtime.
 *
 * GET  /v3/agent/healthz          — aggregate health (backend + agent-v3)
 * GET  /v3/agent/tools            — list registered agent tools
 * POST /v3/agent/run              — start agent run (SSE proxy)
 * GET  /v3/agent/trace/:run_id    — retrieve trace for a run
 * POST /v3/agent/cancel/:run_id   — cancel a running agent
 */

import type { FastifyInstance } from 'fastify';
import { request as undiciRequest } from 'undici';
import { config } from '../config/index.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { logger } from '../lib/logger.js';

const AGENT_BASE = config.agentV3Url;

function agentHeaders(traceId: string): Record<string, string> {
  const headers: Record<string, string> = {
    'X-GDA-Trace-Id': traceId,
  };
  if (config.agentServiceToken) {
    headers['Authorization'] = `Bearer ${config.agentServiceToken}`;
  }
  return headers;
}

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Aggregate health — calls agent-v3 /healthz and merges with backend status.
   */
  app.get('/v3/agent/healthz', async (req, reply) => {
    const traceId = req.requestId;
    let agentHealth: Record<string, unknown> | null = null;
    let agentReachable = false;

    try {
      const res = await undiciRequest(`${AGENT_BASE}/healthz`, {
        method: 'GET',
        headers: agentHeaders(traceId),
        headersTimeout: 5_000,
        bodyTimeout: 5_000,
      });
      if (res.statusCode === 200) {
        agentHealth = (await res.body.json()) as Record<string, unknown>;
        agentReachable = true;
      } else {
        const text = await res.body.text();
        logger.warn({ status: res.statusCode, body: text }, 'agent-v3 healthz non-200');
      }
    } catch (err) {
      logger.warn({ err }, 'agent-v3 healthz unreachable');
    }

    const data = {
      backend_v3: 'ok',
      agent_v3: agentReachable ? 'ok' : 'unreachable',
      agent_detail: agentHealth,
      trace_id: traceId,
    };

    const status = agentReachable ? 200 : 503;
    return reply.status(status).send(successEnvelope(data, traceId));
  });

  /**
   * Proxy GET /v3/agent/tools → agent-v3 /agent/tools
   */
  app.get('/v3/agent/tools', async (req, reply) => {
    const traceId = req.requestId;
    try {
      const res = await undiciRequest(`${AGENT_BASE}/agent/tools`, {
        method: 'GET',
        headers: agentHeaders(traceId),
        headersTimeout: 5_000,
        bodyTimeout: 10_000,
      });
      const body = await res.body.json();
      return reply.status(res.statusCode).send(
        res.statusCode === 200
          ? successEnvelope(body, traceId)
          : errorEnvelope('INTERNAL_ERROR', 'Agent tools request failed', traceId),
      );
    } catch (err) {
      logger.error({ err }, 'agent-v3 /agent/tools proxy failed');
      return reply.status(502).send(
        errorEnvelope('INTERNAL_ERROR', 'Agent runtime unreachable', traceId),
      );
    }
  });

  /**
   * Proxy POST /v3/agent/run → agent-v3 /agent/run (SSE passthrough)
   */
  app.post('/v3/agent/run', async (req, reply) => {
    const traceId = req.requestId;
    const user = (req as typeof req & { user?: { sub: string } }).user;
    try {
      const res = await undiciRequest(`${AGENT_BASE}/agent/run`, {
        method: 'POST',
        headers: {
          ...agentHeaders(traceId),
          'Content-Type': 'application/json',
          'X-GDA-Caller': user?.sub ?? 'anonymous',
        },
        body: JSON.stringify(req.body),
        headersTimeout: 10_000,
        bodyTimeout: 0,
      });

      void reply.raw.writeHead(res.statusCode, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-GDA-Trace-Id': traceId,
      });

      for await (const chunk of res.body) {
        reply.raw.write(chunk);
      }
      reply.raw.end();
    } catch (err) {
      logger.error({ err }, 'agent-v3 /agent/run proxy failed');
      if (!reply.raw.headersSent) {
        return reply.status(502).send(
          errorEnvelope('INTERNAL_ERROR', 'Agent runtime unreachable', traceId),
        );
      }
    }
  });

  /**
   * Proxy GET /v3/agent/trace/:run_id → agent-v3 /agent/trace/:run_id
   */
  app.get<{ Params: { run_id: string } }>('/v3/agent/trace/:run_id', async (req, reply) => {
    const traceId = req.requestId;
    const { run_id } = req.params;
    try {
      const res = await undiciRequest(`${AGENT_BASE}/agent/trace/${encodeURIComponent(run_id)}`, {
        method: 'GET',
        headers: agentHeaders(traceId),
        headersTimeout: 5_000,
        bodyTimeout: 10_000,
      });
      const body = await res.body.json();
      return reply.status(res.statusCode).send(
        res.statusCode === 200
          ? successEnvelope(body, traceId)
          : errorEnvelope('NOT_FOUND', 'Run not found', traceId),
      );
    } catch (err) {
      logger.error({ err }, 'agent-v3 /agent/trace proxy failed');
      return reply.status(502).send(
        errorEnvelope('INTERNAL_ERROR', 'Agent runtime unreachable', traceId),
      );
    }
  });

  /**
   * Proxy POST /v3/agent/cancel/:run_id → agent-v3 /agent/cancel/:run_id
   */
  app.post<{ Params: { run_id: string } }>('/v3/agent/cancel/:run_id', async (req, reply) => {
    const traceId = req.requestId;
    const { run_id } = req.params;
    try {
      const res = await undiciRequest(`${AGENT_BASE}/agent/cancel/${encodeURIComponent(run_id)}`, {
        method: 'POST',
        headers: agentHeaders(traceId),
        headersTimeout: 5_000,
        bodyTimeout: 5_000,
      });
      const body = await res.body.json();
      return reply.status(res.statusCode).send(
        res.statusCode === 200
          ? successEnvelope(body, traceId)
          : errorEnvelope('NOT_FOUND', 'Run not found or already completed', traceId),
      );
    } catch (err) {
      logger.error({ err }, 'agent-v3 /agent/cancel proxy failed');
      return reply.status(502).send(
        errorEnvelope('INTERNAL_ERROR', 'Agent runtime unreachable', traceId),
      );
    }
  });
}
