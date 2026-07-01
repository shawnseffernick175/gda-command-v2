import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { llmRouter } from '../lib/llm-router.js';
import type { RiskGenerationInput, RiskGenerationOutput } from '../lib/llm-router.types.js';
import { recordAuditLog } from '../services/audit/audit-log.js';
import { createRiskEvent } from '../services/risks/risk-events.js';
import { checkRiskDedup } from '../services/risks/dedup.js';

export async function risksRoutes(app: FastifyInstance): Promise<void> {
  // GET /v3/risks — list all risks with filters
  app.get('/v3/risks', async (req, reply) => {
    const query = req.query as {
      status?: string;
      category?: string;
      severity?: string;
      owner?: string;
      related_opportunity_id?: string;
      related_capture_id?: string;
      related_pipeline_item_id?: string;
      limit?: string;
      offset?: string;
    };
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (query.status) {
      // Support pipe-separated values: status=open|mitigating
      const statuses = query.status.split('|').filter(Boolean);
      if (statuses.length === 1) {
        params.push(statuses[0]);
        conditions.push(`r.status = $${params.length}`);
      } else {
        params.push(statuses);
        conditions.push(`r.status = ANY($${params.length}::text[])`);
      }
    }
    if (query.category) {
      params.push(query.category);
      conditions.push(`r.category = $${params.length}`);
    }
    if (query.severity) {
      const severities = query.severity.split('|').filter(Boolean);
      if (severities.length === 1) {
        params.push(severities[0]);
        conditions.push(`r.severity = $${params.length}`);
      } else {
        params.push(severities);
        conditions.push(`r.severity = ANY($${params.length}::text[])`);
      }
    }
    if (query.owner) {
      params.push(query.owner);
      conditions.push(`r.owner = $${params.length}`);
    }
    if (query.related_opportunity_id) {
      params.push(Number(query.related_opportunity_id));
      conditions.push(`r.opportunity_id = $${params.length}`);
    }
    if (query.related_capture_id) {
      params.push(Number(query.related_capture_id));
      conditions.push(`r.related_capture_id = $${params.length}`);
    }
    if (query.related_pipeline_item_id) {
      params.push(Number(query.related_pipeline_item_id));
      conditions.push(`r.related_pipeline_item_id = $${params.length}`);
    }

    const limit = query.limit ? Math.min(Number(query.limit), 200) : 100;
    const offset = query.offset ? Number(query.offset) : 0;

    const { rows } = await pool.query(
      `SELECT r.*, o.title AS opportunity_title
       FROM risks r
       LEFT JOIN opportunities o ON o.id = r.opportunity_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY
         CASE r.severity
           WHEN 'critical' THEN 0
           WHEN 'high' THEN 1
           WHEN 'medium' THEN 2
           WHEN 'low' THEN 3
         END,
         r.score DESC,
         r.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params,
    );

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM risks r WHERE ${conditions.join(' AND ')}`,
      params,
    );

    return reply.send(successEnvelope({
      items: rows,
      total: countRes.rows[0]?.total ?? rows.length,
      limit,
      offset,
    }, req.requestId));
  });

  // GET /v3/risks/launchpad — top critical/high open risks for Launchpad panel
  app.get('/v3/risks/launchpad', async (req, reply) => {
    const query = req.query as { limit?: string };
    const limit = query.limit ? Math.min(Number(query.limit), 20) : 5;

    const { rows } = await pool.query(
      `SELECT r.*, o.title AS opportunity_title
       FROM risks r
       LEFT JOIN opportunities o ON o.id = r.opportunity_id
       WHERE r.status = 'open' AND r.severity IN ('critical', 'high')
       ORDER BY
         CASE r.severity WHEN 'critical' THEN 0 ELSE 1 END,
         r.score DESC,
         r.identified_at ASC
       LIMIT $1`,
      [limit],
    );

    // Owner concentration check
    const ownerRes = await pool.query(
      `SELECT owner, COUNT(*)::int AS cnt
       FROM risks
       WHERE status = 'open' AND severity IN ('critical', 'high') AND owner IS NOT NULL
       GROUP BY owner
       ORDER BY cnt DESC
       LIMIT 1`,
    );
    const totalCritHigh = await pool.query(
      `SELECT COUNT(*)::int AS total FROM risks WHERE status = 'open' AND severity IN ('critical', 'high')`,
    );
    const topOwner = ownerRes.rows[0];
    const total = totalCritHigh.rows[0]?.total ?? 0;
    const ownerConcentrationWarning = topOwner && total > 0 && (topOwner.cnt / total) > 0.7
      ? { owner: topOwner.owner, percentage: Math.round((topOwner.cnt / total) * 100) }
      : null;

    return reply.send(successEnvelope({
      items: rows,
      total,
      owner_concentration_warning: ownerConcentrationWarning,
    }, req.requestId));
  });

  // GET /v3/risks/:id — single risk with events timeline
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

    const eventsRes = await pool.query(
      `SELECT * FROM risk_events WHERE risk_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [Number(id)],
    );

    return reply.send(successEnvelope({
      ...rows[0],
      events: eventsRes.rows,
    }, req.requestId));
  });

  // GET /v3/opportunities/:id/risks — per-entity risks
  app.get('/v3/opportunities/:id/risks', async (req, reply) => {
    const { id } = req.params as { id: string };

    const { rows } = await pool.query(
      `SELECT r.*
       FROM risks r
       WHERE r.opportunity_id = $1
       ORDER BY
         CASE r.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         r.score DESC`,
      [Number(id)],
    );

    return reply.send(successEnvelope({ items: rows, total: rows.length }, req.requestId));
  });

  // GET /v3/captures/:id/risks — per-capture risks
  app.get('/v3/captures/:id/risks', async (req, reply) => {
    const { id } = req.params as { id: string };

    const { rows } = await pool.query(
      `SELECT r.*
       FROM risks r
       WHERE r.related_capture_id = $1
       ORDER BY
         CASE r.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         r.score DESC`,
      [Number(id)],
    );

    return reply.send(successEnvelope({ items: rows, total: rows.length }, req.requestId));
  });

  // GET /v3/pipeline/:id/risks — per-pipeline-item risks
  app.get('/v3/pipeline/:id/risks', async (req, reply) => {
    const { id } = req.params as { id: string };

    const { rows } = await pool.query(
      `SELECT r.*
       FROM risks r
       WHERE r.related_pipeline_item_id = $1
       ORDER BY
         CASE r.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         r.score DESC`,
      [Number(id)],
    );

    return reply.send(successEnvelope({ items: rows, total: rows.length }, req.requestId));
  });

  // POST /v3/risks — create a risk (with dedup check)
  app.post('/v3/risks', async (req, reply) => {
    const body = req.body as {
      title: string;
      description?: string;
      category?: string;
      severity?: string;
      likelihood?: number;
      impact?: number;
      status?: string;
      owner?: string;
      mitigation?: string;
      opportunity_id?: number | null;
      related_capture_id?: number | null;
      related_pipeline_item_id?: number | null;
      related_action_item_id?: number | null;
      source_event?: Record<string, unknown>;
      mitigation_plan?: string;
      due_at?: string;
      created_by?: string;
    };

    if (!body.title?.trim()) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'title is required', req.requestId));
    }

    // Dedup check: same entity + similar description within 7 days
    const dedupResult = await checkRiskDedup(
      body.title,
      body.description ?? '',
      body.opportunity_id ?? null,
      body.related_capture_id ?? null,
      body.related_pipeline_item_id ?? null,
    );

    if (dedupResult.isDuplicate && dedupResult.existingRiskId) {
      // Log a duplicate_fire event instead of creating a new risk
      await createRiskEvent(dedupResult.existingRiskId, 'duplicate_fire', {
        attempted_title: body.title,
        attempted_description: body.description ?? null,
        source_event: body.source_event ?? null,
      }, body.created_by ?? 'system');

      const { rows } = await pool.query(
        'SELECT r.*, o.title AS opportunity_title FROM risks r LEFT JOIN opportunities o ON o.id = r.opportunity_id WHERE r.id = $1',
        [dedupResult.existingRiskId],
      );

      return reply.status(200).send(successEnvelope({
        ...rows[0],
        deduplicated: true,
        message: 'Similar risk already exists on this entity within 7 days. Event logged.',
      }, req.requestId));
    }

    const { rows } = await pool.query(
      `INSERT INTO risks
         (title, description, category, severity, likelihood, impact, status, owner,
          mitigation, opportunity_id, related_capture_id, related_pipeline_item_id,
          related_action_item_id, source_event, mitigation_plan, due_at, source, created_by, identified_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
       RETURNING *`,
      [
        body.title.trim(),
        body.description ?? null,
        body.category ?? 'operational',
        body.severity ?? 'medium',
        body.likelihood ?? 3,
        body.impact ?? 3,
        body.status ?? 'open',
        body.owner ?? null,
        body.mitigation ?? null,
        body.opportunity_id ?? null,
        body.related_capture_id ?? null,
        body.related_pipeline_item_id ?? null,
        body.related_action_item_id ?? null,
        JSON.stringify(body.source_event ?? {}),
        body.mitigation_plan ?? null,
        body.due_at ?? null,
        body.source_event ? 'ai_generated' : 'manual',
        body.created_by ?? 'system',
      ],
    );

    await createRiskEvent(rows[0].id, 'created', {
      title: body.title,
      category: body.category ?? 'operational',
      severity: body.severity ?? 'medium',
      source_event: body.source_event ?? null,
    }, body.created_by ?? 'system');

    return reply.status(201).send(successEnvelope(rows[0], req.requestId));
  });

  // PATCH /v3/risks/:id — update a risk
  app.patch('/v3/risks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;

    // Enforce owner-required rule: critical/high risks cannot leave 'open' without owner
    if (body.status && body.status !== 'open') {
      const existing = await pool.query(
        'SELECT severity, owner FROM risks WHERE id = $1',
        [Number(id)],
      );
      if (existing.rows.length) {
        const risk = existing.rows[0] as { severity: string; owner: string | null };
        const newOwner = (body.owner as string | undefined) ?? risk.owner;
        const effectiveSeverity = (body.severity as string | undefined) ?? risk.severity;
        if ((effectiveSeverity === 'critical' || effectiveSeverity === 'high') && !newOwner) {
          return reply.status(400).send(errorEnvelope(
            'VALIDATION_ERROR',
            'Critical/high severity risks must have an owner before leaving open status',
            req.requestId,
          ));
        }
      }
    }

    const allowed = [
      'title', 'description', 'category', 'severity', 'likelihood', 'impact',
      'status', 'owner', 'mitigation', 'risk_type', 'if_condition', 'then_impact',
      'mitigation_plan', 'exploitation_plan', 'due_date', 'next_step',
      'related_capture_id', 'related_pipeline_item_id', 'related_action_item_id',
      'evidence_grade', 'due_at',
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

    // Track status/severity changes for event log
    const oldRes = await pool.query('SELECT status, severity, owner FROM risks WHERE id = $1', [Number(id)]);
    const oldRisk = oldRes.rows[0] as { status: string; severity: string; owner: string | null } | undefined;

    sets.push('updated_at = NOW()');

    // Set resolved_at on status transition to resolved/accepted
    if (body.status === 'resolved' || body.status === 'accepted') {
      sets.push('resolved_at = NOW()');
    }

    params.push(Number(id));

    const { rows } = await pool.query(
      `UPDATE risks SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params,
    );

    if (!rows.length) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Risk not found', req.requestId));
    }

    // Log lifecycle events
    if (oldRisk) {
      if (body.status && body.status !== oldRisk.status) {
        await createRiskEvent(Number(id), 'status_change', {
          from: oldRisk.status,
          to: body.status,
        }, 'user');
      }
      if (body.severity && body.severity !== oldRisk.severity) {
        await createRiskEvent(Number(id), 'severity_change', {
          from: oldRisk.severity,
          to: body.severity,
        }, 'user');
      }
      if (body.owner && body.owner !== oldRisk.owner) {
        await createRiskEvent(Number(id), 'owner_assigned', {
          from: oldRisk.owner,
          to: body.owner,
        }, 'user');
      }
      if (body.mitigation_plan !== undefined || body.mitigation !== undefined) {
        await createRiskEvent(Number(id), 'mitigation_updated', {
          updated_fields: Object.keys(body).filter(k => k.includes('mitigation')),
        }, 'user');
      }
    }

    return reply.send(successEnvelope(rows[0], req.requestId));
  });

  // DELETE /v3/risks/:id
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

  // GET /v3/risks/:id/events — risk event timeline
  app.get('/v3/risks/:id/events', async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { limit?: string };
    const limit = query.limit ? Math.min(Number(query.limit), 100) : 50;

    const { rows } = await pool.query(
      `SELECT * FROM risk_events WHERE risk_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [Number(id), limit],
    );

    return reply.send(successEnvelope({ items: rows, total: rows.length }, req.requestId));
  });

  // POST /v3/risks/generate/:opportunityId — AI risk generation
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
          `INSERT INTO risks (title, description, category, severity, likelihood, impact, mitigation, source, opportunity_id, risk_type, if_condition, then_impact, mitigation_plan, exploitation_plan, source_event, created_by, identified_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'ai_generated', $8, $9, $10, $11, $12, $13, $14, 'system', NOW())`,
          [
            risk.title, risk.description, risk.category, risk.severity ?? 'medium',
            risk.likelihood, risk.impact, risk.mitigation, opp.id,
            risk.risk_type ?? 'negative',
            risk.if_condition ?? null,
            risk.then_impact ?? null,
            risk.mitigation_plan ?? null,
            risk.exploitation_plan ?? null,
            JSON.stringify({ source: 'ai_generation', opportunity_id: opp.id }),
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
