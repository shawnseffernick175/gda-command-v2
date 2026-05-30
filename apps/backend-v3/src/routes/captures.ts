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
import {
  evaluatePricingGuardrails,
  type PricingAssumptions,
  type PricingGuardrailResult,
} from '../services/captures/pricing-guardrails.js';
import {
  computeComplianceSummary,
  isValidComplianceStatus,
  type ComplianceItem,
} from '../services/captures/compliance.js';
import { validateTeamingWorksheet, type TeamingWorksheet } from '../services/captures/teaming.js';

interface CaptureRow {
  id: string;
  pipeline_item_id: string;
  opportunity_id: string | null;
  color_review_stage: ColorReviewStage;
  color_review_notes: string | null;
  color_review_audit: Array<{ stage: string; actor: string; timestamp: string }>;
  compliance_items: ComplianceItem[];
  compliance_items_sources: Array<Record<string, unknown>>;
  pricing_assumptions: PricingAssumptions | null;
  pricing_assumptions_sources: Array<Record<string, unknown>>;
  teaming_worksheet: TeamingWorksheet | null;
  teaming_worksheet_sources: Array<Record<string, unknown>>;
  analysis: Record<string, unknown> | null;
  analysis_version: string | null;
  ai_analyzed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PipelineItemRow {
  id: string;
  opportunity_id: string;
  capture_owner: string;
  capture_kickoff_at: string | null;
}

interface OpportunityMinimal {
  title: string;
  agency: string | null;
}

const ANALYSIS_AFFECTING_FIELDS = new Set([
  'pricing_assumptions',
  'compliance_items',
  'teaming_worksheet',
  'color_review_stage',
]);

const NON_ANALYSIS_FIELDS = new Set([
  'color_review_notes',
]);

function isCacheFresh(row: CaptureRow): boolean {
  if (!row.analysis || !row.analysis_version || !row.ai_analyzed_at) return false;
  if (row.analysis_version !== config.analysisVersion) return false;
  return new Date(row.ai_analyzed_at) >= new Date(row.updated_at);
}

async function waitForAnalysis(
  captureId: string,
  timeoutMs: number,
  pollMs: number
): Promise<CaptureRow | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await pool.query<CaptureRow>(
      'SELECT * FROM captures WHERE id = $1',
      [captureId]
    );
    const row = res.rows[0];
    if (row && isCacheFresh(row)) return row;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return null;
}

function computePricingGuardrailBlock(
  assumptions: PricingAssumptions | null
): PricingGuardrailResult | null {
  if (!assumptions) return null;
  if (
    assumptions.margin_pct === undefined &&
    (!assumptions.labor_rates || Object.keys(assumptions.labor_rates).length === 0)
  ) {
    return null;
  }
  return evaluatePricingGuardrails(assumptions);
}

function buildDetailResponse(
  row: CaptureRow,
  opp: OpportunityMinimal | null,
  captureOwner: string | null
): Record<string, unknown> {
  const complianceItems = Array.isArray(row.compliance_items) ? row.compliance_items : [];
  return {
    id: row.id,
    pipeline_item_id: row.pipeline_item_id,
    pipeline_capture_owner: captureOwner,
    opportunity_title: opp?.title ?? null,
    opportunity_title_sources: [],
    opportunity_agency: opp?.agency ?? null,
    opportunity_agency_sources: [],
    color_review_stage: row.color_review_stage,
    color_review_notes: row.color_review_notes,
    compliance_items: complianceItems,
    compliance_items_sources: Array.isArray(row.compliance_items_sources) ? row.compliance_items_sources : [],
    compliance_summary: computeComplianceSummary(complianceItems),
    pricing_assumptions: row.pricing_assumptions,
    pricing_assumptions_sources: Array.isArray(row.pricing_assumptions_sources) ? row.pricing_assumptions_sources : [],
    pricing_guardrail: computePricingGuardrailBlock(row.pricing_assumptions),
    teaming_worksheet: row.teaming_worksheet,
    teaming_worksheet_sources: Array.isArray(row.teaming_worksheet_sources) ? row.teaming_worksheet_sources : [],
    analysis: row.analysis,
    ai_analyzed_at: row.ai_analyzed_at,
    analysis_version: row.analysis_version,
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
      color_review_stage?: string;
      capture_owner?: string;
      opportunity_agency?: string;
      behind?: string;
    };
  }>('/v3/captures', async (req, reply) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '50', 10) || 50, 1), 200);
    const cursor = req.query.cursor ?? null;
    const stage = req.query.color_review_stage;
    const captureOwner = req.query.capture_owner;
    const agency = req.query.opportunity_agency;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (stage) {
      conditions.push(`c.color_review_stage = $${paramIdx++}`);
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

    params.push(limit + 1);
    const limitParam = `$${paramIdx}`;

    const sql = `
      SELECT
        c.id, c.pipeline_item_id, c.color_review_stage,
        c.ai_analyzed_at, c.analysis_version,
        c.created_at, c.updated_at,
        pi.capture_owner AS pipeline_capture_owner,
        o.title AS opportunity_title,
        o.agency AS opportunity_agency
      FROM captures c
      LEFT JOIN pipeline_items pi ON pi.id = c.pipeline_item_id
      LEFT JOIN opportunities o ON o.id = pi.opportunity_id AND o.deleted_at IS NULL
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
            color_review_stage: r.color_review_stage,
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
      'SELECT id, opportunity_id, capture_owner, capture_kickoff_at FROM pipeline_items WHERE id = $1',
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

    if (isCacheFresh(row)) {
      analysisCacheHits.inc();
      return reply.status(200).send(
        successEnvelope(buildDetailResponse(row, opp, pi?.capture_owner ?? null), req.requestId)
      );
    }

    await enqueueCaptureAnalysis(id, 'detail-endpoint');

    const fresh = await waitForAnalysis(id, config.analysisTimeoutMs, config.analysisPollIntervalMs);
    if (fresh) {
      analysisCacheHits.inc();
      return reply.status(200).send(
        successEnvelope(buildDetailResponse(fresh, opp, pi?.capture_owner ?? null), req.requestId)
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
      'SELECT id, opportunity_id, capture_owner, capture_kickoff_at FROM pipeline_items WHERE id = $1',
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
        pipeline_item_id, opportunity_id, color_review_stage,
        color_review_notes, color_review_audit,
        compliance_items, compliance_items_sources,
        pricing_assumptions, pricing_assumptions_sources,
        teaming_worksheet, teaming_worksheet_sources,
        analysis, analysis_version, ai_analyzed_at,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id`,
      [
        pipelineItemId,
        pi.opportunity_id,
        'white',
        null,
        JSON.stringify([{ stage: 'white', actor: 'system', timestamp: now }]),
        JSON.stringify([]),
        JSON.stringify([]),
        null,
        JSON.stringify([]),
        null,
        JSON.stringify([]),
        null,
        null,
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

    const newRow = await pool.query<CaptureRow>(
      'SELECT * FROM captures WHERE id = $1',
      [captureId]
    );

    return reply.status(201).send(
      successEnvelope(
        {
          id: String(captureId),
          pipeline_item_id: pipelineItemId,
          color_review_stage: 'white',
          created_at: newRow.rows[0]?.created_at ?? now,
          updated_at: newRow.rows[0]?.updated_at ?? now,
        },
        req.requestId
      )
    );
  });

  // PATCH /v3/captures/:id — update
  app.patch<{
    Params: { id: string };
    Body: {
      color_review_stage?: string;
      color_review_notes?: string;
      compliance_items?: ComplianceItem[];
      pricing_assumptions?: PricingAssumptions;
      teaming_worksheet?: TeamingWorksheet;
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
    let pricingGuardrail: PricingGuardrailResult | null = null;
    const now = new Date().toISOString();
    const actor = ((req as unknown as Record<string, unknown>).user as { sub?: string } | undefined)?.sub ?? 'unknown';

    // Color review stage
    if (body.color_review_stage !== undefined) {
      const nextStage = body.color_review_stage as string;
      if (!isValidStage(nextStage)) {
        return reply.status(400).send(
          errorEnvelope(
            'VALIDATION_ERROR',
            `Invalid color_review_stage '${nextStage}'. Valid stages: ${COLOR_REVIEW_STAGES.join(', ')}`,
            req.requestId
          )
        );
      }

      const transition = validateStageTransition(
        existing.color_review_stage,
        nextStage,
        body.force === true
      );

      if (!transition.allowed) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', transition.reason!, req.requestId)
        );
      }

      updates.push(`color_review_stage = $${paramIdx++}`);
      params.push(nextStage);

      const audit = Array.isArray(existing.color_review_audit) ? [...existing.color_review_audit] : [];
      audit.push({ stage: nextStage, actor, timestamp: now });
      updates.push(`color_review_audit = $${paramIdx++}`);
      params.push(JSON.stringify(audit));

      shouldEnqueue = true;
    }

    // Color review notes (stage-scoped — only mutable while in the current stage)
    if (body.color_review_notes !== undefined) {
      updates.push(`color_review_notes = $${paramIdx++}`);
      params.push(body.color_review_notes);
    }

    // Compliance items
    if (body.compliance_items !== undefined) {
      const items = body.compliance_items as ComplianceItem[];
      if (!Array.isArray(items)) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', 'compliance_items must be an array', req.requestId)
        );
      }
      for (const item of items) {
        if (item.status && !isValidComplianceStatus(item.status)) {
          return reply.status(400).send(
            errorEnvelope(
              'VALIDATION_ERROR',
              `Invalid compliance status '${item.status}'. Valid: compliant, partial, non_compliant`,
              req.requestId
            )
          );
        }
      }
      updates.push(`compliance_items = $${paramIdx++}`);
      params.push(JSON.stringify(items));
      shouldEnqueue = true;
    }

    // Pricing assumptions
    if (body.pricing_assumptions !== undefined) {
      const assumptions = body.pricing_assumptions as PricingAssumptions;

      if (assumptions.labor_rates && typeof assumptions.labor_rates === 'object') {
        const missingRates = Object.keys(assumptions.labor_rates).length === 0
          && assumptions.margin_pct !== undefined;
        if (!missingRates) {
          pricingGuardrail = evaluatePricingGuardrails(assumptions);
        }
      } else if (assumptions.margin_pct !== undefined) {
        pricingGuardrail = evaluatePricingGuardrails(assumptions);
      }

      updates.push(`pricing_assumptions = $${paramIdx++}`);
      params.push(JSON.stringify(assumptions));
      shouldEnqueue = true;
    }

    // Teaming worksheet
    if (body.teaming_worksheet !== undefined) {
      const worksheet = body.teaming_worksheet as TeamingWorksheet;
      if (worksheet.partners && Array.isArray(worksheet.partners)) {
        const validation = validateTeamingWorksheet(worksheet);
        if (!validation.valid) {
          return reply.status(400).send(
            errorEnvelope('VALIDATION_ERROR', validation.errors.join('; '), req.requestId)
          );
        }
      }
      updates.push(`teaming_worksheet = $${paramIdx++}`);
      params.push(JSON.stringify(worksheet));
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

    const complianceItems = Array.isArray(updated.compliance_items) ? updated.compliance_items : [];

    const responseData: Record<string, unknown> = {
      id: updated.id,
      pipeline_item_id: updated.pipeline_item_id,
      color_review_stage: updated.color_review_stage,
      color_review_notes: updated.color_review_notes,
      compliance_items: complianceItems,
      compliance_summary: computeComplianceSummary(complianceItems),
      pricing_assumptions: updated.pricing_assumptions,
      teaming_worksheet: updated.teaming_worksheet,
      ai_analyzed_at: updated.ai_analyzed_at,
      analysis_version: updated.analysis_version,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
    };

    if (pricingGuardrail) {
      responseData.pricing_guardrail = pricingGuardrail;
    }

    return reply.status(200).send(
      successEnvelope(responseData, req.requestId)
    );
  });
}
