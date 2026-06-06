/**
 * Awards routes — re-compete radar, incumbent tracker, AI so-what (F-626).
 *
 * Endpoints:
 *   GET  /v3/awards              — list with filters, cursor/page pagination + meta
 *   GET  /v3/awards/count        — total count for nav badge
 *   POST /v3/awards/:id/analyze  — AI "So What" analysis (F-608 + F-626 prompt)
 *   POST /v3/awards/:id/pursue   — create opportunity from award and link
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import type { SourceRef } from '../lib/sources.js';
import { llmRouter } from '../lib/llm-router.js';
import type { AwardAnalysisOutput } from '../lib/llm-router.types.js';

interface AwardRow {
  id: string;
  piid: string;
  awardee_name: string | null;
  agency_name: string | null;
  contract_type: string | null;
  value_obligated: string | null;
  award_date: string | null;
  fpds_url: string | null;
  data_source: string;
  source_kind: string | null;
  source_title: string | null;
  source_url: string | null;
  source_retrieved_at: string | null;
  is_recompete_candidate: boolean;
  period_of_performance_end: string | null;
  set_aside: string | null;
  naics: string | null;
  award_analysis: AwardAnalysisOutput | null;
  award_analysis_run_at: string | null;
  incumbent_name: string | null;
  linked_opportunity_id: number | null;
}

interface AwardItem {
  id: string;
  recipient_name: string | null;
  recipient_name_sources: SourceRef[];
  agency: string | null;
  agency_sources: SourceRef[];
  contract_type: string | null;
  contract_type_sources: SourceRef[];
  awarded_amount: number | null;
  awarded_amount_sources: SourceRef[];
  awarded_at: string | null;
  awarded_at_sources: SourceRef[];
  fpds_url: string | null;
  data_source: string;
  is_recompete_candidate: boolean;
  period_of_performance_end: string | null;
  set_aside: string | null;
  naics: string | null;
  award_analysis: AwardAnalysisOutput | null;
  award_analysis_run_at: string | null;
  incumbent_name: string | null;
  linked_opportunity_id: number | null;
}

interface AwardListFilters {
  agency?: string;
  contract_type?: string;
  awarded_after?: string;
  awarded_before?: string;
  limit: number;
  cursor?: string;
}

interface AwardsMeta {
  total_count: number;
  expiring_90d: number;
  expiring_1yr: number;
  total_value: number;
  incumbents_identified: number;
}

const SELECT_COLS = `a.id, a.piid, a.awardee_name, a.agency_name, a.contract_type,
  a.value_obligated, a.award_date, a.fpds_url, a.data_source,
  a.is_recompete_candidate, a.period_of_performance_end, a.set_aside, a.naics,
  a.award_analysis, a.award_analysis_run_at, a.incumbent_name, a.linked_opportunity_id,
  s.kind AS source_kind, s.title AS source_title, s.url AS source_url,
  s.retrieved_at AS source_retrieved_at`;

function buildSourceRef(row: AwardRow): SourceRef[] {
  const url = row.fpds_url ?? row.source_url;
  if (!url) return [];
  return [{
    kind: (row.source_kind as SourceRef['kind']) ?? 'usaspending',
    title: row.source_title ?? 'USAspending.gov',
    url,
    retrieved_at: row.source_retrieved_at
      ? new Date(row.source_retrieved_at).toISOString()
      : new Date().toISOString(),
  }];
}

function rowToItem(row: AwardRow): AwardItem {
  const sources = buildSourceRef(row);
  return {
    id: String(row.id),
    recipient_name: row.awardee_name,
    recipient_name_sources: sources,
    agency: row.agency_name,
    agency_sources: sources,
    contract_type: row.contract_type,
    contract_type_sources: sources,
    awarded_amount: row.value_obligated !== null ? Number(row.value_obligated) : null,
    awarded_amount_sources: sources,
    awarded_at: row.award_date,
    awarded_at_sources: sources,
    fpds_url: row.fpds_url,
    data_source: row.data_source,
    is_recompete_candidate: row.is_recompete_candidate ?? false,
    period_of_performance_end: row.period_of_performance_end,
    set_aside: row.set_aside,
    naics: row.naics,
    award_analysis: row.award_analysis,
    award_analysis_run_at: row.award_analysis_run_at,
    incumbent_name: row.incumbent_name,
    linked_opportunity_id: row.linked_opportunity_id,
  };
}

export async function awardRoutes(app: FastifyInstance): Promise<void> {
  // GET /v3/awards — list with filters, page pagination, intelligence-bar meta
  app.get('/v3/awards', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;

    const rawLimit = query.limit ? Number(query.limit) : 50;
    const filters: AwardListFilters = {
      agency: query.agency,
      contract_type: query.contract_type,
      awarded_after: query.awarded_after,
      awarded_before: query.awarded_before,
      limit: Math.min(Math.max(rawLimit, 1), 200),
      cursor: query.cursor,
    };

    const pageParam = query.page ? Number(query.page) : undefined;

    // F-626 filter params
    const recompete = query.recompete; // '90d' | '1yr'
    const hasIncumbent = query.has_incumbent === 'true';
    const pursuing = query.pursuing === 'true';
    const incumbentSearch = query.incumbent;
    const valueMin = query.value_min ? Number(query.value_min) : undefined;
    const valueMax = query.value_max ? Number(query.value_max) : undefined;
    const naicsFilter = query.naics;
    const search = query.search;

    const conditions: string[] = ["a.data_source = 'usaspending'"];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters.agency) {
      conditions.push(`a.agency_name ILIKE $${paramIdx++}`);
      params.push(`%${filters.agency}%`);
    }
    if (filters.contract_type) {
      conditions.push(`a.contract_type ILIKE $${paramIdx++}`);
      params.push(`%${filters.contract_type}%`);
    }
    if (filters.awarded_after) {
      conditions.push(`a.award_date >= $${paramIdx++}`);
      params.push(filters.awarded_after);
    }
    if (filters.awarded_before) {
      conditions.push(`a.award_date <= $${paramIdx++}`);
      params.push(filters.awarded_before);
    }

    // F-626 re-compete window filters
    if (recompete === '90d') {
      conditions.push(`a.period_of_performance_end BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'`);
    } else if (recompete === '1yr') {
      conditions.push(`a.period_of_performance_end BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '365 days'`);
    }
    if (hasIncumbent) {
      conditions.push(`a.incumbent_name IS NOT NULL`);
    }
    if (pursuing) {
      conditions.push(`a.linked_opportunity_id IS NOT NULL`);
    }
    if (incumbentSearch) {
      conditions.push(`a.incumbent_name ILIKE $${paramIdx++}`);
      params.push(`%${incumbentSearch}%`);
    }
    if (valueMin !== undefined) {
      conditions.push(`a.value_obligated >= $${paramIdx++}`);
      params.push(valueMin);
    }
    if (valueMax !== undefined) {
      conditions.push(`a.value_obligated <= $${paramIdx++}`);
      params.push(valueMax);
    }
    if (naicsFilter) {
      conditions.push(`a.naics ILIKE $${paramIdx++}`);
      params.push(`%${naicsFilter}%`);
    }
    if (search) {
      conditions.push(`(a.awardee_name ILIKE $${paramIdx} OR a.agency_name ILIKE $${paramIdx} OR a.piid ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    if (pageParam) {
      const page = Math.max(pageParam, 1);
      const offset = (page - 1) * filters.limit;

      const countSql = `SELECT COUNT(*)::int AS total FROM awards a ${where}`;
      const countRes = await pool.query<{ total: number }>(countSql, params);
      const total = countRes.rows[0]?.total ?? 0;
      const totalPages = Math.max(Math.ceil(total / filters.limit), 1);

      const dataSql = `SELECT ${SELECT_COLS} FROM awards a LEFT JOIN sources s ON s.id = a.source_id ${where} ORDER BY a.is_recompete_candidate DESC, a.award_date DESC, a.id DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
      const dataParams = [...params, filters.limit, offset];
      const res = await pool.query<AwardRow>(dataSql, dataParams);

      // F-626 intelligence bar meta — computed from the base set (usaspending only)
      const metaSql = `
        SELECT
          COUNT(*)::int AS total_count,
          COUNT(*) FILTER (WHERE period_of_performance_end BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days')::int AS expiring_90d,
          COUNT(*) FILTER (WHERE period_of_performance_end BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '365 days')::int AS expiring_1yr,
          COALESCE(SUM(value_obligated), 0)::float AS total_value,
          COUNT(*) FILTER (WHERE incumbent_name IS NOT NULL)::int AS incumbents_identified
        FROM awards a
        WHERE a.data_source = 'usaspending'
      `;
      const metaRes = await pool.query<AwardsMeta>(metaSql);
      const meta: AwardsMeta = metaRes.rows[0] ?? {
        total_count: 0,
        expiring_90d: 0,
        expiring_1yr: 0,
        total_value: 0,
        incumbents_identified: 0,
      };

      // Count pursuing (linked opportunity exists)
      const pursuingCountSql = `SELECT COUNT(*)::int AS cnt FROM awards WHERE data_source = 'usaspending' AND linked_opportunity_id IS NOT NULL`;
      const pursuingRes = await pool.query<{ cnt: number }>(pursuingCountSql);
      const pursuingCount = pursuingRes.rows[0]?.cnt ?? 0;

      return reply.status(200).send(
        successEnvelope({
          items: res.rows.map(rowToItem),
          total,
          page,
          totalPages,
          meta: { ...meta, pursuing_count: pursuingCount },
        }, req.requestId),
      );
    }

    // Cursor-based fallback
    if (filters.cursor) {
      try {
        const decoded = JSON.parse(
          Buffer.from(filters.cursor, 'base64').toString('utf-8'),
        ) as { award_date: string; id: number };
        conditions.push(`(a.award_date < $${paramIdx} OR (a.award_date = $${paramIdx} AND a.id < $${paramIdx + 1}))`);
        params.push(decoded.award_date);
        paramIdx++;
        params.push(decoded.id);
        paramIdx++;
      } catch {
        // invalid cursor, ignore
      }
    }

    const sql = `SELECT ${SELECT_COLS} FROM awards a LEFT JOIN sources s ON s.id = a.source_id ${where} ORDER BY a.award_date DESC, a.id DESC LIMIT $${paramIdx}`;
    params.push(filters.limit + 1);

    const res = await pool.query<AwardRow>(sql, params);
    const rows = res.rows;

    const hasMore = rows.length > filters.limit;
    const items = hasMore ? rows.slice(0, filters.limit) : rows;

    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1]!;
      nextCursor = Buffer.from(JSON.stringify({ award_date: lastItem.award_date, id: Number(lastItem.id) })).toString('base64');
    }

    return reply.status(200).send(
      successEnvelope(
        {
          items: items.map(rowToItem),
          next_cursor: nextCursor,
        },
        req.requestId,
      ),
    );
  });

  // GET /v3/awards/count
  app.get('/v3/awards/count', async (req, reply) => {
    const res = await pool.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM awards WHERE data_source = 'usaspending'",
    );
    const count = Number(res.rows[0]?.count ?? 0);
    return reply.status(200).send(successEnvelope({ count }, req.requestId));
  });

  // POST /v3/awards/:id/analyze — AI So-What with F-626 analyst prompt + regulatory context
  app.post('/v3/awards/:id/analyze', async (req, reply) => {
    const { id } = req.params as { id: string };

    const { rows } = await pool.query<{
      id: string;
      piid: string | null;
      awardee_name: string | null;
      agency_name: string | null;
      naics: string | null;
      set_aside: string | null;
      contract_type: string | null;
      value_obligated: string | null;
      award_date: string | null;
      period_of_performance_end: string | null;
      award_analysis: AwardAnalysisOutput | null;
      incumbent_name: string | null;
      psc: string | null;
    }>(
      `SELECT id, piid, awardee_name, agency_name, naics, set_aside, contract_type,
              value_obligated, award_date, period_of_performance_end, award_analysis,
              incumbent_name, psc
       FROM awards WHERE id = $1`,
      [id],
    );

    if (rows.length === 0) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Award not found', req.requestId));
    }

    const award = rows[0];

    if (award.award_analysis) {
      return reply.status(200).send(successEnvelope(award.award_analysis, req.requestId));
    }

    const result = await llmRouter.route({
      task: 'award_analysis',
      input: {
        award_id: String(award.id),
        recipient_name: award.awardee_name,
        agency_name: award.agency_name,
        naics: award.naics,
        set_aside: award.set_aside,
        contract_type: award.contract_type,
        value_obligated: award.value_obligated !== null ? Number(award.value_obligated) : null,
        award_date: award.award_date,
        period_of_performance_end: award.period_of_performance_end,
      },
      opts: { object_ref: `award:${id}` },
    });

    if (!result.ok) {
      return reply.status(502).send(
        errorEnvelope('ANALYSIS_TIMEOUT', 'Award analysis failed', req.requestId, result.error_message),
      );
    }

    const analysis = result.output as AwardAnalysisOutput;

    await pool.query(
      `UPDATE awards SET award_analysis = $1, award_analysis_run_at = NOW() WHERE id = $2`,
      [JSON.stringify(analysis), id],
    );

    return reply.status(200).send(successEnvelope(analysis, req.requestId));
  });

  // POST /v3/awards/:id/pursue — create opportunity from award, link back
  app.post('/v3/awards/:id/pursue', async (req, reply) => {
    const { id } = req.params as { id: string };

    const { rows } = await pool.query<{
      id: string;
      piid: string | null;
      awardee_name: string | null;
      agency_name: string | null;
      naics: string | null;
      value_obligated: string | null;
      set_aside: string | null;
      linked_opportunity_id: number | null;
    }>(
      `SELECT id, piid, awardee_name, agency_name, naics, value_obligated, set_aside, linked_opportunity_id
       FROM awards WHERE id = $1`,
      [id],
    );

    if (rows.length === 0) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Award not found', req.requestId));
    }

    const award = rows[0];

    // Already linked — return existing opportunity
    if (award.linked_opportunity_id) {
      return reply.status(200).send(
        successEnvelope({ opportunity_id: award.linked_opportunity_id, already_linked: true }, req.requestId),
      );
    }

    // Create opportunity from award
    const title = `Re-compete: ${award.awardee_name ?? 'Unknown'} — ${award.agency_name ?? 'Unknown Agency'} (${award.piid ?? 'N/A'})`;
    const valueNum = award.value_obligated !== null ? Number(award.value_obligated) : null;

    const oppResult = await pool.query<{ id: number }>(
      `INSERT INTO opportunities (title, agency, naics, set_aside, value_min, value_max, source, data_source, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'award_pursuit', 'manual', NOW(), NOW())
       RETURNING id`,
      [title, award.agency_name, award.naics, award.set_aside, valueNum, valueNum, ],
    );

    const oppId = oppResult.rows[0]?.id;
    if (!oppId) {
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', 'Failed to create opportunity', req.requestId),
      );
    }

    // Link award to opportunity
    await pool.query(
      `UPDATE awards SET linked_opportunity_id = $1, recompete_flagged_at = NOW() WHERE id = $2`,
      [oppId, id],
    );

    return reply.status(201).send(
      successEnvelope({ opportunity_id: oppId, already_linked: false }, req.requestId),
    );
  });
}
