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
import { getOpportunityById } from '../services/opportunities/index.js';

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
   *
   * Includes one automatic retry (1 s delay) when the agent socket closes
   * before response headers are sent.  Mid-stream failures end the
   * response so the client never hangs.
   */
  app.post('/v3/agent/run', async (req, reply) => {
    const traceId = req.requestId;
    const user = (req as typeof req & { user?: { sub: string } }).user;

    const doRequest = () =>
      undiciRequest(`${AGENT_BASE}/agent/run`, {
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

    const MAX_ATTEMPTS = 2;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await doRequest();

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
        return;
      } catch (err) {
        logger.error({ err, attempt }, 'agent-v3 /agent/run proxy failed');

        if (reply.raw.headersSent) {
          reply.raw.end();
          return;
        }

        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 1_000));
          continue;
        }

        return reply.status(502).send(
          errorEnvelope(
            'AGENT_UNAVAILABLE',
            'Analysis service temporarily unavailable. Please retry.',
            traceId,
          ),
        );
      }
    }
  });

  /**
   * POST /v3/agent/ask — buffered JSON wrapper around agent-v3 /agent/run.
   *
   * Unlike /v3/agent/run (SSE passthrough), this endpoint collects the
   * full SSE stream server-side and returns a single JSON response
   * { answer } inside the standard successEnvelope.  Used by the Q&A
   * panel so the frontend doesn't need to parse SSE.
   */
  app.post('/v3/agent/ask', async (req, reply) => {
    const traceId = req.requestId;
    const user = (req as typeof req & { user?: { sub: string } }).user;
    const body = req.body as Record<string, unknown> | undefined;

    if (!body || !body.task) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'body.task is required', traceId),
      );
    }

    // The frontend sends { task: "ask_ai", input: { prompt, object_type, object_id } }.
    // agent-v3 /agent/run expects { task: <instruction string>, context: {...} } and
    // ignores any `input` field, so forwarding the raw body produces an ungrounded
    // answer (the literal string "ask_ai" becomes the task). Translate here: use the
    // user's prompt as the real task, and when an opportunity is referenced, fetch it
    // and pass the key fields as context so the agent can ground its answer.
    const input = (body.input ?? {}) as Record<string, unknown>;
    const promptText = String(
      input.prompt ?? input.question ?? input.query ?? body.task,
    );

    const context: Record<string, unknown> = {};
    const objectType = input.object_type ?? input.objectType;
    const objectId = input.object_id ?? input.objectId;
    if (objectType) context.object_type = objectType;
    if (objectId) context.object_id = objectId;

    if (objectType === 'opportunity' && objectId != null) {
      try {
        const opp = await getOpportunityById(String(objectId));
        if (opp) {
          context.opportunity = {
            id: opp.id,
            title: opp.title,
            agency: opp.agency,
            department: opp.department,
            solicitation_number: opp.solicitation_number,
            status: opp.status,
            naics: opp.naics,
            psc: opp.psc,
            set_aside: opp.set_aside,
            value_min: opp.value_min,
            value_max: opp.value_max,
            response_due_at: opp.response_due_at,
            posted_at: opp.posted_at,
            place_of_performance: opp.place_of_performance,
            incumbent: opp.incumbent,
            source_uri: opp.source_uri,
            description: opp.description ? opp.description.slice(0, 4000) : null,
            analysis: opp.analysis ?? null,
          };
        } else {
          logger.warn({ objectId }, 'agent /ask: referenced opportunity not found');
        }
      } catch (err) {
        // Grounding is best-effort — if the lookup fails, still answer without it.
        logger.warn({ err, objectId }, 'agent /ask: failed to load opportunity context');
      }
    }

    const agentPayload = {
      task: promptText,
      context: Object.keys(context).length > 0 ? context : null,
    };

    try {
      const res = await undiciRequest(`${AGENT_BASE}/agent/run`, {
        method: 'POST',
        headers: {
          ...agentHeaders(traceId),
          'Content-Type': 'application/json',
          'X-GDA-Caller': user?.sub ?? 'anonymous',
        },
        body: JSON.stringify(agentPayload),
        headersTimeout: 10_000,
        bodyTimeout: 120_000,
      });

      const raw = await res.body.text();

      if (res.statusCode >= 400) {
        logger.warn({ status: res.statusCode, body: raw.slice(0, 500) }, 'agent-v3 /agent/run returned error for /ask');
        return reply.status(res.statusCode).send(
          errorEnvelope('AGENT_UNAVAILABLE', 'Agent returned an error', traceId),
        );
      }

      // Parse SSE: extract the last `data:` payload as the answer
      const lines = raw.split('\n');
      let lastData: string | null = null;
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          lastData = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          lastData = line.slice(5).trim();
        }
      }

      let answer: string;
      if (lastData) {
        try {
          const parsed = JSON.parse(lastData) as Record<string, unknown>;
          // Unwrap envelope if present
          if (parsed.success === true && parsed.data) {
            const inner = parsed.data as Record<string, unknown>;
            answer = String(inner.answer ?? inner.output ?? JSON.stringify(inner));
          } else {
            answer = String(parsed.answer ?? parsed.output ?? JSON.stringify(parsed));
          }
        } catch {
          // Not JSON — use raw SSE payload as plain-text answer
          answer = lastData;
        }
      } else if (raw.trim().length > 0) {
        // No SSE framing — try parsing the entire response as JSON
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          if (parsed.success === true && parsed.data) {
            const inner = parsed.data as Record<string, unknown>;
            answer = String(inner.answer ?? inner.output ?? JSON.stringify(inner));
          } else {
            answer = String(parsed.answer ?? parsed.output ?? JSON.stringify(parsed));
          }
        } catch {
          answer = raw.trim();
        }
      } else {
        answer = 'No response from analysis service.';
      }

      return reply.status(200).send(
        successEnvelope({ answer, trace_id: traceId }, traceId),
      );
    } catch (err) {
      logger.error({ err }, 'agent-v3 /agent/ask proxy failed');
      return reply.status(502).send(
        errorEnvelope('AGENT_UNAVAILABLE', 'Analysis service temporarily unavailable. Please retry.', traceId),
      );
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
