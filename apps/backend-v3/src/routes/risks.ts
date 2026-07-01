/**
 * Risk routes — F-307: Risks as First-Class Objects.
 *
 * Endpoints:
 *   GET    /v3/risks                         — list all risks (filterable)
 *   GET    /v3/risks/launchpad               — top 5 critical/high open risks
 *   GET    /v3/risks/:id                     — single risk with events timeline
 *   POST   /v3/risks                         — create a risk
 *   PATCH  /v3/risks/:id                     — update a risk
 *   DELETE /v3/risks/:id                     — delete a risk
 *   GET    /v3/risks/:id/events              — event log for a risk
 *   POST   /v3/risks/:id/events              — add an event/note to a risk
 *   GET    /v3/opportunities/:id/risks       — risks for an opportunity
 *   POST   /v3/risks/generate/:opportunityId — AI risk generation (existing)
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { llmRouter } from '../lib/llm-router.js';
import type { RiskGenerationInput, RiskGenerationOutput } from '../lib/llm-router.types.js';
import { recordAuditLog } from '../services/audit/audit-log.js';
import {
  createRisk,
  getLaunchpadRisks,
  getRiskEvents,
  logRiskEvent,
  validateStatusTransition,
} from '../services/risks/index.js';
import type { CreateRiskInput, RiskEventType } from '../services/risks/index.js';

export async function risksRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /v3/risks — list with filters ───────────────────────
  app.get('/v3/risks', async (req, reply) => {
    const query = req.query as {
      status?: string;
      severity?: string;
      category?: string;
      owner?: string;
      opportunity_id?: string;
      related_capture_id?: string;
      source?: string;
    };
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (query.status) {
      const statuses = query.status.split('|');
      params.push(statuses);
      conditions.push(`r.status = ANY($${params.length})`);
    }
    if (query.severity) {
      const severities = query.severity.split('|');
      params.push(severities);
      conditions.push(`r.severity = ANY($${params.length})`);
    }
    if (query.category) {
      params.push(query.category);
      conditions.push(`r.category = $${params.length}`);
    }
    if (query.owner) {
      params.push(query.owner);
      conditions.push(`r.owner = $${params.length}`);
    }
    if (query.opportunity_id) {
      params.push(Number(query.opportunity_id));
      conditions.push(`r.opportunity_id = $${params.length}`);
    }
    if (query.related_capture_id) {
      params.push(Number(query.related_capture_id));
      conditions.push(`r.related_capture_id = $${params.length}`);
    }
    if (query.source) {
      params.push(query.source);
      conditions.push(`r.source = $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT r.*, o.title AS opportunity_title
       FROM risks r
       LEFT JOIN opportunities o ON o.id = r.opportunity_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY
         CASE r.severity
           WHEN 'critical' THEN 0 WHEN 'high' THEN 1
           WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4
         END,
         r.created_at DESC`,
      params,
    );

    return reply.send(successEnvelope({ items: rows, total: rows.length }, req.requestId));
  });

  // ── GET /v3/risks/launchpad — top 5 open critical/high ──────
  app.get('/v3/risks/launchpad', async (req, reply) => {
    const rows = await getLaunchpadRisks();
    return reply.send(successEnvelope({ items: rows, total: rows.length }, req.requestId));
  });

  // ── GET /v3/risks/:id — single risk + timeline ─────────────
  app.get('/v3/risks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rows } = await pool.query(
      `SELECT r.*, o.title AS opportunity_title
       FROM risks r
       LEFT JOIN opportunities o ON o.id = r.opportunity_id
       WHERE r.id = $1`,
      [Number(id)],
    );

    if (!rows.length) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Risk not found', req.requestId));
    }

    const events = await getRiskEvents(Number(id));
    return reply.send(successEnvelope({ ...rows[0], events }, req.requestId));
  });

  // ── POST /v3/risks — create ────────────────────────────────
  app.post('/v3/risks', async (req, reply) => {
    const body = req.body as Partial<CreateRiskInput> & { title?: string };

    if (!body.title?.trim()) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'title is required', req.requestId));
    }

    const input: CreateRiskInput = {
      title: body.title.trim(),
      description: body.description ?? body.title.trim(),
      category: body.category ?? 'other',
      severity: body.severity ?? 'medium',
      status: body.status ?? 'open',
      owner: body.owner ?? null,
      opportunity_id: body.opportunity_id ?? null,
      related_capture_id: body.related_capture_id ?? null,
      related_pipeline_item_id: body.related_pipeline_item_id ?? null,
      related_action_item_id: body.related_action_item_id ?? null,
      source: body.source ?? 'manual',
      source_event: body.source_event ?? { type: 'manual_entry' },
      mitigation_plan: body.mitigation_plan ?? body.mitigation ?? null,
      mitigation: body.mitigation ?? null,
      evidence_grade: body.evidence_grade ?? null,
      due_at: body.due_at ?? null,
      created_by: body.created_by ?? 'user',
      likelihood: body.likelihood ?? 3,
      impact: body.impact ?? 3,
      risk_type: body.risk_type ?? 'negative',
      if_condition: body.if_condition ?? null,
      then_impact: body.then_impact ?? null,
      exploitation_plan: body.exploitation_plan ?? null,
      due_date: body.due_date ?? null,
      next_step: body.next_step ?? null,
    };

    const result = await createRisk(input, body.source === 'manual');

    // Fetch the created/existing row
    const { rows } = await pool.query(
      'SELECT * FROM risks WHERE id = $1',
      [result.risk_id],
    );

    return reply.status(201).send(successEnvelope(
      { ...rows[0], deduplicated: result.deduplicated },
      req.requestId,
    ));
  });

  // ── PATCH /v3/risks/:id ────────────────────────────────────
  app.patch('/v3/risks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;

    // Fetch current state for validation
    const currentRes = await pool.query<{
      id: number; status: string; severity: string; owner: string | null;
    }>('SELECT id, status, severity, owner FROM risks WHERE id = $1', [Number(id)]);

    if (!currentRes.rows.length) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Risk not found', req.requestId));
    }

    const current = currentRes.rows[0];

    // Owner-required validation for critical/high risks
    if (body.status && body.status !== current.status) {
      const newOwner = (body.owner as string | null) ?? current.owner;
      const newSeverity = (body.severity as string) ?? current.severity;
      const err = validateStatusTransition(
        current.status,
        body.status as string,
        newSeverity,
        newOwner,
      );
      if (err) {
        return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', err, req.requestId));
      }
    }

    const allowed = [
      'title', 'description', 'category', 'severity', 'status', 'owner',
      'mitigation', 'mitigation_plan', 'evidence_grade', 'due_at',
      'risk_type', 'if_condition', 'then_impact', 'exploitation_plan',
      'due_date', 'next_step', 'likelihood', 'impact',
    ];
    const sets: string[] = [];
    const params: unknown[] = [];

    for (const key of allowed) {
      if (key in body) {
        params.push(body[key]);
        sets.push(`${key} = $${params.length}`);
      }
    }

    if (!sets.length) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'No valid fields to update', req.requestId));
    }

    // Set resolved_at when transitioning to resolved
    if (body.status === 'resolved' && current.status !== 'resolved') {
      sets.push('resolved_at = NOW()');
    }

    sets.push('updated_at = NOW()');
    params.push(Number(id));

    const { rows } = await pool.query(
      `UPDATE risks SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params,
    );

    // Log status change event
    if (body.status && body.status !== current.status) {
      logRiskEvent(Number(id), 'status_change', {
        from: current.status,
        to: body.status,
      }, 'user').catch(() => { /* best-effort */ });
    }

    // Log owner change event
    if (body.owner && body.owner !== current.owner) {
      logRiskEvent(Number(id), 'owner_change', {
        from: current.owner,
        to: body.owner,
      }, 'user').catch(() => { /* best-effort */ });
    }

    // Log severity change event
    if (body.severity && body.severity !== current.severity) {
      logRiskEvent(Number(id), 'severity_change', {
        from: current.severity,
        to: body.severity,
      }, 'user').catch(() => { /* best-effort */ });
    }

    return reply.send(successEnvelope(rows[0], req.requestId));
  });

  // ── DELETE /v3/risks/:id ───────────────────────────────────
  app.delete('/v3/risks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const oldRes = await pool.query<{ id: number; title: string | null; category: string | null }>(
      'SELECT id, title, category FROM risks WHERE id = $1',
      [Number(id)],
    );
    const oldRow = oldRes.rows[0];

    await pool.query('DELETE FROM risks WHERE id = $1', [Number(id)]);

    if (oldRow) {
      recordAuditLog(pool, {
        action: 'risk_delete',
        table_name: 'risks',
        record_id: Number(id),
        old_values: oldRow,
        new_values: null,
        actor: 'user',
        source: 'user',
      }).catch(() => { /* best-effort */ });
    }

    return reply.status(204).send();
  });

  // ── GET /v3/risks/:id/events — event timeline ──────────────
  app.get('/v3/risks/:id/events', async (req, reply) => {
    const { id } = req.params as { id: string };
    const events = await getRiskEvents(Number(id));
    return reply.send(successEnvelope({ items: events, total: events.length }, req.requestId));
  });

  // ── POST /v3/risks/:id/events — add event/note ─────────────
  app.post('/v3/risks/:id/events', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { event_type?: string; detail?: Record<string, unknown>; actor?: string };

    if (!body.event_type) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'event_type is required', req.requestId));
    }

    await logRiskEvent(
      Number(id),
      body.event_type as RiskEventType,
      body.detail ?? {},
      body.actor ?? 'user',
    );

    return reply.status(201).send(successEnvelope({ ok: true }, req.requestId));
  });

  // ── GET /v3/opportunities/:id/risks — per-entity risks ─────
  app.get('/v3/opportunities/:id/risks', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rows } = await pool.query(
      `SELECT r.*
       FROM risks r
       WHERE r.opportunity_id = $1
       ORDER BY
         CASE r.severity
           WHEN 'critical' THEN 0 WHEN 'high' THEN 1
           WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4
         END,
         r.created_at DESC`,
      [Number(id)],
    );
    return reply.send(successEnvelope({ items: rows, total: rows.length }, req.requestId));
  });

  // ── POST /v3/risks/generate/:opportunityId — AI gen ────────
  app.post('/v3/risks/generate/:opportunityId', async (req, reply) => {
    const { opportunityId } = req.params as { opportunityId: string };

    const { rows: oppRows } = await pool.query(
      `SELECT id, title, description, naics, set_aside, place_of_performance, response_deadline, agency
       FROM opportunities WHERE id = $1`,
      [Number(opportunityId)],
    );

    if (!oppRows.length) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Opportunity not found', req.requestId));
    }

    const opp = oppRows[0] as {
      id: number;
      title: string;
      description: string | null;
      naics: string | null;
      set_aside: string | null;
      place_of_performance: string | null;
      response_deadline: string | null;
      agency: string | null;
    };

    const { rows: existingRows } = await pool.query(
      `SELECT title FROM risks WHERE opportunity_id = $1`,
      [opp.id],
    );
    const existingRiskTitles = existingRows.map((r: { title: string }) => r.title);

    const input: RiskGenerationInput = {
      opportunity_id: String(opp.id),
      opportunity_title: opp.title,
      opportunity_description: opp.description ?? '',
      naics_codes: opp.naics ? [opp.naics] : [],
      set_aside: opp.set_aside,
      place_of_performance: opp.place_of_performance,
      response_deadline: opp.response_deadline,
      agency: opp.agency,
      existing_risks: existingRiskTitles,
    };

    const result = await llmRouter.route({ task: 'risk_generation', input });

    if (!result.ok) {
      return reply.status(502).send(errorEnvelope('INTERNAL_ERROR', result.error_message, req.requestId));
    }

    const output = result.output as RiskGenerationOutput;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const risk of output.risks) {
        await client.query(
          `INSERT INTO risks (title, description, category, likelihood, impact,
            mitigation, source, opportunity_id, risk_type, if_condition,
            then_impact, mitigation_plan, exploitation_plan, severity, source_event, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, 'ai_generated', $7, $8, $9, $10, $11, $12, $13, $14, 'ai')`,
          [
            risk.title, risk.description, risk.category, risk.likelihood, risk.impact,
            risk.mitigation, opp.id,
            risk.risk_type ?? 'negative',
            risk.if_condition ?? null,
            risk.then_impact ?? null,
            risk.mitigation_plan ?? null,
            risk.exploitation_plan ?? null,
            'medium',
            JSON.stringify({ type: 'ai_generation', opportunity_id: opp.id }),
          ],
        );
      }
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    return reply.send(successEnvelope({
      risks_created: output.risks.length,
      generation_summary: output.generation_summary,
      generated_at: output.generated_at,
    }, req.requestId));
  });
}
