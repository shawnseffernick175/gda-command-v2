import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { llmRouter } from '../lib/llm-router.js';
import type { RiskGenerationInput, RiskGenerationOutput } from '../lib/llm-router.types.js';

export async function risksRoutes(app: FastifyInstance): Promise<void> {
  // GET /v3/risks
  app.get('/v3/risks', async (req, reply) => {
    const query = req.query as { status?: string; category?: string };
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (query.status) {
      params.push(query.status);
      conditions.push(`r.status = $${params.length}`);
    }
    if (query.category) {
      params.push(query.category);
      conditions.push(`r.category = $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT r.*, o.title AS opportunity_title
       FROM risks r
       LEFT JOIN opportunities o ON o.id = r.opportunity_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY r.score DESC, r.created_at DESC`,
      params,
    );

    return reply.send(successEnvelope({ items: rows, total: rows.length }, req.requestId));
  });

  // POST /v3/risks
  app.post('/v3/risks', async (req, reply) => {
    const body = req.body as {
      title: string;
      description?: string;
      category?: string;
      likelihood?: number;
      impact?: number;
      status?: string;
      owner?: string;
      mitigation?: string;
      opportunity_id?: number | null;
    };

    if (!body.title?.trim()) {
      return reply.status(400).send({ error: 'title is required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO risks
         (title, description, category, likelihood, impact, status, owner, mitigation, opportunity_id, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'manual')
       RETURNING *`,
      [
        body.title.trim(),
        body.description ?? null,
        body.category ?? 'operational',
        body.likelihood ?? 3,
        body.impact ?? 3,
        body.status ?? 'open',
        body.owner ?? null,
        body.mitigation ?? null,
        body.opportunity_id ?? null,
      ],
    );

    return reply.status(201).send(successEnvelope(rows[0], req.requestId));
  });

  // PATCH /v3/risks/:id
  app.patch('/v3/risks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;

    const allowed = ['title', 'description', 'category', 'likelihood', 'impact', 'status', 'owner', 'mitigation', 'risk_type', 'if_condition', 'then_impact', 'mitigation_plan', 'exploitation_plan', 'due_date', 'next_step'];
    const sets: string[] = [];
    const params: unknown[] = [];

    for (const key of allowed) {
      if (key in body) {
        params.push(body[key]);
        sets.push(`${key} = $${params.length}`);
      }
    }

    if (!sets.length) {
      return reply.status(400).send({ error: 'No valid fields to update' });
    }

    sets.push('updated_at = NOW()');
    params.push(Number(id));

    const { rows } = await pool.query(
      `UPDATE risks SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params,
    );

    if (!rows.length) {
      return reply.status(404).send({ error: 'Risk not found' });
    }

    return reply.send(successEnvelope(rows[0], req.requestId));
  });

  // DELETE /v3/risks/:id
  app.delete('/v3/risks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await pool.query('DELETE FROM risks WHERE id = $1', [Number(id)]);
    return reply.status(204).send();
  });

  // POST /v3/risks/generate/:opportunityId
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
          `INSERT INTO risks (title, description, category, likelihood, impact, mitigation, source, opportunity_id, risk_type, if_condition, then_impact, mitigation_plan, exploitation_plan)
           VALUES ($1, $2, $3, $4, $5, $6, 'ai_generated', $7, $8, $9, $10, $11, $12)`,
          [
            risk.title, risk.description, risk.category, risk.likelihood, risk.impact,
            risk.mitigation, opp.id,
            risk.risk_type ?? 'negative',
            risk.if_condition ?? null,
            risk.then_impact ?? null,
            risk.mitigation_plan ?? null,
            risk.exploitation_plan ?? null,
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
