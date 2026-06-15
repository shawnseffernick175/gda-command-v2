import type { FastifyInstance } from 'fastify';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { pool } from '../lib/db.js';
import {
  listPipelineItems,
  createPipelineItem,
  updatePipelineItem,
} from '../services/pipeline/index.js';
import { pipelineStageToDisplay } from '../lib/pipeline-stage.js';
import type { JwtPayload } from '../middleware/auth.js';
import type { Milestone } from '../services/pipeline/types.js';

interface ListQuery {
  limit?: string;
  cursor?: string;
  capture_owner?: string;
  opportunity_agency?: string;
  opportunity_naics?: string;
  opportunity_set_aside?: string;
  due_after?: string;
  due_before?: string;
  stage?: string;
  q?: string;
}

interface CreateBody {
  opportunity_id: string;
  capture_owner: string;
  milestones?: Milestone[];
  win_prob_pct?: number;
  win_prob_evidence?: string;
  teaming_partners?: string[];
}

interface UpdateBody {
  capture_owner?: string;
  milestones?: Milestone[];
  win_prob_pct?: number;
  win_prob_evidence?: string;
  teaming_partners?: string[];
}

interface StageStats {
  count: number;
  value: number;
  weighted_value: number;
}

interface StageMover {
  internal_id: string;
  title: string;
  agency: string | null;
  value: number | null;
  from_stage: string | null;
  from_stage_label: string | null;
  to_stage: string;
  to_stage_label: string;
  moved_at: string;
  moved_by: string | null;
}

interface PipelineSummary {
  total_pipeline_value: number;
  weighted_pipeline_value: number;
  active_pursuits: number;
  proposals_out: number;
  won_ytd: number;
  by_stage: Record<string, StageStats>;
  stage_movers: StageMover[];
}

export async function pipelineRoutes(app: FastifyInstance): Promise<void> {

  // GET /v3/pipeline/summary — intelligence-bar aggregates + funnel + movers
  app.get('/v3/pipeline/summary', async (req, reply) => {
    // Stage counts + values (exclude terminal stages and $1 IDIQ placeholders)
    const stagesSql = `
      SELECT
        pi.stage,
        COUNT(DISTINCT pi.opportunity_id)::int AS count,
        COALESCE(SUM(
          CASE WHEN COALESCE(o.value_max, o.value_min, 0) <= 1 THEN 0
               ELSE COALESCE(o.value_max, o.value_min, 0)
          END
        ), 0)::bigint AS value,
        COALESCE(SUM(
          CASE WHEN COALESCE(o.value_max, o.value_min, 0) <= 1 THEN 0
               ELSE COALESCE(o.value_max, o.value_min, 0) *
                    COALESCE(
                      CASE
                        WHEN jsonb_typeof(o.analysis->'pwin') = 'object'
                          THEN (o.analysis->'pwin'->>'score')::numeric / 100.0
                        WHEN jsonb_typeof(o.analysis->'pwin') = 'number'
                          THEN (o.analysis->>'pwin')::numeric
                        ELSE 0
                      END, 0)
          END
        ), 0)::bigint AS weighted_value
      FROM pipeline_items pi
      INNER JOIN opportunities o ON o.id = pi.opportunity_id AND o.deleted_at IS NULL
      WHERE pi.stage NOT IN ('lost', 'no_bid', 'gov_cancelled')
      GROUP BY pi.stage
    `;
    const stagesRes = await pool.query<{
      stage: string;
      count: number;
      value: string;
      weighted_value: string;
    }>(stagesSql);

    const byStage: Record<string, StageStats> = {};
    let totalValue = 0;
    let weightedPipelineValue = 0;
    let activePursuits = 0;
    let proposalsOut = 0;

    for (const row of stagesRes.rows) {
      const label = pipelineStageToDisplay(row.stage);
      const val = Number(row.value);
      const wVal = Number(row.weighted_value);
      byStage[label] = { count: row.count, value: val, weighted_value: wVal };
      totalValue += val;
      weightedPipelineValue += wVal;
      if (['pursue', 'solicitation', 'post_submittal'].includes(row.stage)) {
        activePursuits += row.count;
      }
      if (row.stage === 'post_submittal') proposalsOut += row.count;
    }

    // Won YTD — awards in current fiscal year (Oct 1 → Sep 30)
    const wonYtdSql = `
      SELECT COALESCE(SUM(
        CASE WHEN COALESCE(o.value_max, o.value_min, 0) <= 1 THEN 0
             ELSE COALESCE(o.value_max, o.value_min, 0)
        END
      ), 0)::bigint AS won_ytd
      FROM pipeline_items pi
      INNER JOIN opportunities o ON o.id = pi.opportunity_id AND o.deleted_at IS NULL
      WHERE pi.stage = 'won'
        AND pi.updated_at >= CASE
          WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 10
            THEN date_trunc('year', CURRENT_DATE) + INTERVAL '9 months'
            ELSE date_trunc('year', CURRENT_DATE) - INTERVAL '3 months'
          END
    `;
    const wonYtdRes = await pool.query<{ won_ytd: string }>(wonYtdSql);
    const wonYtd = Number(wonYtdRes.rows[0]?.won_ytd ?? 0);

    // Stage movers — user-triggered stage transitions in last 7 days
    // Uses capture_stage_history if populated, falls back to pipeline_items.updated_at
    const moversSql = `
      SELECT
        o.id::text AS internal_id,
        o.title,
        o.agency,
        COALESCE(o.value_max, o.value_min)::bigint AS value,
        csh.from_stage,
        csh.to_stage,
        csh.moved_at,
        csh.moved_by_user
      FROM capture_stage_history csh
      INNER JOIN opportunities o ON o.id = csh.opportunity_id AND o.deleted_at IS NULL
      WHERE csh.moved_at > NOW() - INTERVAL '7 days'
        AND csh.moved_by_user IS NOT NULL
      ORDER BY csh.moved_at DESC
      LIMIT 10
    `;

    let stageMovers: StageMover[] = [];
    try {
      const moversRes = await pool.query<{
        internal_id: string;
        title: string;
        agency: string | null;
        value: string | null;
        from_stage: string | null;
        to_stage: string;
        moved_at: string;
        moved_by_user: string | null;
      }>(moversSql);

      stageMovers = moversRes.rows.map((r) => ({
        internal_id: r.internal_id,
        title: r.title,
        agency: r.agency,
        value: r.value != null ? Number(r.value) : null,
        from_stage: r.from_stage,
        from_stage_label: r.from_stage ? pipelineStageToDisplay(r.from_stage) : null,
        to_stage: r.to_stage,
        to_stage_label: pipelineStageToDisplay(r.to_stage),
        moved_at: r.moved_at,
        moved_by: r.moved_by_user,
      }));
    } catch {
      // capture_stage_history may not exist yet if migration hasn't run;
      // fall back to the old pipeline_items approach
      const fallbackSql = `
        SELECT DISTINCT ON (pi.opportunity_id)
          o.id::text AS internal_id,
          o.title,
          o.agency,
          COALESCE(o.value_max, o.value_min)::bigint AS value,
          pi.stage,
          pi.updated_at AS moved_at
        FROM pipeline_items pi
        INNER JOIN opportunities o ON o.id = pi.opportunity_id AND o.deleted_at IS NULL
        WHERE pi.updated_at > NOW() - INTERVAL '7 days'
          AND pi.stage IS NOT NULL
        ORDER BY pi.opportunity_id, pi.updated_at DESC
      `;
      const fallbackRes = await pool.query<{
        internal_id: string;
        title: string;
        agency: string | null;
        value: string | null;
        stage: string;
        moved_at: string;
      }>(fallbackSql);

      stageMovers = fallbackRes.rows
        .sort((a, b) => new Date(b.moved_at).getTime() - new Date(a.moved_at).getTime())
        .slice(0, 10)
        .map((r) => ({
          internal_id: r.internal_id,
          title: r.title,
          agency: r.agency,
          value: r.value != null ? Number(r.value) : null,
          from_stage: null,
          from_stage_label: null,
          to_stage: r.stage,
          to_stage_label: pipelineStageToDisplay(r.stage),
          moved_at: r.moved_at,
          moved_by: null,
        }));
    }

    const summary: PipelineSummary = {
      total_pipeline_value: totalValue,
      weighted_pipeline_value: weightedPipelineValue,
      active_pursuits: activePursuits,
      proposals_out: proposalsOut,
      won_ytd: wonYtd,
      by_stage: byStage,
      stage_movers: stageMovers,
    };

    return reply.status(200).send(successEnvelope(summary, req.requestId));
  });

  // GET /v3/pipeline — list pipeline-scoped items only (with stage + search filters)
  app.get<{ Querystring: ListQuery }>('/v3/pipeline', async (req, reply) => {
    const rawLimit = parseInt(req.query.limit ?? '50', 10);
    const limit = Number.isNaN(rawLimit) ? 50 : Math.min(Math.max(rawLimit, 1), 200);

    const result = await listPipelineItems({
      limit,
      cursor: req.query.cursor,
      capture_owner: req.query.capture_owner,
      opportunity_agency: req.query.opportunity_agency,
      opportunity_naics: req.query.opportunity_naics,
      opportunity_set_aside: req.query.opportunity_set_aside,
      due_after: req.query.due_after,
      due_before: req.query.due_before,
      stage: req.query.stage,
      q: req.query.q,
    });

    return reply.status(200).send(successEnvelope(result, req.requestId));
  });

  app.post<{ Body: CreateBody }>('/v3/pipeline', async (req, reply) => {
    const body = req.body as CreateBody | undefined;
    if (!body || !body.opportunity_id || !body.capture_owner) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'opportunity_id and capture_owner are required', req.requestId),
      );
    }

    if (body.win_prob_pct !== undefined && body.win_prob_pct !== null) {
      if (body.win_prob_pct < 0 || body.win_prob_pct > 100) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', 'win_prob_pct must be between 0 and 100', req.requestId),
        );
      }
      if (!body.win_prob_evidence) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', 'win_prob_evidence is required when win_prob_pct is provided', req.requestId),
        );
      }
    }

    const user = (req as typeof req & { user?: JwtPayload }).user;
    const userId = user?.sub ?? 'unknown';

    try {
      const { item, created } = await createPipelineItem(
        {
          opportunity_id: body.opportunity_id,
          capture_owner: body.capture_owner,
          milestones: body.milestones,
          win_prob_pct: body.win_prob_pct,
          win_prob_evidence: body.win_prob_evidence,
          teaming_partners: body.teaming_partners,
        },
        userId,
      );

      const status = created ? 201 : 409;
      return reply.status(status).send(successEnvelope(item, req.requestId));
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      if (e.statusCode === 404) {
        return reply.status(404).send(
          errorEnvelope('NOT_FOUND', e.message, req.requestId),
        );
      }
      if (e.statusCode === 400) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', e.message, req.requestId),
        );
      }
      throw err;
    }
  });

  app.patch<{ Params: { id: string }; Body: UpdateBody }>('/v3/pipeline/:id', async (req, reply) => {
    const { id } = req.params;
    const body = req.body as UpdateBody | undefined;

    if (!body || Object.keys(body).length === 0) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Request body must contain at least one field to update', req.requestId),
      );
    }

    if (body.win_prob_pct !== undefined && body.win_prob_pct !== null) {
      if (body.win_prob_pct < 0 || body.win_prob_pct > 100) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', 'win_prob_pct must be between 0 and 100', req.requestId),
        );
      }
      if (!body.win_prob_evidence) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', 'win_prob_evidence is required when win_prob_pct is provided', req.requestId),
        );
      }
    }

    const item = await updatePipelineItem(id, {
      capture_owner: body.capture_owner,
      milestones: body.milestones,
      win_prob_pct: body.win_prob_pct,
      win_prob_evidence: body.win_prob_evidence,
      teaming_partners: body.teaming_partners,
    });

    if (!item) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Pipeline item not found', req.requestId),
      );
    }

    return reply.status(200).send(successEnvelope(item, req.requestId));
  });
}
