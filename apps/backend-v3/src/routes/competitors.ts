import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope } from '../lib/envelope.js';

export async function competitorsRoutes(app: FastifyInstance): Promise<void> {
  // GET /v3/competitors — aggregated from USAspending awards table
  app.get('/v3/competitors', async (req, reply) => {
    const query = req.query as { q?: string; naics?: string; limit?: string };
    const limit = Math.min(Number(query.limit ?? 50), 200);

    const conditions: string[] = ['awardee_name IS NOT NULL', "awardee_name <> ''"];
    const params: unknown[] = [];

    if (query.q) {
      params.push(`%${query.q}%`);
      conditions.push(`awardee_name ILIKE $${params.length}`);
    }
    if (query.naics) {
      params.push(`${query.naics}%`);
      conditions.push(`naics ILIKE $${params.length}`);
    }

    params.push(limit);
    const sql = `
      SELECT
        awardee_name                                                    AS name,
        awardee_uei,
        count(*)::int                                                   AS win_count,
        sum(value_obligated)::numeric                                   AS total_obligated,
        max(value_obligated)::numeric                                   AS largest_award,
        max(award_date)                                                 AS last_win_date,
        array_agg(DISTINCT agency_name ORDER BY agency_name)
          FILTER (WHERE agency_name IS NOT NULL AND agency_name <> '') AS agencies,
        array_agg(DISTINCT naics ORDER BY naics)
          FILTER (WHERE naics IS NOT NULL AND naics <> '')             AS naics_codes,
        array_agg(DISTINCT set_aside ORDER BY set_aside)
          FILTER (WHERE set_aside IS NOT NULL
            AND set_aside NOT IN ('NONE', ''))                         AS set_asides,
        array_agg(DISTINCT contract_type ORDER BY contract_type)
          FILTER (WHERE contract_type IS NOT NULL
            AND contract_type <> '')                                   AS contract_types
      FROM awards
      WHERE ${conditions.join(' AND ')}
      GROUP BY awardee_name, awardee_uei
      ORDER BY win_count DESC
      LIMIT $${params.length}`;

    const { rows } = await pool.query(sql, params);
    return reply.send(successEnvelope({ items: rows, total: rows.length }, req.requestId));
  });

  // GET /v3/competitors/count
  app.get('/v3/competitors/count', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT count(DISTINCT awardee_name)::int AS count FROM awards WHERE awardee_name IS NOT NULL AND awardee_name <> ''`,
    );
    return reply.send(successEnvelope({ count: rows[0].count }, req.requestId));
  });
}
