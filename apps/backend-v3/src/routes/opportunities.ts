/**
 * Opportunities routes — CRUD + R2 analysis pipeline + R1 source citations.
 *
 * Endpoints:
 *   GET    /v3/opportunities       — list with filters, cursor pagination
 *   GET    /v3/opportunities/:id   — detail with 10s sync block (Addendum A.3)
 *   POST   /v3/opportunities       — create (manual entry, triggers pre-warm)
 *   PATCH  /v3/opportunities/:id   — update (pre-warm on analysis-affecting fields)
 *   POST   /v3/opportunities/:id/qualify — qualification with teaming flags
 *
 * NOTE(F-405): Cache invalidation for unified_opportunity_field_overrides is
 * handled inside OpportunityRepo.setFieldOverride() — no manual invalidation
 * needed from route handlers.
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
import {
  getUnifiedOpportunityDetail,
  listUnifiedOpportunities,
  resolveStages,
} from '../services/opportunities/detail.js';
import {
  listMatchSuggestions,
  decideMatchSuggestion,
  isValidAction,
  PENDING_CONFIDENCES,
} from '../services/opportunities/match-suggestions.js';

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
  // ── F-412: match suggestions review queue ──────────────────────────────
  // GET /v3/match-suggestions — list pending (MEDIUM/LOW) cross-source link
  // suggestions awaiting a human decision. Query params:
  //   confidence  — narrow to a single pending tier (MEDIUM|LOW)
  //   internal_id — only suggestions for one unified opportunity
  //   limit       — 1..200 (default 50)
  //   cursor      — opaque keyset cursor
  app.get('/v3/match-suggestions', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;

    if (query.confidence) {
      const tier = query.confidence.toUpperCase();
      if (!PENDING_CONFIDENCES.includes(tier as (typeof PENDING_CONFIDENCES)[number])) {
        return reply
          .status(400)
          .send(
            errorEnvelope(
              'VALIDATION_ERROR',
              `Invalid confidence '${query.confidence}'. Pending tiers are MEDIUM or LOW.`,
              req.requestId,
            ),
          );
      }
    }

    const result = await listMatchSuggestions(pool, {
      confidence: query.confidence,
      internal_id: query.internal_id,
      limit: query.limit ? Number(query.limit) : undefined,
      cursor: query.cursor,
    });

    return reply.status(200).send(successEnvelope(result, req.requestId));
  });

  // POST /v3/match-suggestions — confirm or reject a pending suggestion.
  // Body: { link_id: number, action: 'confirm' | 'reject', decided_by?: string }
  app.post('/v3/match-suggestions', async (req, reply) => {
    const body = req.body as Record<string, unknown> | undefined;

    const rawLinkId = body?.link_id;
    const linkId =
      typeof rawLinkId === 'number'
        ? rawLinkId
        : typeof rawLinkId === 'string'
          ? Number(rawLinkId)
          : NaN;
    if (!Number.isInteger(linkId) || linkId <= 0) {
      return reply
        .status(400)
        .send(
          errorEnvelope('VALIDATION_ERROR', 'link_id (positive integer) is required', req.requestId),
        );
    }

    if (!isValidAction(body?.action)) {
      return reply
        .status(400)
        .send(
          errorEnvelope(
            'VALIDATION_ERROR',
            "action must be 'confirm' or 'reject'",
            req.requestId,
          ),
        );
    }

    const user = (req as typeof req & { user?: { sub: string } }).user;
    const decidedBy = (body?.decided_by as string) ?? user?.sub ?? 'system';

    const result = await decideMatchSuggestion(pool, {
      link_id: linkId,
      action: body.action as 'confirm' | 'reject',
      decided_by: decidedBy,
    });

    if (!result) {
      // No pending link with this id — either unknown or already decided.
      return reply
        .status(404)
        .send(
          errorEnvelope(
            'NOT_FOUND',
            'No pending match suggestion found for that link_id (it may not exist or was already decided)',
            req.requestId,
          ),
        );
    }

    return reply.status(200).send(successEnvelope(result, req.requestId));
  });

  // GET /v3/opportunities/unified — unified list with lifecycle_stage filter (F-411)
  // Query params:
  //   stage  — single lifecycle_stage (signal|forecast|pre_sol|solicitation|
  //            awarded|post_award|closed) OR a group (active|pipeline|
  //            fast_track|awarded)
  //   agency — ILIKE substring match
  //   naics  — ILIKE substring match
  //   limit  — 1..200 (default 50)
  //   cursor — opaque keyset cursor
  app.get('/v3/opportunities/unified', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;

    // Validate stage token (single value or known group) up front.
    if (query.stage) {
      const resolved = resolveStages(query.stage);
      if (resolved !== null && resolved.length === 0) {
        return reply
          .status(400)
          .send(
            errorEnvelope(
              'VALIDATION_ERROR',
              `Unknown stage '${query.stage}'. Use a lifecycle_stage value or a group (active, pipeline, fast_track, awarded).`,
              req.requestId,
            ),
          );
      }
    }

    const result = await listUnifiedOpportunities(pool, {
      stage: query.stage,
      agency: query.agency,
      naics: query.naics,
      limit: query.limit ? Number(query.limit) : undefined,
      cursor: query.cursor,
    });

    return reply.status(200).send(successEnvelope(result, req.requestId));
  });

  // GET /v3/opportunities/unified/:internal_id — unified merged view (F-410)
  // Returns the canonical merged opportunity assembled across all linked
  // sources: merged_fields{} (value + provenance), sources[] (raw per-source
  // records), conflicts[] (fields where sources disagree), lineage[] (links).
  app.get<{ Params: { internal_id: string } }>(
    '/v3/opportunities/unified/:internal_id',
    async (req, reply) => {
      const { internal_id } = req.params;

      const detail = await getUnifiedOpportunityDetail(pool, internal_id);
      if (!detail) {
        return reply
          .status(404)
          .send(errorEnvelope('NOT_FOUND', 'Resource not found', req.requestId));
      }

      return reply.status(200).send(successEnvelope(detail, req.requestId));
    },
  );

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
