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
import { logger } from '../lib/logger.js';
import { normalizePipelineStage } from '../lib/pipeline-stage.js';
import { runDoctrineCheck } from '../services/doctrine/index.js';
import {
  listOpportunities,
  listOpportunitiesPaged,
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
  resolvePrimaryOpportunityId,
} from '../services/opportunities/detail.js';
import { invalidateMergeCache } from '../services/opportunities/merge.js';
import {
  listMatchSuggestions,
  decideMatchSuggestion,
  bulkDecideMatchSuggestions,
  isValidAction,
  PENDING_CONFIDENCES,
  BULK_DECISION_MAX_ITEMS,
} from '../services/opportunities/match-suggestions.js';
import { listDupCandidates } from '../services/opportunities/dup-candidates.js';
import type { DupTier } from '../matching/dup-candidates.js';
import {
  setFieldOverrideWithAudit,
  getFieldOverrideAudit,
  isOverridableField,
  OVERRIDABLE_FIELDS,
} from '../services/opportunities/field-override.js';

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
  // ── F-413: field override with audit trail ─────────────────────────────
  // PUT /v3/opportunities/:internal_id/field-override
  //   body: { field_name, field_value, set_by?, reason? }
  //   field_value === null clears the override; any other value sets it.
  app.put('/v3/opportunities/:internal_id/field-override', async (req, reply) => {
    const { internal_id } = req.params as { internal_id: string };
    const body = req.body as Record<string, unknown> | undefined;

    if (!isOverridableField(body?.field_name)) {
      return reply
        .status(400)
        .send(
          errorEnvelope(
            'VALIDATION_ERROR',
            `field_name must be one of: ${[...OVERRIDABLE_FIELDS].sort().join(', ')}`,
            req.requestId,
          ),
        );
    }

    // field_value is required in the body (use null to clear). Distinguish a
    // missing key from an explicit null.
    if (body === undefined || !('field_value' in body)) {
      return reply
        .status(400)
        .send(
          errorEnvelope(
            'VALIDATION_ERROR',
            'field_value is required (use null to clear the override)',
            req.requestId,
          ),
        );
    }

    const user = (req as typeof req & { user?: { sub: string } }).user;
    const setBy = (body.set_by as string) ?? user?.sub ?? 'system';
    const reason = (body.reason as string | undefined) ?? null;

    const result = await setFieldOverrideWithAudit(pool, {
      internal_id,
      field_name: body.field_name as string,
      field_value: body.field_value,
      set_by: setBy,
      reason,
      request_id: req.requestId ?? null,
      ip_address: req.ip ?? null,
      user_agent: (req.headers['user-agent'] as string) ?? null,
      user_id: null,
    });

    if (!result) {
      return reply
        .status(404)
        .send(
          errorEnvelope('NOT_FOUND', `Opportunity ${internal_id} not found`, req.requestId),
        );
    }

    return reply.status(200).send(successEnvelope(result, req.requestId));
  });

  // GET /v3/opportunities/:internal_id/field-override/audit?field_name=
  //   Returns the override audit trail (newest first).
  app.get('/v3/opportunities/:internal_id/field-override/audit', async (req, reply) => {
    const { internal_id } = req.params as { internal_id: string };
    const { field_name } = req.query as { field_name?: string };

    const entries = await getFieldOverrideAudit(pool, internal_id, field_name);
    return reply
      .status(200)
      .send(successEnvelope({ internal_id, entries }, req.requestId));
  });

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
      request_id: req.requestId ?? null,
      ip_address: req.ip ?? null,
      user_agent: (req.headers['user-agent'] as string) ?? null,
      user_id: null,
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

  // POST /v3/match-suggestions/bulk — bulk confirm/reject pending suggestions.
  // Body: { items: [{ link_id, action }], decided_by }
  app.post('/v3/match-suggestions/bulk', async (req, reply) => {
    const body = req.body as Record<string, unknown> | undefined;

    const items = body?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return reply
        .status(400)
        .send(errorEnvelope('VALIDATION_ERROR', 'items must be a non-empty array', req.requestId));
    }
    if (items.length > BULK_DECISION_MAX_ITEMS) {
      return reply
        .status(400)
        .send(
          errorEnvelope(
            'VALIDATION_ERROR',
            `items exceeds maximum of ${BULK_DECISION_MAX_ITEMS}`,
            req.requestId,
          ),
        );
    }

    // Validate each item.
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx] as Record<string, unknown> | undefined;
      const rawId = item?.link_id;
      const id =
        typeof rawId === 'number'
          ? rawId
          : typeof rawId === 'string'
            ? Number(rawId)
            : NaN;
      if (!Number.isInteger(id) || id <= 0) {
        return reply
          .status(400)
          .send(
            errorEnvelope(
              'VALIDATION_ERROR',
              `items[${idx}].link_id must be a positive integer`,
              req.requestId,
            ),
          );
      }
      if (!isValidAction(item?.action)) {
        return reply
          .status(400)
          .send(
            errorEnvelope(
              'VALIDATION_ERROR',
              `items[${idx}].action must be 'confirm' or 'reject'`,
              req.requestId,
            ),
          );
      }
    }

    const decidedBy = body?.decided_by;
    if (typeof decidedBy !== 'string' || decidedBy.trim() === '') {
      return reply
        .status(400)
        .send(errorEnvelope('VALIDATION_ERROR', 'decided_by is required', req.requestId));
    }

    // Coerce link_ids to numbers (bigint strings from pg).
    const coercedItems = items.map((item: Record<string, unknown>) => ({
      link_id: Number(item.link_id),
      action: item.action as 'confirm' | 'reject',
    }));

    const result = await bulkDecideMatchSuggestions(pool, {
      items: coercedItems,
      decided_by: decidedBy,
      request_id: req.requestId ?? null,
      ip_address: req.ip ?? null,
      user_agent: (req.headers['user-agent'] as string) ?? null,
      user_id: null,
    });

    return reply.status(200).send(successEnvelope(result, req.requestId));
  });

  // ── F-440: near-duplicate opportunity candidates (read-only) ───────────
  // GET /v3/opportunities/dup-candidates — list LOW-confidence near-dup
  // candidate pairs for human review.
  //   limit — 1..200 (default 50)
  //   tier  — STRONG | WEAK (optional filter; 400 on other values)
  const VALID_DUP_TIERS = new Set<DupTier>(['STRONG', 'WEAK']);

  app.get('/v3/opportunities/dup-candidates', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;

    let tier: DupTier | undefined;
    if (query.tier) {
      const upper = query.tier.toUpperCase() as DupTier;
      if (!VALID_DUP_TIERS.has(upper)) {
        return reply
          .status(400)
          .send(
            errorEnvelope(
              'VALIDATION_ERROR',
              `Invalid tier '${query.tier}'. Must be STRONG or WEAK.`,
              req.requestId,
            ),
          );
      }
      tier = upper;
    }

    const result = await listDupCandidates(pool, {
      limit: query.limit ? Number(query.limit) : undefined,
      tier,
    });

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

  // POST /v3/opportunities/unified/:internal_id/analyze — trigger analysis
  // for a unified opportunity (F-420a / R2). Resolves the underlying
  // opportunities.id via the primary-source link, enqueues a high-priority
  // analysis job, blocks up to the configured analysis timeout, then returns
  // the refreshed unified detail (so the caller gets pwin + provenance in one
  // round-trip). Mirrors the GET /v3/opportunities/:id analyze-on-read path.
  app.post<{ Params: { internal_id: string } }>(
    '/v3/opportunities/unified/:internal_id/analyze',
    async (req, reply) => {
      const { internal_id } = req.params;

      const detail = await getUnifiedOpportunityDetail(pool, internal_id);
      if (!detail) {
        return reply
          .status(404)
          .send(errorEnvelope('NOT_FOUND', 'Resource not found', req.requestId));
      }

      const opportunityId = await resolvePrimaryOpportunityId(pool, detail);
      if (!opportunityId) {
        // No analyzable source row (e.g. fast_track-only). Return the current
        // unified detail unchanged rather than 5xx — nothing to analyze.
        return reply.status(200).send(successEnvelope(detail, req.requestId));
      }

      enqueueAnalysis(opportunityId, 'detail-endpoint');

      const fresh = await waitForAnalysis(
        opportunityId,
        config.analysisTimeoutMs,
        config.analysisPollIntervalMs,
      );

      if (!fresh) {
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
      }

      analysisCacheHits.inc();

      // Fire-and-forget doctrine scoring after analysis
      runDoctrineCheck('opportunity', String(opportunityId), {}).catch((err) => {
        logger.warn({ err, opportunityId }, 'Background doctrine check failed (non-critical)');
      });

      // Re-read the unified detail so pwin/doctrine reflect the fresh analysis.
      // The first getUnifiedOpportunityDetail above populated the merge cache
      // (60s TTL), so we must invalidate it before re-reading or we'd return
      // the stale pre-analysis payload (Devin #639/0001).
      invalidateMergeCache(internal_id);
      const refreshed = (await getUnifiedOpportunityDetail(pool, internal_id)) ?? detail;
      return reply.status(200).send(successEnvelope(refreshed, req.requestId));
    },
  );

  // GET /v3/opportunities — list with filters + cursor pagination
  app.get('/v3/opportunities', async (req, reply) => {
    const query = req.query as Record<string, string | string[] | undefined>;

    const parseArray = (val: string | string[] | undefined): string[] | undefined => {
      if (!val) return undefined;
      if (Array.isArray(val)) return val;
      return val.split(',');
    };

    const relevantOnlyRaw = query.relevant_only as string | undefined;
    const relevantOnly = relevantOnlyRaw === 'false' ? false : true;

    const filters: ListFilters = {
      q: query.q as string | undefined,
      status: query.status as string | undefined,
      agency: query.agency as string | undefined,
      department: query.department as string | undefined,
      naics: query.naics as string | undefined,
      grade: query.grade as string | undefined,
      grades: parseArray(query['grade[]'] ?? query.grades),
      due_before: query.due_before as string | undefined,
      due_after: query.due_after as string | undefined,
      due: query.due as string | undefined,
      set_aside: query.set_aside as string | undefined,
      set_asides: parseArray(query['set_aside[]'] ?? query.set_asides),
      min_value: query.value_min ? Number(query.value_min) : (query.min_value ? Number(query.min_value) : undefined),
      max_value: query.value_max ? Number(query.value_max) : (query.max_value ? Number(query.max_value) : undefined),
      hot: query.hot as string | undefined,
      sources: parseArray(query['source[]'] ?? query.sources),
      stage: query.stage as string | undefined,
      relevantOnly,
      limit: query.limit ? Number(query.limit) : undefined,
      cursor: query.cursor as string | undefined,
      page: query.page ? Number(query.page) : undefined,
    };

    if (filters.page) {
      const result = await listOpportunitiesPaged(filters);
      return reply.status(200).send(successEnvelope(result, req.requestId));
    }

    const result = await listOpportunities(filters);
    return reply.status(200).send(successEnvelope(result, req.requestId));
  });

  // Fetch the latest pipeline stage for an opportunity (defaults to 'interest')
  async function getPipelineStage(oppId: string): Promise<string> {
    const res = await pool.query<{ stage: string }>(
      `SELECT stage FROM pipeline_items WHERE opportunity_id = $1 ORDER BY id DESC LIMIT 1`,
      [oppId],
    );
    return res.rows[0]?.stage ?? 'interest';
  }

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
      const pipelineStage = await getPipelineStage(id);
      return reply.status(200).send(successEnvelope({ ...detail, pipeline_stage: pipelineStage }, req.requestId));
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

      // Fire-and-forget doctrine scoring after analysis
      runDoctrineCheck('opportunity', id, {}).catch((err) => {
        logger.warn({ err, opportunityId: id }, 'Background doctrine check failed (non-critical)');
      });

      const detail = await rowToDetail(fresh);
      const pipelineStage = await getPipelineStage(id);
      return reply.status(200).send(successEnvelope({ ...detail, pipeline_stage: pipelineStage }, req.requestId));
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
      'stage',
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

    // Validate stage early so we return 400 instead of a DB constraint violation
    if (input.stage && !normalizePipelineStage(input.stage)) {
      return reply
        .status(400)
        .send(
          errorEnvelope(
            'VALIDATION_ERROR',
            `Unknown pipeline stage "${input.stage}". Accepted values: Interest, Qualify, Pursue, Solicitation, Post-Submittal, Won, Lost, No Bid, Government Cancelled (or their DB keys).`,
            req.requestId,
          ),
        );
    }

    const { row, analysisAffected } = await updateOpportunity(id, input);

    // Pre-warm: enqueue analysis ONLY when analysis-affecting fields changed
    if (analysisAffected) {
      enqueueAnalysis(String(row.id), 'pre-warm');
    }

    const summary = await rowToSummary(row);
    const pipelineStage = await getPipelineStage(id);
    return reply.status(200).send(successEnvelope({ ...summary, pipeline_stage: pipelineStage }, req.requestId));
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

  // POST /v3/opportunities/:id/analyze — manually trigger analysis for a single opportunity
  app.post<{ Params: { id: string } }>('/v3/opportunities/:id/analyze', async (req, reply) => {
    const { id } = req.params;

    const existing = await getOpportunityById(id);
    if (!existing) {
      return reply
        .status(404)
        .send(errorEnvelope('NOT_FOUND', 'Resource not found', req.requestId));
    }

    enqueueAnalysis(String(id), 'manual');

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

    return reply.status(202).send(
      successEnvelope({ queued: true, opportunity_id: id, message: 'Analysis enqueued' }, req.requestId),
    );
  });

  // POST /v3/opportunities/:id/outcome — record win/loss/no_bid outcome for pWin feedback
  app.post<{ Params: { id: string } }>('/v3/opportunities/:id/outcome', async (req, reply) => {
    const { id } = req.params;
    const body = req.body as Record<string, unknown> | undefined;

    const validOutcomes = ['won', 'lost', 'no_bid'];
    const outcome = body?.outcome as string | undefined;
    if (!outcome || !validOutcomes.includes(outcome)) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', `outcome must be one of: ${validOutcomes.join(', ')}`, req.requestId),
      );
    }

    const existing = await getOpportunityById(id);
    if (!existing) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Resource not found', req.requestId),
      );
    }

    const analysis = existing.analysis as { pwin?: { score?: number } } | null;
    const predictedPwin = analysis?.pwin?.score ?? null;
    const predictedGrade = existing.grade ?? null;

    await pool.query(
      `INSERT INTO pwin_outcomes (opportunity_id, predicted_pwin, predicted_grade, actual_outcome, feedback_source)
       VALUES ($1, $2, $3, $4, 'manual')
       ON CONFLICT (opportunity_id)
       DO UPDATE SET
         predicted_pwin = EXCLUDED.predicted_pwin,
         predicted_grade = EXCLUDED.predicted_grade,
         actual_outcome = EXCLUDED.actual_outcome,
         feedback_source = EXCLUDED.feedback_source,
         recorded_at = NOW()`,
      [id, predictedPwin, predictedGrade, outcome],
    );

    return reply.status(200).send(
      successEnvelope({
        opportunity_id: id,
        predicted_pwin: predictedPwin,
        predicted_grade: predictedGrade,
        actual_outcome: outcome,
      }, req.requestId),
    );
  });
}
