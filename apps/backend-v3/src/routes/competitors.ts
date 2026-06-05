import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';

export async function competitorsRoutes(app: FastifyInstance): Promise<void> {
  // GET /v3/competitors — aggregated from USAspending awards table
  app.get('/v3/competitors', async (req, reply) => {
    const query = req.query as { q?: string; naics?: string; limit?: string; page?: string };
    const limit = Math.min(Number(query.limit ?? 50), 200);
    const pageParam = query.page ? Number(query.page) : undefined;

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

    const whereClause = conditions.join(' AND ');

    if (pageParam) {
      const page = Math.max(pageParam, 1);
      const offset = (page - 1) * limit;

      const countSql = `
        SELECT COUNT(*) ::int AS total FROM (
          SELECT awardee_name FROM awards WHERE ${whereClause} GROUP BY awardee_name, awardee_uei
        ) sub`;
      const countRes = await pool.query<{ total: number }>(countSql, params);
      const total = countRes.rows[0]?.total ?? 0;
      const totalPages = Math.max(Math.ceil(total / limit), 1);

      params.push(limit);
      params.push(offset);
      const dataSql = `
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
        WHERE ${whereClause}
        GROUP BY awardee_name, awardee_uei
        ORDER BY win_count DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`;

      const { rows } = await pool.query(dataSql, params);
      return reply.send(successEnvelope({ items: rows, total, page, totalPages }, req.requestId));
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
      WHERE ${whereClause}
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

  // POST /v3/competitors/:name/black-hat — on-demand Black Hat Analysis
  app.post('/v3/competitors/:name/black-hat', async (req, reply) => {
    const competitorName = decodeURIComponent((req.params as { name: string }).name);

    // Check cache
    const cacheResult = await pool.query(
      `SELECT analysis, generated_at FROM competitor_black_hat_cache
       WHERE competitor_name = $1 AND expires_at > NOW()`,
      [competitorName],
    );
    if (cacheResult.rows.length > 0) {
      return reply.send(
        successEnvelope({ ...cacheResult.rows[0].analysis, from_cache: true }, req.requestId),
      );
    }

    // Query awards for competitor stats
    const statsResult = await pool.query(
      `SELECT
        count(*)::int AS win_count,
        coalesce(sum(value_obligated), 0)::numeric AS total_obligated,
        array_agg(DISTINCT agency_name ORDER BY agency_name)
          FILTER (WHERE agency_name IS NOT NULL AND agency_name <> '') AS agencies,
        array_agg(DISTINCT naics ORDER BY naics)
          FILTER (WHERE naics IS NOT NULL AND naics <> '') AS naics_codes,
        array_agg(DISTINCT contract_type ORDER BY contract_type)
          FILTER (WHERE contract_type IS NOT NULL AND contract_type <> '') AS contract_types
      FROM awards
      WHERE awardee_name = $1`,
      [competitorName],
    );

    const stats = statsResult.rows[0];
    if (!stats || stats.win_count === 0) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', `No awards found for competitor: ${competitorName}`, req.requestId),
      );
    }

    const { llmRouter } = await import('../lib/llm-router.js');
    const result = await llmRouter.route({
      task: 'black_hat_analysis',
      input: {
        competitor_name: competitorName,
        competitor_wins: stats.win_count,
        competitor_total_obligated: Number(stats.total_obligated),
        competitor_agencies: stats.agencies ?? [],
        competitor_naics: stats.naics_codes ?? [],
        competitor_contract_types: stats.contract_types ?? [],
        envision_context: 'Envision is a small business IT/consulting firm competing for federal contracts. NAICS: 541511, 541512, 541519, 541690. Certified 8(a) eligible, specializes in digital transformation and data analytics.',
      },
    });

    if (!result.ok) {
      return reply.status(502).send(
        errorEnvelope('INTERNAL_ERROR', result.error_message ?? 'LLM router failed', req.requestId),
      );
    }

    // Upsert cache
    await pool.query(
      `INSERT INTO competitor_black_hat_cache (competitor_name, analysis, generated_at, expires_at)
       VALUES ($1, $2, NOW(), NOW() + INTERVAL '7 days')
       ON CONFLICT (competitor_name)
       DO UPDATE SET analysis = $2, generated_at = NOW(), expires_at = NOW() + INTERVAL '7 days'`,
      [competitorName, JSON.stringify(result.output)],
    );

    return reply.send(
      successEnvelope({ ...result.output, from_cache: false }, req.requestId),
    );
  });
}
