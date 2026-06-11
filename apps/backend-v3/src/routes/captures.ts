import type { FastifyInstance } from 'fastify';
import { config } from '../config/index.js';
import { pool } from '../lib/db.js';
import { requireBoss, QUEUE_NAMES, type AnalysisJobData } from '../lib/queue.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { analysisCacheHits, analysisTimeoutCount } from '../lib/metrics.js';
import { logger } from '../lib/logger.js';
import {
  type ColorReviewStage,
  COLOR_REVIEW_STAGES,
  isValidStage,
  validateStageTransition,
} from '../services/captures/color-review.js';

interface CaptureRow {
  id: string;
  pipeline_item_id: string;
  color_stage: ColorReviewStage;
  capture_plan: Record<string, unknown>;
  pricing_notes: string | null;
  compliance_status: string;
  win_themes: string[] | null;
  ghost_team: Record<string, unknown> | null;
  source_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface PipelineItemRow {
  id: string;
  opportunity_id: string;
  capture_owner: string;
  capture_kickoff_at: string | null;
  source_id: string;
}

interface OpportunityMinimal {
  title: string;
  agency: string | null;
}

interface CacheRow {
  pwin: number | null;
  version: string;
  generated_at: string;
}

interface ComplianceItemRow {
  id: string;
  requirement: string;
  section_ref: string | null;
  status: string;
  response_notes: string | null;
  assigned_to: string | null;
  source_id: string;
}

const ANALYSIS_AFFECTING_FIELDS = new Set([
  'color_stage',
  'compliance_status',
  'capture_plan',
  'ghost_team',
]);

const NON_ANALYSIS_FIELDS = new Set([
  'pricing_notes',
  'win_themes',
]);

function isCacheFresh(cache: CacheRow | null, captureUpdatedAt: string): boolean {
  if (!cache || cache.pwin === null) return false;
  if (cache.version !== config.analysisVersion) return false;
  return new Date(cache.generated_at) >= new Date(captureUpdatedAt);
}

async function waitForAnalysis(
  captureId: string,
  captureUpdatedAt: string,
  timeoutMs: number,
  pollMs: number
): Promise<CacheRow | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await pool.query<CacheRow>(
      'SELECT pwin, version, generated_at FROM capture_analysis_cache WHERE capture_id = $1 AND version = $2',
      [captureId, config.analysisVersion]
    );
    const row = res.rows[0];
    if (row && isCacheFresh(row, captureUpdatedAt)) return row;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return null;
}

function buildDetailResponse(
  row: CaptureRow,
  opp: OpportunityMinimal | null,
  captureOwner: string | null,
  complianceItems: ComplianceItemRow[],
  cache: CacheRow | null,
): Record<string, unknown> {
  return {
    id: row.id,
    pipeline_item_id: row.pipeline_item_id,
    pipeline_capture_owner: captureOwner,
    opportunity_title: opp?.title ?? null,
    opportunity_title_sources: [],
    opportunity_agency: opp?.agency ?? null,
    opportunity_agency_sources: [],
    color_stage: row.color_stage,
    capture_plan: row.capture_plan,
    pricing_notes: row.pricing_notes,
    compliance_status: row.compliance_status,
    win_themes: row.win_themes ?? [],
    ghost_team: row.ghost_team,
    compliance_items: complianceItems,
    pwin: cache?.pwin ?? null,
    pwin_sources: cache?.pwin !== null && cache?.pwin !== undefined
      ? [{ kind: 'internal', title: 'Envision Capture Analysis', url: `/v3/captures/${row.id}`, retrieved_at: cache.generated_at }]
      : [],
    source_url: `/v3/captures/${row.id}`,
    ai_analyzed_at: cache?.generated_at ?? null,
    analysis_version: cache?.version ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function enqueueCaptureAnalysis(captureId: string, trigger: AnalysisJobData['trigger']): Promise<void> {
  try {
    const boss = requireBoss();
    const jobData: AnalysisJobData = {
      entityType: 'capture',
      entityId: captureId,
      priority: trigger === 'detail-endpoint' ? 'high' : 'normal',
      trigger,
    };
    await boss.send(QUEUE_NAMES.ANALYSIS_CAPTURE, jobData, {
      priority: trigger === 'detail-endpoint' ? 1 : 5,
      retryLimit: 3,
      retryDelay: 5,
      retryBackoff: true,
      singletonKey: `cap-${captureId}`,
    });
  } catch (err) {
    logger.warn({ err, captureId }, 'Failed to enqueue capture analysis');
  }
}

export async function captureRoutes(app: FastifyInstance): Promise<void> {
  // GET /v3/captures — list with filters + pagination
  app.get<{
    Querystring: {
      limit?: string;
      cursor?: string;
      color_stage?: string;
      capture_owner?: string;
      opportunity_agency?: string;
      behind?: string;
    };
  }>('/v3/captures', async (req, reply) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '50', 10) || 50, 1), 200);
    const cursor = req.query.cursor ?? null;
    const stage = req.query.color_stage;
    const captureOwner = req.query.capture_owner;
    const agency = req.query.opportunity_agency;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (stage) {
      conditions.push(`c.color_stage = $${paramIdx++}`);
      params.push(stage);
    }

    if (captureOwner) {
      conditions.push(`pi.capture_owner ILIKE $${paramIdx++}`);
      params.push(`%${captureOwner}%`);
    }

    if (agency) {
      conditions.push(`o.agency ILIKE $${paramIdx++}`);
      params.push(`%${agency}%`);
    }

    if (cursor) {
      conditions.push(`c.id < $${paramIdx++}`);
      params.push(cursor);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(config.analysisVersion);
    const versionParam = `$${paramIdx++}`;

    params.push(limit + 1);
    const limitParam = `$${paramIdx}`;

    const sql = `
      SELECT
        c.id, c.pipeline_item_id, c.color_stage,
        c.created_at, c.updated_at,
        pi.capture_owner AS pipeline_capture_owner,
        o.title AS opportunity_title,
        o.agency AS opportunity_agency,
        cac.pwin AS cached_pwin,
        cac.generated_at AS ai_analyzed_at,
        cac.version AS analysis_version
      FROM captures c
      LEFT JOIN pipeline_items pi ON pi.id = c.pipeline_item_id
      LEFT JOIN opportunities o ON o.id = pi.opportunity_id AND o.deleted_at IS NULL
      LEFT JOIN capture_analysis_cache cac
        ON cac.capture_id = c.id AND cac.version = ${versionParam}
      ${whereClause}
      ORDER BY c.id DESC
      LIMIT ${limitParam}
    `;

    const res = await pool.query(sql, params);
    const rows = res.rows as Array<Record<string, unknown>>;
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? String(items[items.length - 1]!.id) : null;

    return reply.status(200).send(
      successEnvelope(
        {
          items: items.map((r) => ({
            id: r.id,
            pipeline_item_id: r.pipeline_item_id,
            pipeline_capture_owner: r.pipeline_capture_owner ?? null,
            opportunity_title: r.opportunity_title ?? null,
            opportunity_title_sources: [],
            opportunity_agency: r.opportunity_agency ?? null,
            opportunity_agency_sources: [],
            color_stage: r.color_stage,
            pwin: r.cached_pwin ?? null,
            pwin_sources: r.cached_pwin != null
              ? [{ kind: 'internal', title: 'Envision Capture Analysis', url: `/v3/captures/${r.id as string}`, retrieved_at: r.ai_analyzed_at as string }]
              : [],
            source_url: `/v3/captures/${r.id as string}`,
            ai_analyzed_at: r.ai_analyzed_at ?? null,
            analysis_version: r.analysis_version ?? null,
            created_at: r.created_at,
            updated_at: r.updated_at,
          })),
          pagination: { limit, cursor: nextCursor, hasMore },
        },
        req.requestId
      )
    );
  });

  // GET /v3/captures/:id — detail with R2 analysis (10s sync block)
  app.get<{ Params: { id: string } }>('/v3/captures/:id', async (req, reply) => {
    const { id } = req.params;

    const res = await pool.query<CaptureRow>(
      'SELECT * FROM captures WHERE id = $1',
      [id]
    );

    const row = res.rows[0];
    if (!row) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Resource not found', req.requestId)
      );
    }

    const piRes = await pool.query<PipelineItemRow>(
      'SELECT id, opportunity_id, capture_owner, capture_kickoff_at, source_id FROM pipeline_items WHERE id = $1',
      [row.pipeline_item_id]
    );
    const pi = piRes.rows[0] ?? null;

    let opp: OpportunityMinimal | null = null;
    if (pi?.opportunity_id) {
      const oppRes = await pool.query<OpportunityMinimal>(
        'SELECT title, agency FROM opportunities WHERE id = $1 AND deleted_at IS NULL',
        [pi.opportunity_id]
      );
      opp = oppRes.rows[0] ?? null;
    }

    const compItemsRes = await pool.query<ComplianceItemRow>(
      'SELECT id, requirement, section_ref, status, response_notes, assigned_to, source_id FROM compliance_items WHERE capture_id = $1 ORDER BY id',
      [id]
    );
    const complianceItems = compItemsRes.rows;

    const cacheRes = await pool.query<CacheRow>(
      'SELECT pwin, version, generated_at FROM capture_analysis_cache WHERE capture_id = $1 AND version = $2',
      [id, config.analysisVersion]
    );
    const cache = cacheRes.rows[0] ?? null;

    if (isCacheFresh(cache, row.updated_at)) {
      analysisCacheHits.inc();
      return reply.status(200).send(
        successEnvelope(buildDetailResponse(row, opp, pi?.capture_owner ?? null, complianceItems, cache), req.requestId)
      );
    }

    await enqueueCaptureAnalysis(id, 'detail-endpoint');

    const fresh = await waitForAnalysis(id, row.updated_at, config.analysisTimeoutMs, config.analysisPollIntervalMs);
    if (fresh) {
      analysisCacheHits.inc();
      return reply.status(200).send(
        successEnvelope(buildDetailResponse(row, opp, pi?.capture_owner ?? null, complianceItems, fresh), req.requestId)
      );
    }

    analysisTimeoutCount.inc();
    return reply.status(503).send(
      errorEnvelope(
        'ANALYSIS_TIMEOUT',
        'Analysis not ready, retry in a few seconds',
        req.requestId,
        'estimated_seconds=8'
      )
    );
  });

  // POST /v3/captures — create from a pipeline item
  app.post<{
    Body: { pipeline_item_id: string };
  }>('/v3/captures', async (req, reply) => {
    const body = req.body as Record<string, unknown> | undefined;
    const pipelineItemId = body?.pipeline_item_id;

    if (!pipelineItemId || typeof pipelineItemId !== 'string') {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'pipeline_item_id is required', req.requestId)
      );
    }

    const piRes = await pool.query<PipelineItemRow>(
      'SELECT id, opportunity_id, capture_owner, capture_kickoff_at, source_id FROM pipeline_items WHERE id = $1',
      [pipelineItemId]
    );
    const pi = piRes.rows[0];
    if (!pi) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Pipeline item not found', req.requestId)
      );
    }

    const now = new Date().toISOString();

    const insertRes = await pool.query<{ id: string }>(
      `INSERT INTO captures (
        pipeline_item_id, color_stage, source_id, created_by,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id`,
      [
        pipelineItemId,
        'pink',
        pi.source_id,
        null,
        now,
        now,
      ]
    );

    const captureId = insertRes.rows[0]!.id;

    if (!pi.capture_kickoff_at) {
      await pool.query(
        'UPDATE pipeline_items SET capture_kickoff_at = $1 WHERE id = $2',
        [now, pipelineItemId]
      );
    }

    await enqueueCaptureAnalysis(String(captureId), 'pre-warm');

    return reply.status(201).send(
      successEnvelope(
        {
          id: String(captureId),
          pipeline_item_id: pipelineItemId,
          color_stage: 'pink',
          created_at: now,
          updated_at: now,
        },
        req.requestId
      )
    );
  });

  // PATCH /v3/captures/:id — update
  app.patch<{
    Params: { id: string };
    Body: {
      color_stage?: string;
      capture_plan?: Record<string, unknown>;
      pricing_notes?: string;
      compliance_status?: string;
      win_themes?: string[];
      ghost_team?: Record<string, unknown>;
      force?: boolean;
    };
  }>('/v3/captures/:id', async (req, reply) => {
    const { id } = req.params;
    const body = req.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== 'object') {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Request body is required', req.requestId)
      );
    }

    const existingRes = await pool.query<CaptureRow>(
      'SELECT * FROM captures WHERE id = $1',
      [id]
    );
    const existing = existingRes.rows[0];
    if (!existing) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Resource not found', req.requestId)
      );
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;
    let shouldEnqueue = false;
    const now = new Date().toISOString();

    // Color stage
    if (body.color_stage !== undefined) {
      const nextStage = body.color_stage as string;
      if (!isValidStage(nextStage)) {
        return reply.status(400).send(
          errorEnvelope(
            'VALIDATION_ERROR',
            `Invalid color_stage '${nextStage}'. Valid stages: ${COLOR_REVIEW_STAGES.join(', ')}`,
            req.requestId
          )
        );
      }

      const transition = validateStageTransition(
        existing.color_stage,
        nextStage,
        body.force === true
      );

      if (!transition.allowed) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', transition.reason!, req.requestId)
        );
      }

      updates.push(`color_stage = $${paramIdx++}`);
      params.push(nextStage);
      shouldEnqueue = true;
    }

    // Capture plan (jsonb)
    if (body.capture_plan !== undefined) {
      updates.push(`capture_plan = $${paramIdx++}`);
      params.push(JSON.stringify(body.capture_plan));
      shouldEnqueue = true;
    }

    // Pricing notes (text)
    if (body.pricing_notes !== undefined) {
      updates.push(`pricing_notes = $${paramIdx++}`);
      params.push(body.pricing_notes);
    }

    // Compliance status
    if (body.compliance_status !== undefined) {
      const validStatuses = ['incomplete', 'partial', 'complete'];
      if (!validStatuses.includes(body.compliance_status as string)) {
        return reply.status(400).send(
          errorEnvelope(
            'VALIDATION_ERROR',
            `Invalid compliance_status '${body.compliance_status}'. Valid: ${validStatuses.join(', ')}`,
            req.requestId
          )
        );
      }
      updates.push(`compliance_status = $${paramIdx++}`);
      params.push(body.compliance_status);
      shouldEnqueue = true;
    }

    // Win themes (text[])
    if (body.win_themes !== undefined) {
      if (!Array.isArray(body.win_themes)) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', 'win_themes must be an array', req.requestId)
        );
      }
      updates.push(`win_themes = $${paramIdx++}`);
      params.push(body.win_themes);
    }

    // Ghost team (jsonb)
    if (body.ghost_team !== undefined) {
      updates.push(`ghost_team = $${paramIdx++}`);
      params.push(JSON.stringify(body.ghost_team));
      shouldEnqueue = true;
    }

    if (updates.length === 0) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'No valid fields to update', req.requestId)
      );
    }

    // Check if only non-analysis fields were updated
    const bodyKeys = Object.keys(body).filter((k) => k !== 'force');
    const onlyNonAnalysis = bodyKeys.every((k) => NON_ANALYSIS_FIELDS.has(k));
    if (onlyNonAnalysis) {
      shouldEnqueue = false;
    }

    updates.push(`updated_at = $${paramIdx++}`);
    params.push(now);

    params.push(id);
    const idParam = `$${paramIdx}`;

    const updateSql = `UPDATE captures SET ${updates.join(', ')} WHERE id = ${idParam} RETURNING *`;
    const updateRes = await pool.query<CaptureRow>(updateSql, params);
    const updated = updateRes.rows[0]!;

    if (shouldEnqueue) {
      await enqueueCaptureAnalysis(String(id), 'pre-warm');
    }

    const responseData: Record<string, unknown> = {
      id: updated.id,
      pipeline_item_id: updated.pipeline_item_id,
      color_stage: updated.color_stage,
      capture_plan: updated.capture_plan,
      pricing_notes: updated.pricing_notes,
      compliance_status: updated.compliance_status,
      win_themes: updated.win_themes ?? [],
      ghost_team: updated.ghost_team,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
    };

    return reply.status(200).send(
      successEnvelope(responseData, req.requestId)
    );
  });

  // POST /v3/captures/:id/generate-plan — trigger capture_plan LLM task
  app.post<{ Params: { id: string } }>('/v3/captures/:id/generate-plan', async (req, reply) => {
    const { id } = req.params;

    // Load capture + linked opportunity
    const captureRes = await pool.query<CaptureRow & { opportunity_id: string }>(
      `SELECT c.*, pi.opportunity_id
       FROM captures c
       JOIN pipeline_items pi ON pi.id = c.pipeline_item_id
       WHERE c.id = $1`,
      [id]
    );
    const capture = captureRes.rows[0];
    if (!capture) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Capture not found', req.requestId));
    }

    const oppRes = await pool.query<{ title: string; description: string | null; solicitation_number: string | null; naics_codes: string[] | null; set_aside: string | null; place_of_performance: string | null; incumbent: string | null }>(
      `SELECT title, description, solicitation_number, naics, ARRAY[naics] AS naics_codes, set_aside, place_of_performance, incumbent FROM opportunities WHERE id = $1`,
      [capture.opportunity_id]
    );
    const opp = oppRes.rows[0];
    if (!opp) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Opportunity not found', req.requestId));
    }

    // Check analysis cache for existing LLM analysis
    const cacheRes = await pool.query<{ pwin: number | null; version: string; generated_at: string }>(
      `SELECT pwin, version, generated_at FROM capture_analysis_cache WHERE capture_id = $1 ORDER BY generated_at DESC LIMIT 1`,
      [id]
    );
    const cached = cacheRes.rows[0];
    const analysisSummary = cached?.pwin != null
      ? `Capture pwin estimate: ${cached.pwin}%`
      : 'No prior capture analysis available';

    const { llmRouter } = await import('../lib/llm-router.js');
    const result = await llmRouter.route({
      task: 'capture_plan',
      input: {
        opportunity_id: String(capture.opportunity_id),
        title: opp.title,
        description: opp.description ?? '',
        solicitation_number: opp.solicitation_number,
        analysis_summary: analysisSummary,
        incumbent_info: opp.incumbent,
        competitor_landscape: null,
        envision_capabilities: [
          'DoD program support', 'systems engineering', 'logistics', 'technical services'
        ],
        teaming_partners: (capture.capture_plan?.teaming_partners as string[] | undefined) ?? [],
        sources: [],
      },
      opts: { disable_router_retry: true },
    });

    if (!result.ok) {
      return reply.status(502).send(
        errorEnvelope('INTERNAL_ERROR', result.error_message ?? 'LLM router failed', req.requestId)
      );
    }

    // Persist the generated plan into capture_plan JSONB
    await pool.query(
      `UPDATE captures SET capture_plan = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(result.output), id]
    );

    await enqueueCaptureAnalysis(String(id), 'pre-warm');

    return reply.status(200).send(successEnvelope({
      ok: true,
      capture_plan: result.output,
      model_used: result.model_used,
      latency_ms: result.latency_ms,
      trace_id: result.trace_id,
    }, req.requestId));
  });
}
