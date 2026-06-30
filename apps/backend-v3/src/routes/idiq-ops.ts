/**
 * IDIQ Operations routes — IDIQ pipeline pursuits + live TO monitoring.
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope } from '../lib/envelope.js';
import { pollSource, pollAllDueSources } from '../services/idiq-ops/taskOrderIngestService.js';
import { listPipelineItems } from '../services/pipeline/index.js';

export async function idiqOpsRoutes(fastify: FastifyInstance): Promise<void> {

  /**
   * GET /v3/idiq-ops/pursuits — IDIQ-tagged pipeline items (the real IDIQ pursuits)
   */
  fastify.get('/v3/idiq-ops/pursuits', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const rawLimit = parseInt(query.limit ?? '50', 10);
    const limit = Number.isNaN(rawLimit) ? 50 : Math.min(Math.max(rawLimit, 1), 200);

    const result = await listPipelineItems({
      limit,
      cursor: query.cursor,
      is_idiq: true,
      q: query.q,
      stage: query.stage,
    });

    return reply.send(successEnvelope(result, req.requestId));
  });

  /**
   * GET /v3/idiq-ops/feed — paginated task order feed with filters
   */
  fastify.get('/v3/idiq-ops/feed', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const vehicleId = query.vehicle_id ? Number(query.vehicle_id) : null;
    const eligibility = query.eligibility; // 'eligible' | 'not_eligible' | 'unclear'
    const status = query.status ?? 'open';
    const heatTier = query.heat;
    const closingWithinDays = query.closing_within_days ? Number(query.closing_within_days) : null;
    const agency = query.agency;
    const page = Math.max(1, Number(query.page ?? '1'));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? '50')));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 0;

    if (vehicleId) {
      paramIdx++;
      conditions.push(`toa.vehicle_id = $${paramIdx}`);
      params.push(vehicleId);
    }

    if (eligibility === 'eligible') {
      conditions.push(`toa.envision_eligible = true`);
    } else if (eligibility === 'not_eligible') {
      conditions.push(`toa.envision_eligible = false`);
    } else if (eligibility === 'unclear') {
      conditions.push(`toa.envision_eligible IS NULL`);
    }

    if (status) {
      paramIdx++;
      conditions.push(`toa.status = $${paramIdx}`);
      params.push(status);
    }

    if (heatTier) {
      paramIdx++;
      conditions.push(`toa.heat_tier = $${paramIdx}`);
      params.push(heatTier);
    }

    if (closingWithinDays) {
      paramIdx++;
      conditions.push(`toa.response_due <= CURRENT_DATE + $${paramIdx}::int`);
      params.push(closingWithinDays);
      conditions.push(`toa.response_due >= CURRENT_DATE`);
    }

    if (agency) {
      paramIdx++;
      conditions.push(`toa.agency ILIKE '%' || $${paramIdx} || '%'`);
      params.push(agency);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count query
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM task_order_announcements toa ${whereClause}`,
      params,
    );

    // Data query
    paramIdx++;
    const limitParam = paramIdx;
    paramIdx++;
    const offsetParam = paramIdx;

    const dataResult = await pool.query(`
      SELECT
        toa.id, toa.vehicle_id, toa.external_id, toa.title, toa.agency, toa.sub_agency,
        toa.pool_or_lane, toa.set_aside, toa.naics_code, toa.est_value_usd,
        toa.posted_date, toa.response_due, toa.status, toa.source_url,
        toa.envision_eligible, toa.eligibility_reason, toa.wheelhouse_score,
        toa.heat_tier, toa.capture_id, toa.not_pursuing_reason,
        toa.first_seen_at,
        cv.short_name AS vehicle_short_name,
        cv.agency AS vehicle_agency,
        CASE
          WHEN toa.response_due IS NOT NULL
          THEN (toa.response_due - CURRENT_DATE)
          ELSE NULL
        END AS days_left
      FROM task_order_announcements toa
      JOIN contract_vehicles cv ON cv.id = toa.vehicle_id
      ${whereClause}
      ORDER BY
        CASE toa.heat_tier
          WHEN 'hot' THEN 0
          WHEN 'eligible' THEN 1
          WHEN 'watch' THEN 2
          ELSE 3
        END,
        toa.response_due ASC NULLS LAST
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `, [...params, limit, offset]);

    return reply.send(successEnvelope({
      items: dataResult.rows,
      total: Number(countResult.rows[0].total),
      page,
      limit,
    }, req.requestId));
  });

  /**
   * GET /v3/idiq-ops/scoreboard — vehicle cards with TO counts
   */
  fastify.get('/v3/idiq-ops/scoreboard', async (req, reply) => {
    const result = await pool.query(`
      SELECT
        cv.id, cv.name, cv.short_name, cv.contract_number, cv.agency,
        cv.ceiling_value, cv.expiration_date, cv.pools_held, cv.set_asides_held,
        COUNT(toa.id) FILTER (WHERE toa.status = 'open') AS open_to_count,
        COUNT(toa.id) FILTER (WHERE toa.status = 'open' AND toa.envision_eligible = true) AS eligible_count,
        COUNT(toa.id) FILTER (WHERE toa.status = 'awarded' AND toa.capture_id IS NOT NULL
          AND toa.award_date >= CURRENT_DATE - INTERVAL '365 days') AS awarded_ltm,
        COUNT(toa.id) FILTER (WHERE toa.capture_id IS NOT NULL
          AND toa.posted_date >= date_trunc('year', CURRENT_DATE)) AS submitted_ytd,
        MAX(toa.posted_date) AS last_to_posted,
        MIN(toa.response_due) FILTER (WHERE toa.status = 'open' AND toa.response_due >= CURRENT_DATE) AS next_close,
        vts_agg.last_polled_at AS polling_last,
        vts_agg.last_status AS polling_status,
        vts_agg.source_type AS polling_source
      FROM contract_vehicles cv
      LEFT JOIN task_order_announcements toa ON toa.vehicle_id = cv.id
      LEFT JOIN LATERAL (
        SELECT last_polled_at, last_status, source_type
        FROM vehicle_to_sources
        WHERE vehicle_id = cv.id AND is_active = true
        ORDER BY last_polled_at DESC NULLS LAST
        LIMIT 1
      ) vts_agg ON true
      WHERE cv.is_active = true
      GROUP BY cv.id, cv.name, cv.short_name, cv.contract_number, cv.agency,
               cv.ceiling_value, cv.expiration_date, cv.pools_held, cv.set_asides_held,
               vts_agg.last_polled_at, vts_agg.last_status, vts_agg.source_type
      ORDER BY cv.agency, cv.short_name
    `);

    return reply.send(successEnvelope(result.rows, req.requestId));
  });

  /**
   * GET /v3/idiq-ops/kpis — header strip data
   */
  fastify.get('/v3/idiq-ops/kpis', async (req, reply) => {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'open' AND envision_eligible = true) AS open_eligible,
        COUNT(*) FILTER (WHERE status = 'open' AND heat_tier = 'hot') AS hot_tos,
        COUNT(*) FILTER (WHERE capture_id IS NOT NULL
          AND posted_date >= date_trunc('quarter', CURRENT_DATE)) AS submitted_qtd,
        COUNT(*) FILTER (WHERE status = 'awarded' AND capture_id IS NOT NULL
          AND award_date >= CURRENT_DATE - INTERVAL '365 days') AS awarded_ltm,
        CASE
          WHEN COUNT(*) FILTER (WHERE capture_id IS NOT NULL
            AND posted_date >= CURRENT_DATE - INTERVAL '365 days') > 0
          THEN ROUND(
            COUNT(*) FILTER (WHERE status = 'awarded' AND capture_id IS NOT NULL
              AND award_date >= CURRENT_DATE - INTERVAL '365 days')::NUMERIC /
            NULLIF(COUNT(*) FILTER (WHERE capture_id IS NOT NULL
              AND posted_date >= CURRENT_DATE - INTERVAL '365 days'), 0) * 100, 1
          )
          ELSE 0
        END AS win_rate_ltm
      FROM task_order_announcements
    `);

    const kpis = result.rows[0];
    return reply.send(successEnvelope({
      open_eligible: Number(kpis.open_eligible),
      hot_tos: Number(kpis.hot_tos),
      submitted_qtd: Number(kpis.submitted_qtd),
      awarded_ltm: Number(kpis.awarded_ltm),
      win_rate_ltm: Number(kpis.win_rate_ltm),
    }, req.requestId));
  });

  /**
   * POST /v3/idiq-ops/tos/:id/start-capture — create capture linked to TO
   */
  fastify.post('/v3/idiq-ops/tos/:id/start-capture', async (req, reply) => {
    const { id } = req.params as { id: string };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get the TO
      const toResult = await client.query(
        `SELECT id, title, vehicle_id FROM task_order_announcements WHERE id = $1`,
        [id],
      );
      if (toResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.status(404).send({ success: false, error: 'TO not found' });
      }

      const to = toResult.rows[0];

      // Find matching opportunity or create one
      const oppResult = await client.query(`
        SELECT id, source_id FROM opportunities
        WHERE title = $1
        LIMIT 1
      `, [to.title]);

      let oppId: number;
      let sourceId: number;

      if (oppResult.rows.length > 0) {
        oppId = oppResult.rows[0].id;
        sourceId = oppResult.rows[0].source_id;
      } else {
        const stubOpp = await client.query(`
          INSERT INTO opportunities (title, source_id, sam_notice_id)
          VALUES ($1, 1, $2)
          RETURNING id
        `, [to.title, `TO-${id}`]);
        oppId = stubOpp.rows[0].id;
        sourceId = 1;
      }

      // Create a pipeline item (captures require one)
      const pipeResult = await client.query(`
        INSERT INTO pipeline_items (opportunity_id, capture_owner, stage, source_id)
        VALUES ($1, 'admin', 'pursue', $2)
        RETURNING id
      `, [oppId, sourceId]);

      // Create the capture
      const captureResult = await client.query(`
        INSERT INTO captures (pipeline_item_id, color_stage, source_id)
        VALUES ($1, 'pink', $2)
        RETURNING id
      `, [pipeResult.rows[0].id, sourceId]);
      const captureId = captureResult.rows[0].id;

      // Link capture back to TO
      await client.query(
        `UPDATE task_order_announcements SET capture_id = $1 WHERE id = $2`,
        [captureId, id],
      );

      await client.query('COMMIT');
      return reply.send(successEnvelope({ capture_id: captureId, to_id: id }, req.requestId));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  /**
   * POST /v3/idiq-ops/tos/:id/mark-not-pursuing — mark TO as not pursuing
   */
  fastify.post('/v3/idiq-ops/tos/:id/mark-not-pursuing', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { reason?: string } | undefined;
    const reason = body?.reason ?? 'Not pursuing';

    await pool.query(
      `UPDATE task_order_announcements SET not_pursuing_reason = $1 WHERE id = $2`,
      [reason, id],
    );

    return reply.send(successEnvelope({ marked: true }, req.requestId));
  });

  /**
   * POST /v3/idiq-ops/sources/:id/poll-now — manual repoll
   */
  fastify.post('/v3/idiq-ops/sources/:id/poll-now', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await pollSource(Number(id));
    return reply.send(successEnvelope(result, req.requestId));
  });

  /**
   * GET /v3/idiq-ops/sources — all polling sources with health
   */
  fastify.get('/v3/idiq-ops/sources', async (req, reply) => {
    const result = await pool.query(`
      SELECT
        vts.id, vts.vehicle_id, vts.source_type, vts.source_url,
        vts.requires_credential, vts.poll_interval_minutes,
        vts.last_polled_at, vts.last_status, vts.is_active,
        cv.short_name AS vehicle_short_name
      FROM vehicle_to_sources vts
      JOIN contract_vehicles cv ON cv.id = vts.vehicle_id
      ORDER BY cv.short_name, vts.source_type
    `);

    return reply.send(successEnvelope(result.rows, req.requestId));
  });
}
