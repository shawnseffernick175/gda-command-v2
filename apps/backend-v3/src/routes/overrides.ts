/**
 * Override capture routes — records user overrides of system pipeline stages
 * for the learning-loop dataset (Path A).
 *
 * Note: the grade override endpoint was removed when the A/B/C/D/F letter
 * grade system was eliminated in favour of continuous Pwin (issue #847).
 *
 * Endpoints:
 *   POST /v3/opportunities/:id/override-stage  — record a pipeline stage override
 *   GET  /v3/overrides/summary                 — aggregated dashboard data
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { CANONICAL_STAGE_KEYS, normalizePipelineStage, isTerminalStage } from '../lib/pipeline-stage.js';
import { logger } from '../lib/logger.js';
import { recordAuditLog } from '../services/audit/audit-log.js';

export async function overrideRoutes(app: FastifyInstance): Promise<void> {
  // POST /v3/opportunities/:id/override-stage
  app.post<{ Params: { id: string } }>(
    '/v3/opportunities/:id/override-stage',
    async (req, reply) => {
      const { id } = req.params;
      const body = req.body as Record<string, unknown> | undefined;

      const rawStage = body?.new_stage as string | undefined;
      const reason = body?.reason as string | undefined;

      if (!rawStage) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', `new_stage is required. Valid: ${CANONICAL_STAGE_KEYS.join(', ')}`, req.requestId),
        );
      }

      const newStage = normalizePipelineStage(rawStage);
      if (!newStage) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', `Invalid new_stage. Must be one of: ${CANONICAL_STAGE_KEYS.join(', ')}`, req.requestId),
        );
      }

      if (reason !== undefined && reason !== null && reason.length > 500) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', 'Reason must be 500 characters or fewer', req.requestId),
        );
      }

      // Verify opportunity exists
      const oppRes = await pool.query<{ id: number; source_id: string | null }>(
        `SELECT id, source_id FROM opportunities WHERE id = $1 AND deleted_at IS NULL`,
        [id],
      );
      if (oppRes.rows.length === 0) {
        return reply.status(404).send(
          errorEnvelope('NOT_FOUND', 'Opportunity not found', req.requestId),
        );
      }

      const opp = oppRes.rows[0];

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Look up existing pipeline_items row
        const pipelineRes = await client.query<{ id: number; stage: string }>(
          `SELECT id, stage FROM pipeline_items WHERE opportunity_id = $1 ORDER BY id DESC LIMIT 1`,
          [id],
        );
        const pipelineRow = pipelineRes.rows[0] ?? null;
        const currentStage = pipelineRow?.stage ?? null;

        // No-op check
        if (newStage === currentStage) {
          await client.query('ROLLBACK');
          return reply.status(200).send(successEnvelope({ noop: true }, req.requestId));
        }

        // Insert override record
        const insertRes = await client.query<{ id: string }>(
          `INSERT INTO opportunity_decision_overrides
           (opportunity_id, field_name, ai_value, ai_confidence, ai_evidence, ai_model_version, ai_generated_at, human_value, reason)
           VALUES ($1, 'pipeline_stage', $2, NULL, NULL, NULL, NULL, $3, $4)
           RETURNING id`,
          [id, currentStage, newStage, reason ?? null],
        );

        // Upsert pipeline_items
        let pipelineItemId: number | null = pipelineRow?.id ?? null;
        if (pipelineRow) {
          await client.query(
            `UPDATE pipeline_items SET stage = $1, updated_at = NOW() WHERE id = $2`,
            [newStage, pipelineRow.id],
          );
        } else {
          const newPi = await client.query<{ id: number }>(
            `INSERT INTO pipeline_items (opportunity_id, capture_owner, stage, source_id)
             VALUES ($1, 'admin', $2, $3) RETURNING id`,
            [id, newStage, opp.source_id],
          );
          pipelineItemId = newPi.rows[0]?.id ?? null;
        }

        // Log stage transition to capture_stage_history
        try {
          await client.query('SAVEPOINT csh_insert');
          await client.query(
            `INSERT INTO capture_stage_history
             (pipeline_item_id, opportunity_id, from_stage, to_stage, moved_by_user, reason)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [pipelineItemId, id, currentStage, newStage, 'user', reason ?? null],
          );
        } catch {
          await client.query('ROLLBACK TO SAVEPOINT csh_insert');
        }

        // F-600: audit trail for pipeline stage change (user-initiated)
        try {
          await client.query('SAVEPOINT audit_insert');
          await recordAuditLog(client, {
            action: pipelineRow ? 'UPDATE' : 'INSERT',
            table_name: 'pipeline_items',
            record_id: pipelineItemId,
            ...(pipelineRow ? { old_values: { stage: currentStage } } : {}),
            new_values: { stage: newStage, ...(pipelineRow ? {} : { opportunity_id: id }) },
            actor: 'user',
            source: 'user',
          });
        } catch {
          await client.query('ROLLBACK TO SAVEPOINT audit_insert');
        }

        await client.query('COMMIT');

        return reply.status(200).send(
          successEnvelope({ success: true, override_id: insertRes.rows[0].id }, req.requestId),
        );
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error({ err, opportunityId: id }, 'Failed to record stage override');
        return reply.status(500).send(
          errorEnvelope('INTERNAL_ERROR', 'Failed to record stage override', req.requestId),
        );
      } finally {
        client.release();
      }
    },
  );

  // GET /v3/overrides/summary
  app.get('/v3/overrides/summary', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const range = query.range ?? '30d';

    let dateFilter = '';
    if (range === '7d') {
      dateFilter = `AND odo.created_at >= NOW() - INTERVAL '7 days'`;
    } else if (range === '30d') {
      dateFilter = `AND odo.created_at >= NOW() - INTERVAL '30 days'`;
    }
    // 'all' = no date filter

    try {
      // Totals
      const totalsRes = await pool.query<{
        stage_overrides: string;
        all_time: string;
        last_7d: string;
        last_30d: string;
      }>(`
        SELECT
          COUNT(*) FILTER (WHERE field_name = 'pipeline_stage')::int AS stage_overrides,
          COUNT(*)::int AS all_time,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS last_7d,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS last_30d
        FROM opportunity_decision_overrides
      `);
      const totals = totalsRes.rows[0];

      // Stage pivot
      const stagePivotRes = await pool.query<{
        ai_value: string;
        human_value: string;
        count: number;
      }>(`
        SELECT ai_value, human_value, COUNT(*)::int AS count
        FROM opportunity_decision_overrides
        WHERE field_name = 'pipeline_stage' AND ai_value IS NOT NULL ${dateFilter.replace('odo.', '')}
        GROUP BY ai_value, human_value
        ORDER BY count DESC
      `);

      // Agreement rates
      const agreementRes = await pool.query<{
        stage_pct: string;
      }>(`
        WITH stage_totals AS (
          SELECT COUNT(DISTINCT odo.opportunity_id) AS overridden
          FROM opportunity_decision_overrides odo
          JOIN opportunities o ON o.id = odo.opportunity_id AND o.deleted_at IS NULL
          WHERE odo.field_name = 'pipeline_stage'
        ),
        pipeline_opps AS (
          SELECT COUNT(DISTINCT pi.opportunity_id) AS total
          FROM pipeline_items pi
          JOIN opportunities o ON o.id = pi.opportunity_id AND o.deleted_at IS NULL
        )
        SELECT
          CASE WHEN po.total = 0 THEN 100
               ELSE ROUND(((po.total - st.overridden)::numeric / po.total) * 100, 1)
          END AS stage_pct
        FROM stage_totals st, pipeline_opps po
      `);
      const agreement = agreementRes.rows[0];


      // Recent overrides (25 most recent)
      const recentRes = await pool.query<{
        id: string;
        opportunity_id: string;
        opportunity_title: string;
        field_name: string;
        ai_value: string | null;
        human_value: string;
        reason: string | null;
        created_at: string;
      }>(`
        SELECT odo.id, odo.opportunity_id, o.title AS opportunity_title,
               odo.field_name, odo.ai_value, odo.human_value, odo.reason, odo.created_at
        FROM opportunity_decision_overrides odo
        JOIN opportunities o ON o.id = odo.opportunity_id
        ${dateFilter ? `WHERE 1=1 ${dateFilter}` : ''}
        ORDER BY odo.created_at DESC
        LIMIT 25
      `);

      return reply.status(200).send(
        successEnvelope(
          {
            totals: {
              stage_overrides: Number(totals.stage_overrides),
              all_time: Number(totals.all_time),
              last_7d: Number(totals.last_7d),
              last_30d: Number(totals.last_30d),
            },
            stage_pivot: stagePivotRes.rows,
            agreement_rate: {
              stage_pct: Number(agreement.stage_pct),
              notes: "Agreement = (total with pipeline stage) - (distinct with stage override) / (total with pipeline stage).",
            },
            recent: recentRes.rows,
          },
          req.requestId,
        ),
      );
    } catch (err) {
      logger.error({ err }, 'Failed to fetch overrides summary');
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', 'Failed to fetch overrides summary', req.requestId),
      );
    }
  });
}
