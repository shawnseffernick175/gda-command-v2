/**
 * F-878 — Scoring & Doctrine unified config routes.
 *
 * Endpoints:
 *   GET   /v3/config/scoring-doctrine        — full config bundle
 *   PATCH /v3/config/pwin-weights             — update Pwin weights
 *   PATCH /v3/config/principles/:id           — update a principle's short_form / long_form / evaluation_prompt
 *   PATCH /v3/config/rules/:key               — update a doctrine rule value
 *   PATCH /v3/config/wheelhouse               — update wheelhouse config
 *   POST  /v3/config/pwin-weights/preview     — preview weight changes on live pursuits
 *   POST  /v3/config/pwin-weights/reset       — reset weights to defaults
 *   POST  /v3/config/wheelhouse/reset         — reset wheelhouse to defaults
 */

import type { FastifyInstance } from 'fastify';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { pool } from '../lib/db.js';
import { getPwinWeights, DEFAULT_PWIN_WEIGHTS, type PwinWeights } from '../services/pwin/pwin-weights.js';
import { getPrinciples, getConfig } from '../services/doctrine/config.js';

interface WheelhouseConfig {
  naics_allowlist: string[];
  agency_allowlist: string[];
  dollar_min: number;
  dollar_max: number;
  setasides_pursued: string[];
  updated_at: string;
}

const DEFAULT_WHEELHOUSE: Omit<WheelhouseConfig, 'updated_at'> = {
  naics_allowlist: ['541330','541611','541612','541614','541615','541618','541620','541690','541713','541714','541715','541720','541990','561499','561611','611512'],
  agency_allowlist: ['DoD-Army','DoD-Navy','DoD-Air Force','DoD-USMC','DoD-SOCOM','DoD-DLA','DHS','DOJ','DOE','VA','NASA','DOS','USAID'],
  dollar_min: 100000,
  dollar_max: 500000000,
  setasides_pursued: ['8(a)','SDVOSB','WOSB','HUBZone','Small Business'],
};

async function getWheelhouse(): Promise<WheelhouseConfig> {
  const res = await pool.query<WheelhouseConfig>(
    `SELECT naics_allowlist, agency_allowlist, dollar_min, dollar_max, setasides_pursued, updated_at
     FROM wheelhouse_config WHERE id = 1 LIMIT 1`,
  );
  if (res.rows[0]) return res.rows[0];
  return { ...DEFAULT_WHEELHOUSE, updated_at: new Date().toISOString() };
}

export async function scoringDoctrineRoutes(app: FastifyInstance): Promise<void> {
  // GET /v3/config/scoring-doctrine — full bundle
  app.get('/v3/config/scoring-doctrine', async (req, reply) => {
    const [pwin_weights, principles, rules, wheelhouse] = await Promise.all([
      getPwinWeights(),
      getPrinciples(),
      getConfig(),
      getWheelhouse(),
    ]);
    return reply.send(successEnvelope({ pwin_weights, principles, rules, wheelhouse }, req.requestId));
  });

  // PATCH /v3/config/pwin-weights
  app.patch('/v3/config/pwin-weights', async (req, reply) => {
    const body = req.body as { weights?: Record<string, number> } | undefined;
    if (!body?.weights || typeof body.weights !== 'object') {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Body must contain { weights: {...} }', req.requestId),
      );
    }

    for (const [key, value] of Object.entries(body.weights)) {
      if (typeof value !== 'number' || !isFinite(value)) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', `Weight "${key}" must be a finite number`, req.requestId),
        );
      }
    }

    const currentWeights = await getPwinWeights();
    const user = (req as typeof req & { user?: { sub?: string } }).user;
    const now = new Date().toISOString();

    await pool.query(
      `INSERT INTO pwin_scoring_config (config_key, weights, updated_at, updated_by, previous_weights)
       VALUES ('default', $1, $2, $3, $4)
       ON CONFLICT (config_key)
       DO UPDATE SET weights = $1, updated_at = $2, updated_by = $3, previous_weights = $4`,
      [JSON.stringify(body.weights), now, user?.sub ?? null, JSON.stringify(currentWeights)],
    );

    return reply.send(successEnvelope(body.weights, req.requestId));
  });

  // POST /v3/config/pwin-weights/reset
  app.post('/v3/config/pwin-weights/reset', async (req, reply) => {
    const currentWeights = await getPwinWeights();
    const user = (req as typeof req & { user?: { sub?: string } }).user;
    const now = new Date().toISOString();

    await pool.query(
      `INSERT INTO pwin_scoring_config (config_key, weights, updated_at, updated_by, previous_weights)
       VALUES ('default', $1, $2, $3, $4)
       ON CONFLICT (config_key)
       DO UPDATE SET weights = $1, updated_at = $2, updated_by = $3, previous_weights = $4`,
      [JSON.stringify(DEFAULT_PWIN_WEIGHTS), now, user?.sub ?? null, JSON.stringify(currentWeights)],
    );

    return reply.send(successEnvelope(DEFAULT_PWIN_WEIGHTS, req.requestId));
  });

  // POST /v3/config/pwin-weights/preview — preview weight changes on live pursuits
  app.post('/v3/config/pwin-weights/preview', async (req, reply) => {
    const body = req.body as { weights?: Record<string, number> } | undefined;
    if (!body?.weights || typeof body.weights !== 'object') {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Body must contain { weights: {...} }', req.requestId),
      );
    }

    const currentWeights = await getPwinWeights();
    const newWeights = body.weights as PwinWeights;

    // Fetch live pursuits from pipeline (active stage)
    const pursuits = await pool.query<{
      id: string;
      title: string;
      pwin_score: number | null;
      is_incumbent: boolean;
      is_recompete: boolean;
      has_vehicle_access: boolean;
      has_clearance_fit: boolean;
      has_teaming: boolean;
      has_teaming_gap: boolean;
      is_existing_customer: boolean;
      naics_setaside: boolean;
      naics_fullopen: boolean;
      doctrine_alignment_pct: number;
      margin_below_floor: boolean;
      capability_match: number;
    }>(`
      SELECT
        o.id,
        COALESCE(o.title, o.sam_title, 'Untitled') as title,
        o.pwin_score,
        COALESCE((o.enrichment->>'is_incumbent')::boolean, false) as is_incumbent,
        COALESCE((o.enrichment->>'is_recompete')::boolean, false) as is_recompete,
        COALESCE((o.enrichment->>'has_vehicle_access')::boolean, false) as has_vehicle_access,
        COALESCE((o.enrichment->>'has_clearance_fit')::boolean, false) as has_clearance_fit,
        COALESCE((o.enrichment->>'has_teaming')::boolean, false) as has_teaming,
        COALESCE((o.enrichment->>'has_teaming_gap')::boolean, false) as has_teaming_gap,
        COALESCE((o.enrichment->>'is_existing_customer')::boolean, false) as is_existing_customer,
        COALESCE((o.enrichment->>'naics_setaside')::boolean, false) as naics_setaside,
        COALESCE((o.enrichment->>'naics_fullopen')::boolean, false) as naics_fullopen,
        COALESCE((o.enrichment->>'doctrine_alignment_pct')::numeric, 0.5) as doctrine_alignment_pct,
        COALESCE((o.enrichment->>'margin_below_floor')::boolean, false) as margin_below_floor,
        COALESCE((o.enrichment->>'capability_match')::numeric, 0.5) as capability_match
      FROM opportunities o
      WHERE o.canonical_stage IN ('qualify', 'solution_dev', 'proposal_prep', 'submitted', 'evaluate')
      ORDER BY o.pwin_score DESC NULLS LAST
      LIMIT 12
    `);

    function computePwin(w: PwinWeights, row: typeof pursuits.rows[0]): number {
      let score = w.base ?? 30;
      if (row.is_incumbent) score += w.incumbency_bonus ?? 0;
      if (row.is_recompete) score += w.recompete_bonus ?? 0;
      if (row.has_vehicle_access) score += w.vehicle_access ?? 0;
      if (row.has_clearance_fit) score += w.clearance_fit ?? 0;
      if (row.has_teaming) score += w.teaming_bonus ?? 0;
      if (row.has_teaming_gap) score += w.teaming_penalty ?? 0;
      if (row.is_existing_customer) score += w.existing_customer ?? 0;
      if (row.naics_setaside) score += w.naics_small_setaside ?? 0;
      if (row.naics_fullopen) score += w.naics_small_fullopen ?? 0;
      if (row.margin_below_floor) score += w.margin_penalty ?? 0;
      score += (w.doctrine_bonus_max ?? 0) * Number(row.doctrine_alignment_pct);
      score += (w.capability_match_multiplier ?? 0) * Number(row.capability_match) * 100;
      return Math.max(0, Math.min(100, Math.round(score)));
    }

    const previews = pursuits.rows.map((row) => {
      const old_pwin = computePwin(currentWeights, row);
      const new_pwin = computePwin(newWeights, row);
      return {
        pursuit_id: row.id,
        name: row.title,
        old_pwin,
        new_pwin,
        delta: new_pwin - old_pwin,
      };
    });

    return reply.send(successEnvelope(previews, req.requestId));
  });

  // PATCH /v3/config/principles/:id
  app.patch('/v3/config/principles/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      short_form?: string;
      long_form?: string;
      evaluation_prompt?: string;
    } | undefined;

    if (!body || (!body.short_form && !body.long_form && !body.evaluation_prompt)) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'At least one of short_form, long_form, or evaluation_prompt is required', req.requestId),
      );
    }

    const setClauses: string[] = [];
    const params: unknown[] = [id];
    let idx = 2;

    if (body.short_form !== undefined) {
      setClauses.push(`short_form = $${idx}`);
      params.push(body.short_form);
      idx++;
    }
    if (body.long_form !== undefined) {
      setClauses.push(`long_form = $${idx}`);
      params.push(body.long_form);
      idx++;
    }
    if (body.evaluation_prompt !== undefined) {
      setClauses.push(`evaluation_prompt = $${idx}`);
      params.push(body.evaluation_prompt);
      idx++;
    }

    const res = await pool.query(
      `UPDATE doctrine_principles SET ${setClauses.join(', ')} WHERE id = $1
       RETURNING id, name, short_form, long_form, evaluation_prompt, display_order`,
      params,
    );

    if (res.rows.length === 0) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', `Principle "${id}" not found`, req.requestId),
      );
    }

    return reply.send(successEnvelope(res.rows[0], req.requestId));
  });

  // PATCH /v3/config/rules/:key
  app.patch('/v3/config/rules/:key', async (req, reply) => {
    const { key } = req.params as { key: string };
    const body = req.body as { value?: unknown } | undefined;

    if (body?.value === undefined) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'value is required in body', req.requestId),
      );
    }

    const res = await pool.query(
      `UPDATE doctrine_rules_config SET value = $2::jsonb, updated_at = now() WHERE key = $1
       RETURNING key, value, description, updated_at`,
      [key, JSON.stringify(body.value)],
    );

    if (res.rows.length === 0) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', `Config key "${key}" not found`, req.requestId),
      );
    }

    return reply.send(successEnvelope(res.rows[0], req.requestId));
  });

  // PATCH /v3/config/wheelhouse
  app.patch('/v3/config/wheelhouse', async (req, reply) => {
    const body = req.body as Partial<WheelhouseConfig> | undefined;
    if (!body || typeof body !== 'object') {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Body must be a JSON object', req.requestId),
      );
    }

    const user = (req as typeof req & { user?: { sub?: string } }).user;

    const setClauses: string[] = ['updated_at = now()'];
    const params: unknown[] = [];
    let idx = 1;

    if (body.naics_allowlist !== undefined) {
      setClauses.push(`naics_allowlist = $${idx}`);
      params.push(body.naics_allowlist);
      idx++;
    }
    if (body.agency_allowlist !== undefined) {
      setClauses.push(`agency_allowlist = $${idx}`);
      params.push(body.agency_allowlist);
      idx++;
    }
    if (body.dollar_min !== undefined) {
      setClauses.push(`dollar_min = $${idx}`);
      params.push(body.dollar_min);
      idx++;
    }
    if (body.dollar_max !== undefined) {
      setClauses.push(`dollar_max = $${idx}`);
      params.push(body.dollar_max);
      idx++;
    }
    if (body.setasides_pursued !== undefined) {
      setClauses.push(`setasides_pursued = $${idx}`);
      params.push(body.setasides_pursued);
      idx++;
    }
    if (user?.sub) {
      setClauses.push(`updated_by = $${idx}`);
      params.push(user.sub);
      idx++;
    }

    const res = await pool.query<WheelhouseConfig>(
      `UPDATE wheelhouse_config SET ${setClauses.join(', ')} WHERE id = 1
       RETURNING naics_allowlist, agency_allowlist, dollar_min, dollar_max, setasides_pursued, updated_at`,
      params,
    );

    if (res.rows.length === 0) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Wheelhouse config not found', req.requestId),
      );
    }

    return reply.send(successEnvelope(res.rows[0], req.requestId));
  });

  // POST /v3/config/wheelhouse/reset
  app.post('/v3/config/wheelhouse/reset', async (req, reply) => {
    const user = (req as typeof req & { user?: { sub?: string } }).user;

    const res = await pool.query<WheelhouseConfig>(
      `UPDATE wheelhouse_config SET
         naics_allowlist = $1,
         agency_allowlist = $2,
         dollar_min = $3,
         dollar_max = $4,
         setasides_pursued = $5,
         updated_at = now(),
         updated_by = $6
       WHERE id = 1
       RETURNING naics_allowlist, agency_allowlist, dollar_min, dollar_max, setasides_pursued, updated_at`,
      [
        DEFAULT_WHEELHOUSE.naics_allowlist,
        DEFAULT_WHEELHOUSE.agency_allowlist,
        DEFAULT_WHEELHOUSE.dollar_min,
        DEFAULT_WHEELHOUSE.dollar_max,
        DEFAULT_WHEELHOUSE.setasides_pursued,
        user?.sub ?? null,
      ],
    );

    return reply.send(successEnvelope(res.rows[0], req.requestId));
  });
}
