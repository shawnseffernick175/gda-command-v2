/**
 * Opportunities routes — CRUD + R2 analysis pipeline + R1 source citations.
 *
 * Endpoints:
 *   GET    /v3/opportunities       — list with filters, cursor pagination
 *   GET    /v3/opportunities/:id   — detail with 10s sync block (Addendum A.3)
 *   POST   /v3/opportunities       — create (manual entry, triggers pre-warm)
 *   PATCH  /v3/opportunities/:id   — update (pre-warm on analysis-affecting fields)
 *   POST   /v3/opportunities/:id/qualify — qualification with teaming flags
 */

import type { FastifyInstance } from 'fastify';
import { config } from '../config/index.js';
import { pool } from '../lib/db.js';
import { requireBoss, QUEUE_NAMES, type AnalysisJobData } from '../lib/queue.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { analysisCacheHits, analysisTimeoutCount } from '../lib/metrics.js';
import {
  listOpportunities,
  getOpportunityById,
  createOpportunity,
  updateOpportunity,
  qualifyOpportunity,
  rowToDetail,
  rowToSummary,
  type OpportunityRow,
  type OpportunityCreateInput,
  type OpportunityUpdateInput,
  type ListFilters,
} from '../services/opportunities/index.js';

function isCacheFresh(row: OpportunityRow): boolean {
  if (!row.analysis || !row.analysis_version || !row.ai_analyzed_at) return false;
  if (row.analysis_version !== config.analysisVersion) return false;
  return new Date(row.ai_analyzed_at) >= new Date(row.updated_at);
}

async function waitForAnalysis(
  opportunityId: string,
  timeoutMs: number,
  pollMs: number,
): Promise<OpportunityRow | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await pool.query<OpportunityRow>(
      'SELECT * FROM opportunities WHERE id = $1 AND deleted_at IS NULL',
      [opportunityId],
    );
    const row = res.rows[0];
    if (row && isCacheFresh(row)) return row;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return null;
}

function enqueueAnalysis(id: string, trigger: AnalysisJobData['trigger']): void {
  try {
    const boss = requireBoss();
    const jobData: AnalysisJobData = {
      entityType: 'opportunity',
      entityId: id,
      priority: trigger === 'detail-endpoint' ? 'high' : 'normal',
      trigger,
    };
    void boss.send(QUEUE_NAMES.ANALYSIS_OPPORTUNITY, jobData, {
      priority: trigger === 'detail-endpoint' ? 1 : 5,
      retryLimit: 3,
      retryDelay: 5,
      retryBackoff: true,
      singletonKey: `opp-${id}`,
    });
  } catch {
    // pg-boss not initialized (e.g., during tests) — swallow
  }
}

export async function opportunityRoutes(app: FastifyInstance): Promise<void> {
  // GET /v3/opportunities — list with filters + cursor pagination
  app.get('/v3/opportunities', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const filters: ListFilters = {
      status: query.status,
      agency: query.agency,
      naics: query.naics,
      grade: query.grade,
      due_before: query.due_before,
      due_after: query.due_after,
      set_aside: query.set_aside,
      min_value: query.min_value ? Number(query.min_value) : undefined,
      max_value: query.max_value ? Number(query.max_value) : undefined,
      hot: query.hot,
      limit: query.limit ? Number(query.limit) : undefined,
      cursor: query.cursor,
    };

    const result = await listOpportunities(filters);
    return reply.status(200).send(successEnvelope(result, req.requestId));
  });

  // GET /v3/opportunities/:id — detail with 10s synchronous block (Addendum A.3)
  app.get<{ Params: { id: string } }>('/v3/opportunities/:id', async (req, reply) => {
    const { id } = req.params;

    const row = await getOpportunityById(id);
    if (!row) {
      return reply
        .status(404)
        .send(errorEnvelope('NOT_FOUND', 'Resource not found', req.requestId));
    }

    if (isCacheFresh(row)) {
      analysisCacheHits.inc();
      const detail = await rowToDetail(row);
      return reply.status(200).send(successEnvelope(detail, req.requestId));
    }

    // Enqueue high-priority analysis and block up to 10s
    const boss = requireBoss();
    const jobData: AnalysisJobData = {
      entityType: 'opportunity',
      entityId: id,
      priority: 'high',
      trigger: 'detail-endpoint',
    };
    await boss.send(QUEUE_NAMES.ANALYSIS_OPPORTUNITY, jobData, {
      priority: 1,
      retryLimit: 3,
      retryDelay: 5,
      retryBackoff: true,
      singletonKey: `opp-${id}`,
    });

    const fresh = await waitForAnalysis(
      id,
      config.analysisTimeoutMs,
      config.analysisPollIntervalMs,
    );

    if (fresh) {
      analysisCacheHits.inc();
      const detail = await rowToDetail(fresh);
      return reply.status(200).send(successEnvelope(detail, req.requestId));
    }

    analysisTimeoutCount.inc();
    return reply
      .status(503)
      .send(
        errorEnvelope(
          'ANALYSIS_TIMEOUT',
          'Analysis not ready, retry in a few seconds',
          req.requestId,
          'estimated_seconds=8',
        ),
      );
  });

  // POST /v3/opportunities — create (manual entry path)
  app.post('/v3/opportunities', async (req, reply) => {
    const body = req.body as Record<string, unknown> | undefined;
    if (!body || typeof body.title !== 'string' || body.title.trim().length === 0) {
      return reply
        .status(400)
        .send(
          errorEnvelope('VALIDATION_ERROR', 'title is required', req.requestId),
        );
    }
    if (typeof body.source !== 'string' || body.source.trim().length === 0) {
      return reply
        .status(400)
        .send(
          errorEnvelope('VALIDATION_ERROR', 'source is required', req.requestId),
        );
    }

    const input: OpportunityCreateInput = {
      title: body.title as string,
      source: body.source as string,
      sam_notice_id: body.sam_notice_id as string | undefined,
      naics: body.naics as string | undefined,
      agency: body.agency as string | undefined,
      sub_agency: body.sub_agency as string | undefined,
      description: body.description as string | undefined,
      set_aside: body.set_aside as string | undefined,
      response_due_at: body.response_due_at as string | undefined,
      posted_at: body.posted_at as string | undefined,
      value_min: body.value_min !== undefined ? Number(body.value_min) : undefined,
      value_max: body.value_max !== undefined ? Number(body.value_max) : undefined,
    };

    const opp = await createOpportunity(input);

    // Pre-warm: enqueue analysis immediately on insert
    enqueueAnalysis(String(opp.id), 'pre-warm');

    const summary = await rowToSummary(opp);
    return reply.status(201).send(successEnvelope(summary, req.requestId));
  });

  // PATCH /v3/opportunities/:id — update
  app.patch<{ Params: { id: string } }>('/v3/opportunities/:id', async (req, reply) => {
    const { id } = req.params;
    const body = req.body as Record<string, unknown> | undefined;

    if (!body || Object.keys(body).length === 0) {
      return reply
        .status(400)
        .send(
          errorEnvelope('VALIDATION_ERROR', 'Request body must contain at least one field', req.requestId),
        );
    }

    const existing = await getOpportunityById(id);
    if (!existing) {
      return reply
        .status(404)
        .send(errorEnvelope('NOT_FOUND', 'Resource not found', req.requestId));
    }

    const input: OpportunityUpdateInput = {};
    const allowedFields: Array<keyof OpportunityUpdateInput> = [
      'title', 'naics', 'agency', 'sub_agency', 'description',
      'set_aside', 'response_due_at', 'value_min', 'value_max',
      'solicitation_number', 'sam_notice_id', 'psc', 'incumbent', 'tags',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'value_min' || field === 'value_max') {
          (input as Record<string, unknown>)[field] = Number(body[field]);
        } else {
          (input as Record<string, unknown>)[field] = body[field];
        }
      }
    }

    const { row, analysisAffected } = await updateOpportunity(id, input);

    // Pre-warm: enqueue analysis ONLY when analysis-affecting fields changed
    if (analysisAffected) {
      enqueueAnalysis(String(row.id), 'pre-warm');
    }

    const summary = await rowToSummary(row);
    return reply.status(200).send(successEnvelope(summary, req.requestId));
  });

  // POST /v3/opportunities/:id/qualify — qualification action
  app.post<{ Params: { id: string } }>('/v3/opportunities/:id/qualify', async (req, reply) => {
    const { id } = req.params;
    const body = req.body as Record<string, unknown> | undefined;

    const existing = await getOpportunityById(id);
    if (!existing) {
      return reply
        .status(404)
        .send(errorEnvelope('NOT_FOUND', 'Resource not found', req.requestId));
    }

    const user = (req as typeof req & { user?: { sub: string } }).user;
    const qualifiedBy = (body?.qualified_by as string) ?? user?.sub ?? 'system';

    const { row, teaming_flags } = await qualifyOpportunity(id, qualifiedBy);
    const summary = await rowToSummary(row);

    return reply.status(200).send(
      successEnvelope(
        {
          opportunity: summary,
          teaming_flags,
        },
        req.requestId,
      ),
    );
  });
}
