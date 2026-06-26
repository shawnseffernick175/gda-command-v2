/**
 * Pipeline Coverage — Shipley Capture Management Lifecycle model (#887).
 *
 * Endpoint:
 *   GET /v3/pipeline/coverage?fy=2026  — layer-by-layer coverage snapshot
 */

import type { FastifyInstance } from 'fastify';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { pool } from '../lib/db.js';

/* ── Shipley multiples (doctrine — hardcoded) ─────────────────── */

const LAYER_CONFIG = {
  total_qualified: {
    label: 'Total Qualified',
    multiple_min: 5,
    multiple_max: null,
    stages: ['qualified', 'pursue', 'solicitation', 'post_submittal'],
  },
  active_capture: {
    label: 'Active Capture',
    multiple_min: 3,
    multiple_max: null,
    stages: ['pursue', 'solicitation', 'post_submittal'],
  },
  bid_proposal: {
    label: 'Bid & Proposal',
    multiple_min: 1.5,
    multiple_max: 2,
    stages: ['solicitation', 'post_submittal'],
  },
  pwin_weighted: {
    label: 'Pwin-Weighted',
    multiple_min: 1,
    multiple_max: null,
    stages: null, // all active stages — uses weighted calc
  },
} as const;

type LayerKey = keyof typeof LAYER_CONFIG;

const LAYER_ORDER: LayerKey[] = [
  'total_qualified',
  'active_capture',
  'bid_proposal',
  'pwin_weighted',
];

const DEFAULT_STAGE_PWIN: Record<string, number> = {
  interest: 0.10,
  qualified: 0.25,
  pursue: 0.50,
  solicitation: 0.75,
  post_submittal: 1.00,
};

const VALID_FY = [2026, 2027, 2028];

const AOP_COLUMN: Record<number, string> = {
  2026: 'aop_revenue_target_fy26',
  2027: 'aop_revenue_target_fy27',
  2028: 'aop_revenue_target_fy28',
};

interface PursuitRow {
  pipeline_item_id: string;
  opportunity_id: string;
  title: string;
  agency: string | null;
  capture_owner: string;
  stage: string;
  value: string;
  pwin_override: string | null;
}

interface CoveragePursuit {
  pipeline_item_id: string;
  opportunity_id: string;
  title: string;
  agency: string | null;
  capture_owner: string;
  stage: string;
  capture_value: number;
  pwin: number;
}

function statusFromRatio(ratio: number): 'green' | 'yellow' | 'red' {
  if (ratio >= 1.0) return 'green';
  if (ratio >= 0.8) return 'yellow';
  return 'red';
}

export async function pipelineCoverageRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v3/pipeline/coverage', async (req, reply) => {
    const query = req.query as { fy?: string };
    const fy = query.fy ? parseInt(query.fy, 10) : 2026;

    if (!VALID_FY.includes(fy)) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', `fy must be one of ${VALID_FY.join(', ')}`, req.requestId),
      );
    }

    // 1. Fetch AOP target + default stage pwin from wheelhouse_config
    const col = AOP_COLUMN[fy]!;
    const configRes = await pool.query<{ aop_target: string; default_stage_pwin: Record<string, number> }>(
      `SELECT ${col} AS aop_target, default_stage_pwin
       FROM wheelhouse_config WHERE id = 1`,
    );

    if (configRes.rows.length === 0) {
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', 'wheelhouse_config not initialized', req.requestId),
      );
    }

    const aopTarget = Number(configRes.rows[0]!.aop_target);
    const configPwin = configRes.rows[0]!.default_stage_pwin ?? DEFAULT_STAGE_PWIN;

    // 2. Fetch all active pipeline pursuits (exclude terminal stages + $1 IDIQ)
    const pursuitsSql = `
      SELECT
        pi.id::text        AS pipeline_item_id,
        o.id::text         AS opportunity_id,
        COALESCE(o.title, 'Untitled') AS title,
        o.agency,
        pi.capture_owner,
        pi.stage,
        COALESCE(o.value_max, o.value_min, 0)::text AS value,
        pi.pwin_override::text AS pwin_override
      FROM pipeline_items pi
      INNER JOIN opportunities o
        ON o.id = pi.opportunity_id AND o.deleted_at IS NULL
      WHERE pi.stage NOT IN ('won', 'lost', 'no_bid', 'gov_cancelled')
        AND COALESCE(o.value_max, o.value_min, 0) > 1
      ORDER BY COALESCE(o.value_max, o.value_min, 0) DESC
    `;
    const pursuitsRes = await pool.query<PursuitRow>(pursuitsSql);

    // Build enriched pursuit list with resolved pwin
    const allPursuits: CoveragePursuit[] = pursuitsRes.rows.map((r) => {
      const value = Number(r.value);
      const override = r.pwin_override != null ? Number(r.pwin_override) : null;
      const stagePwin = (configPwin as Record<string, number>)[r.stage] ?? DEFAULT_STAGE_PWIN[r.stage] ?? 0;
      const pwin = override ?? stagePwin;
      return {
        pipeline_item_id: r.pipeline_item_id,
        opportunity_id: r.opportunity_id,
        title: r.title,
        agency: r.agency,
        capture_owner: r.capture_owner,
        stage: r.stage,
        capture_value: value,
        pwin,
      };
    });

    // 3. Compute layers
    const layers = LAYER_ORDER.map((key) => {
      const cfg = LAYER_CONFIG[key];

      const requiredMin = aopTarget * cfg.multiple_min;
      const requiredMax = cfg.multiple_max != null ? aopTarget * cfg.multiple_max : null;

      let actual: number;
      let pursuits: CoveragePursuit[];

      if (key === 'pwin_weighted') {
        // Pwin-weighted: sum(value * pwin) across all active pursuits
        pursuits = allPursuits;
        actual = allPursuits.reduce((sum, p) => sum + p.capture_value * p.pwin, 0);
      } else {
        const stageSet = new Set<string>(cfg.stages);
        pursuits = allPursuits.filter((p) => stageSet.has(p.stage));
        actual = pursuits.reduce((sum, p) => sum + p.capture_value, 0);
      }

      const multiple = aopTarget > 0 ? Math.round((actual / aopTarget) * 10) / 10 : 0;
      const ratio = requiredMin > 0 ? actual / requiredMin : 1;
      const status = statusFromRatio(ratio);

      return {
        key,
        label: cfg.label,
        required_min: requiredMin,
        required_max: requiredMax,
        actual: Math.round(actual),
        multiple,
        status,
        pursuits,
      };
    });

    return reply.send(successEnvelope({
      fy,
      aop_target: aopTarget,
      layers,
    }, req.requestId));
  });
}
