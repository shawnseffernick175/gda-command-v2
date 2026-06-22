import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { logger } from '../lib/logger.js';
import { ENVISION_COMPANY_CONTEXT } from '../constants/envision-naics.js';

export async function competitorsRoutes(app: FastifyInstance): Promise<void> {
  // GET /v3/competitors — aggregated from USAspending awards table
  app.get('/v3/competitors', async (req, reply) => {
    const query = req.query as { q?: string; naics?: string; limit?: string; page?: string; sort_by?: string; sort_dir?: string };
    const limit = Math.min(Number(query.limit ?? 50), 200);
    const pageParam = query.page ? Number(query.page) : undefined;

    // Whitelist valid sort columns to prevent SQL injection
    const SORTABLE_COLUMNS: Record<string, string> = {
      name: 'name',
      win_count: 'win_count',
      total_obligated: 'total_obligated',
      largest_award: 'largest_award',
      last_win: 'last_win_date',
      last_win_date: 'last_win_date',
      agency_count: 'agency_count',
      naics_count: 'naics_count',
    };
    const sortCol = SORTABLE_COLUMNS[query.sort_by ?? ''] ?? 'win_count';
    const sortDir = query.sort_dir === 'asc' ? 'ASC' : 'DESC';
    const nullsClause = sortDir === 'ASC' ? 'NULLS FIRST' : 'NULLS LAST';
    const orderBy = `${sortCol} ${sortDir} ${nullsClause}`;

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
          a.awardee_name                                                  AS name,
          a.awardee_uei,
          count(*)::int                                                   AS win_count,
          sum(a.value_obligated)::numeric                                 AS total_obligated,
          max(a.value_obligated)::numeric                                 AS largest_award,
          max(a.award_date)                                               AS last_win_date,
          array_agg(DISTINCT a.agency_name ORDER BY a.agency_name)
            FILTER (WHERE a.agency_name IS NOT NULL AND a.agency_name <> '') AS agencies,
          count(DISTINCT a.agency_name)
            FILTER (WHERE a.agency_name IS NOT NULL AND a.agency_name <> '')::int AS agency_count,
          array_agg(DISTINCT a.naics ORDER BY a.naics)
            FILTER (WHERE a.naics IS NOT NULL AND a.naics <> '')          AS naics_codes,
          count(DISTINCT a.naics)
            FILTER (WHERE a.naics IS NOT NULL AND a.naics <> '')::int     AS naics_count,
          array_agg(DISTINCT a.set_aside ORDER BY a.set_aside)
            FILTER (WHERE a.set_aside IS NOT NULL
              AND a.set_aside NOT IN ('NONE', ''))                        AS set_asides,
          array_agg(DISTINCT a.contract_type ORDER BY a.contract_type)
            FILTER (WHERE a.contract_type IS NOT NULL
              AND a.contract_type <> '')                                  AS contract_types,
          cac.competitor_analysis
        FROM awards a
        LEFT JOIN competitor_analysis_cache cac ON cac.competitor_name = a.awardee_name
        WHERE ${whereClause.replace(/awardee_name/g, 'a.awardee_name').replace(/naics ILIKE/g, 'a.naics ILIKE')}
        GROUP BY a.awardee_name, a.awardee_uei, cac.competitor_analysis
        ORDER BY ${orderBy}
        LIMIT $${params.length - 1} OFFSET $${params.length}`;

      const { rows } = await pool.query(dataSql, params);

      // Fire-and-forget: trigger analysis for competitors missing it
      triggerMissingCompetitorAnalyses(rows as Array<{ name: string; competitor_analysis: unknown }>);

      return reply.send(successEnvelope({ items: rows, total, page, totalPages }, req.requestId));
    }

    params.push(limit);
    const sql = `
      SELECT
        a.awardee_name                                                  AS name,
        a.awardee_uei,
        count(*)::int                                                   AS win_count,
        sum(a.value_obligated)::numeric                                 AS total_obligated,
        max(a.value_obligated)::numeric                                 AS largest_award,
        max(a.award_date)                                               AS last_win_date,
        array_agg(DISTINCT a.agency_name ORDER BY a.agency_name)
          FILTER (WHERE a.agency_name IS NOT NULL AND a.agency_name <> '') AS agencies,
        count(DISTINCT a.agency_name)
          FILTER (WHERE a.agency_name IS NOT NULL AND a.agency_name <> '')::int AS agency_count,
        array_agg(DISTINCT a.naics ORDER BY a.naics)
          FILTER (WHERE a.naics IS NOT NULL AND a.naics <> '')          AS naics_codes,
        count(DISTINCT a.naics)
          FILTER (WHERE a.naics IS NOT NULL AND a.naics <> '')::int     AS naics_count,
        array_agg(DISTINCT a.set_aside ORDER BY a.set_aside)
          FILTER (WHERE a.set_aside IS NOT NULL
            AND a.set_aside NOT IN ('NONE', ''))                        AS set_asides,
        array_agg(DISTINCT a.contract_type ORDER BY a.contract_type)
          FILTER (WHERE a.contract_type IS NOT NULL
            AND a.contract_type <> '')                                  AS contract_types,
        cac.competitor_analysis
      FROM awards a
      LEFT JOIN competitor_analysis_cache cac ON cac.competitor_name = a.awardee_name
      WHERE ${whereClause.replace(/awardee_name/g, 'a.awardee_name').replace(/naics ILIKE/g, 'a.naics ILIKE')}
      GROUP BY a.awardee_name, a.awardee_uei, cac.competitor_analysis
      ORDER BY ${orderBy}
      LIMIT $${params.length}`;

    const { rows } = await pool.query(sql, params);

    // Fire-and-forget: trigger analysis for competitors missing it
    triggerMissingCompetitorAnalyses(rows as Array<{ name: string; competitor_analysis: unknown }>);

    return reply.send(successEnvelope({ items: rows, total: rows.length }, req.requestId));
  });

  // GET /v3/competitors/count
  app.get('/v3/competitors/count', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT count(DISTINCT awardee_name)::int AS count FROM awards WHERE awardee_name IS NOT NULL AND awardee_name <> ''`,
    );
    return reply.send(successEnvelope({ count: rows[0].count }, req.requestId));
  });

  // POST /v3/competitors/:name/analyze — F-607 AI competitor drill-in analysis
  app.post('/v3/competitors/:name/analyze', async (req, reply) => {
    const competitorName = decodeURIComponent((req.params as { name: string }).name);

    // Check cache (7-day TTL)
    const cacheResult = await pool.query(
      `SELECT competitor_analysis, competitor_analysis_run_at FROM competitor_analysis_cache
       WHERE competitor_name = $1 AND competitor_analysis IS NOT NULL AND expires_at > NOW()`,
      [competitorName],
    );
    if (cacheResult.rows.length > 0) {
      return reply.send(
        successEnvelope({ ...cacheResult.rows[0].competitor_analysis, from_cache: true }, req.requestId),
      );
    }

    // Query awards for competitor stats
    const statsResult = await pool.query(
      `SELECT
        count(*)::int AS win_count,
        coalesce(sum(value_obligated), 0)::numeric AS total_obligated,
        max(award_date) AS last_win_date,
        min(awardee_uei) AS awardee_uei,
        array_agg(DISTINCT agency_name ORDER BY agency_name)
          FILTER (WHERE agency_name IS NOT NULL AND agency_name <> '') AS agencies,
        array_agg(DISTINCT naics ORDER BY naics)
          FILTER (WHERE naics IS NOT NULL AND naics <> '') AS naics_codes,
        array_agg(DISTINCT set_aside ORDER BY set_aside)
          FILTER (WHERE set_aside IS NOT NULL AND set_aside NOT IN ('NONE', '')) AS set_asides,
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

    // Fetch re-compete contracts (period_of_performance_end within 18 months)
    const recompeteResult = await pool.query(
      `SELECT
        piid AS contract_id,
        piid AS title,
        coalesce(value_obligated, 0)::numeric AS value,
        period_of_performance_end AS expiration_date,
        agency_name AS agency
      FROM awards
      WHERE awardee_name = $1
        AND period_of_performance_end IS NOT NULL
        AND period_of_performance_end > NOW()
        AND period_of_performance_end <= NOW() + INTERVAL '18 months'
      ORDER BY period_of_performance_end ASC
      LIMIT 20`,
      [competitorName],
    );

    const recompeteContracts = recompeteResult.rows.map((r) => ({
      contract_id: r.contract_id ?? 'N/A',
      title: r.title ?? 'Untitled contract',
      value: Number(r.value),
      expiration_date: r.expiration_date ? new Date(r.expiration_date).toISOString().slice(0, 10) : 'Unknown',
      agency: r.agency ?? 'Unknown',
    }));

    const { llmRouter } = await import('../lib/llm-router.js');
    const result = await llmRouter.route({
      task: 'competitor_analysis',
      input: {
        competitor_name: competitorName,
        awardee_uei: stats.awardee_uei ?? null,
        win_count: stats.win_count,
        total_obligated: Number(stats.total_obligated),
        agencies: stats.agencies ?? [],
        naics_codes: stats.naics_codes ?? [],
        set_asides: stats.set_asides ?? [],
        contract_types: stats.contract_types ?? [],
        recompete_contracts: recompeteContracts,
        envision_context: ENVISION_COMPANY_CONTEXT,
      },
    });

    if (!result.ok) {
      return reply.status(502).send(
        errorEnvelope('INTERNAL_ERROR', result.error_message ?? 'LLM router failed', req.requestId),
      );
    }

    // Ensure recompete_contracts in output uses actual DB data (LLM may hallucinate)
    const analysis = {
      ...result.output,
      recompete_contracts: recompeteContracts,
    };

    // Upsert cache (7-day TTL)
    await pool.query(
      `INSERT INTO competitor_analysis_cache (competitor_name, competitor_analysis, competitor_analysis_run_at, expires_at)
       VALUES ($1, $2, NOW(), NOW() + INTERVAL '7 days')
       ON CONFLICT (competitor_name)
       DO UPDATE SET competitor_analysis = $2, competitor_analysis_run_at = NOW(), expires_at = NOW() + INTERVAL '7 days'`,
      [competitorName, JSON.stringify(analysis)],
    );

    return reply.send(
      successEnvelope({ ...analysis, from_cache: false }, req.requestId),
    );
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
        envision_context: ENVISION_COMPANY_CONTEXT,
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

  // POST /v3/competitors/by-id/:id/analyze — admin endpoint to trigger analysis for a single competitor by DB id
  app.post('/v3/competitors/by-id/:id/analyze', async (req, reply) => {
    const competitorId = (req.params as { id: string }).id;

    // Look up competitor name from competitor_analysis_cache or awards table
    const lookupResult = await pool.query<{ awardee_name: string }>(
      `SELECT DISTINCT awardee_name FROM awards WHERE id = $1 LIMIT 1`,
      [competitorId],
    );

    let competitorName: string;
    if (lookupResult.rows.length > 0) {
      competitorName = lookupResult.rows[0].awardee_name;
    } else {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', `No award found with id: ${competitorId}`, req.requestId),
      );
    }

    void runCompetitorAnalysis(competitorName).catch((err) => {
      logger.warn({ err, competitorName }, 'admin_competitor_analysis_failed');
    });

    return reply.status(202).send(
      successEnvelope({ status: 'accepted', competitor_name: competitorName }, req.requestId),
    );
  });

  // POST /v3/competitors/discover-contacts — discover competitor contacts via web search
  app.post('/v3/competitors/discover-contacts', async (req, reply) => {
    const body = req.body as {
      limit?: number;
      max_contacts?: number;
      competitors?: string[];
    } | null;

    const { discoverCompetitorContacts } = await import(
      '../services/contacts/competitor-discovery.js'
    );

    try {
      const result = await discoverCompetitorContacts({
        limit: body?.limit ?? 25,
        max_contacts: body?.max_contacts ?? 5,
        competitors: body?.competitors,
      });
      return reply.send(successEnvelope(result, req.requestId));
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        'discover_contacts_route_error',
      );
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', 'Contact discovery failed', req.requestId),
      );
    }
  });
}

async function runCompetitorAnalysis(competitorName: string): Promise<void> {
  const statsResult = await pool.query<{
    win_count: number;
    total_obligated: number;
    awardee_uei: string | null;
    agencies: string[] | null;
    naics_codes: string[] | null;
    set_asides: string[] | null;
    contract_types: string[] | null;
  }>(
    `SELECT
      count(*)::int AS win_count,
      coalesce(sum(value_obligated), 0)::numeric AS total_obligated,
      max(awardee_uei) AS awardee_uei,
      array_agg(DISTINCT agency_name ORDER BY agency_name)
        FILTER (WHERE agency_name IS NOT NULL AND agency_name <> '') AS agencies,
      array_agg(DISTINCT naics ORDER BY naics)
        FILTER (WHERE naics IS NOT NULL AND naics <> '') AS naics_codes,
      array_agg(DISTINCT set_aside ORDER BY set_aside)
        FILTER (WHERE set_aside IS NOT NULL AND set_aside NOT IN ('NONE', '')) AS set_asides,
      array_agg(DISTINCT contract_type ORDER BY contract_type)
        FILTER (WHERE contract_type IS NOT NULL AND contract_type <> '') AS contract_types
    FROM awards
    WHERE awardee_name = $1`,
    [competitorName],
  );

  const stats = statsResult.rows[0];
  if (!stats || stats.win_count === 0) return;

  // Fetch recompete contracts for this competitor
  const recompeteResult = await pool.query<{
    piid: string;
    agency_name: string;
    value_base_and_all_options: number;
    period_of_performance_end: string;
  }>(
    `SELECT piid, agency_name, COALESCE(value_base_and_all_options, 0)::numeric AS value_base_and_all_options,
            period_of_performance_end::text
     FROM awards
     WHERE awardee_name = $1 AND is_recompete_candidate = true
     ORDER BY period_of_performance_end ASC
     LIMIT 10`,
    [competitorName],
  );

  const { llmRouter } = await import('../lib/llm-router.js');
  const result = await llmRouter.route({
    task: 'competitor_analysis',
    input: {
      competitor_name: competitorName,
      awardee_uei: stats.awardee_uei ?? null,
      win_count: stats.win_count,
      total_obligated: Number(stats.total_obligated),
      agencies: stats.agencies ?? [],
      naics_codes: stats.naics_codes ?? [],
      set_asides: stats.set_asides ?? [],
      contract_types: stats.contract_types ?? [],
      recompete_contracts: recompeteResult.rows.map((r) => ({
        contract_id: r.piid,
        title: r.piid,
        value: Number(r.value_base_and_all_options),
        expiration_date: r.period_of_performance_end,
        agency: r.agency_name ?? '',
      })),
      envision_context: ENVISION_COMPANY_CONTEXT,
    },
  });

  if (!result.ok) {
    logger.warn({ competitorName, error: result.error_message }, 'competitor_analysis_llm_failed');
    return;
  }

  await pool.query(
    `INSERT INTO competitor_analysis_cache (competitor_name, competitor_analysis, competitor_analysis_run_at, expires_at)
     VALUES ($1, $2, NOW(), NOW() + INTERVAL '7 days')
     ON CONFLICT (competitor_name)
     DO UPDATE SET competitor_analysis = $2, competitor_analysis_run_at = NOW(), expires_at = NOW() + INTERVAL '7 days'`,
    [competitorName, JSON.stringify(result.output)],
  );

  logger.info({ competitorName }, 'competitor_analysis_generated');
}

const inflightCompetitorAnalyses = new Set<string>();

function triggerMissingCompetitorAnalyses(rows: Array<{ name: string; competitor_analysis: unknown }>): void {
  const missing = rows.filter((r) => r.competitor_analysis == null && !inflightCompetitorAnalyses.has(r.name)).slice(0, 5);
  for (const row of missing) {
    inflightCompetitorAnalyses.add(row.name);
    void runCompetitorAnalysis(row.name)
      .catch((err) => {
        logger.warn({ err, competitor: row.name }, 'background_competitor_analysis_failed');
      })
      .finally(() => {
        inflightCompetitorAnalyses.delete(row.name);
      });
  }
}
