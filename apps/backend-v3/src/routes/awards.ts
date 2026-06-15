/**
 * Awards & Intel routes — wheelhouse-scoped competitive intelligence (#870).
 *
 * Endpoints:
 *   GET  /v3/awards                  — wheelhouse-filtered list, priority-scored, tabbed
 *   GET  /v3/awards/count            — wheelhouse count for nav badge
 *   GET  /v3/awards/kpis             — action-oriented KPI metrics
 *   GET  /v3/awards/:id              — single award detail with full analysis
 *   POST /v3/awards/:id/analyze      — AI "So What" analysis
 *   POST /v3/awards/:id/pursue       — create opportunity from award and link
 *   POST /v3/awards/:id/dismiss      — mark "Not Interested" with reason
 *   POST /v3/awards/:id/undismiss    — undo "Not Interested"
 *   GET  /v3/wheelhouse/naics        — list wheelhouse NAICS codes
 *   POST /v3/wheelhouse/naics        — add a NAICS code
 *   DELETE /v3/wheelhouse/naics/:code — remove a NAICS code
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import type { SourceRef } from '../lib/sources.js';
import { llmRouter } from '../lib/llm-router.js';
import type { AwardAnalysisOutput } from '../lib/llm-router.types.js';

/* ── Constants ─────────────────────────────────────────────────── */

const WHEELHOUSE_AGENCIES = [
  'Department of Defense',
  'Department of the Army',
  'Department of the Navy',
  'Department of the Air Force',
  'Department of Homeland Security',
  'General Services Administration',
  'National Aeronautics and Space Administration',
  'Department of Veterans Affairs',
  'Department of Health and Human Services',
];

const WHEELHOUSE_CONTRACT_TYPES = [
  'IDIQ', 'GWAC', 'DELIVERY ORDER', 'BPA', 'BPA CALL', 'TASK ORDER', 'DEFINITIVE CONTRACT',
];

const WHEELHOUSE_VALUE_MIN = 100_000;
const WHEELHOUSE_VALUE_MAX = 500_000_000;

/* ── Row / item types ──────────────────────────────────────────── */

interface AwardRow {
  id: string;
  piid: string;
  awardee_name: string | null;
  agency_name: string | null;
  contracting_office: string | null;
  contract_type: string | null;
  value_obligated: string | null;
  value_base_and_all_options: string | null;
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
  parent_award_id: string | null;
  award_analysis: AwardAnalysisOutput | null;
  award_analysis_run_at: string | null;
  incumbent_name: string | null;
  linked_opportunity_id: number | null;
  priority_score: number | null;
  not_interested: boolean;
  not_interested_at: string | null;
  dismissal_reason: string | null;
  dismissal_note: string | null;
}

interface AwardItem {
  id: string;
  piid: string;
  recipient_name: string | null;
  recipient_name_sources: SourceRef[];
  agency: string | null;
  agency_sources: SourceRef[];
  contracting_office: string | null;
  contract_type: string | null;
  contract_type_sources: SourceRef[];
  awarded_amount: number | null;
  awarded_amount_sources: SourceRef[];
  total_value: number | null;
  awarded_at: string | null;
  awarded_at_sources: SourceRef[];
  fpds_url: string | null;
  data_source: string;
  is_recompete_candidate: boolean;
  period_of_performance_end: string | null;
  days_to_pop_end: number | null;
  set_aside: string | null;
  naics: string | null;
  parent_award_id: string | null;
  award_analysis: AwardAnalysisOutput | null;
  award_analysis_run_at: string | null;
  incumbent_name: string | null;
  incumbent_name_sources: SourceRef[];
  linked_opportunity_id: number | null;
  priority_score: number | null;
  not_interested: boolean;
  not_interested_at: string | null;
  dismissal_reason: string | null;
  dismissal_note: string | null;
}

interface AwardsKpis {
  hot_recompetes: number;
  wheelhouse_awards: number;
  weak_incumbents: number;
  in_my_vehicles: number;
  already_pursuing: number;
}

/* ── Shared SQL fragments ──────────────────────────────────────── */

const SELECT_COLS = `a.id, a.piid, a.awardee_name, a.agency_name, a.contracting_office, a.contract_type,
  a.value_obligated, a.value_base_and_all_options, a.award_date, a.fpds_url, a.data_source,
  a.is_recompete_candidate, a.period_of_performance_end, a.set_aside, a.naics, a.parent_award_id,
  a.award_analysis, a.award_analysis_run_at, a.incumbent_name, a.linked_opportunity_id,
  a.priority_score, a.not_interested, a.not_interested_at,
  d.reason AS dismissal_reason, d.note AS dismissal_note,
  s.kind AS source_kind, s.title AS source_title, s.url AS source_url,
  s.retrieved_at AS source_retrieved_at`;

const FROM_CLAUSE = `FROM awards a
  LEFT JOIN sources s ON s.id = a.source_id
  LEFT JOIN award_dismissals d ON d.award_id = a.id`;

/**
 * Base wheelhouse WHERE clause. Filters to Envision's sweet spot.
 * Requires the `envision_wheelhouse_naics` table to be populated.
 */
function buildWheelhouseWhere(paramIdx: number, params: unknown[]): { clause: string; nextIdx: number } {
  const agencyPlaceholders = WHEELHOUSE_AGENCIES.map((_, i) => `$${paramIdx + i}`);
  params.push(...WHEELHOUSE_AGENCIES);
  let nextIdx = paramIdx + WHEELHOUSE_AGENCIES.length;

  const ctPlaceholders = WHEELHOUSE_CONTRACT_TYPES.map((_, i) => `$${nextIdx + i}`);
  params.push(...WHEELHOUSE_CONTRACT_TYPES);
  nextIdx += WHEELHOUSE_CONTRACT_TYPES.length;

  const clause = `a.data_source = 'usaspending'
    AND a.naics IN (SELECT naics FROM envision_wheelhouse_naics WHERE active = TRUE)
    AND a.value_obligated BETWEEN ${WHEELHOUSE_VALUE_MIN} AND ${WHEELHOUSE_VALUE_MAX}
    AND a.agency_name IN (${agencyPlaceholders.join(', ')})
    AND a.contract_type IN (${ctPlaceholders.join(', ')})
    AND a.period_of_performance_end IS NOT NULL
    AND a.period_of_performance_end >= CURRENT_DATE - INTERVAL '60 days'`;

  return { clause, nextIdx };
}

/* ── Helpers ───────────────────────────────────────────────────── */

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

function computeDaysLeft(popEnd: string | null): number | null {
  if (!popEnd) return null;
  const end = new Date(popEnd);
  const now = new Date();
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function rowToItem(row: AwardRow): AwardItem {
  const sources = buildSourceRef(row);
  return {
    id: String(row.id),
    piid: row.piid,
    recipient_name: row.awardee_name,
    recipient_name_sources: sources,
    agency: row.agency_name,
    agency_sources: sources,
    contracting_office: row.contracting_office,
    contract_type: row.contract_type,
    contract_type_sources: sources,
    awarded_amount: row.value_obligated !== null ? Number(row.value_obligated) : null,
    awarded_amount_sources: sources,
    total_value: row.value_base_and_all_options !== null ? Number(row.value_base_and_all_options) : null,
    awarded_at: row.award_date,
    awarded_at_sources: sources,
    fpds_url: row.fpds_url,
    data_source: row.data_source,
    is_recompete_candidate: row.is_recompete_candidate ?? false,
    period_of_performance_end: row.period_of_performance_end,
    days_to_pop_end: computeDaysLeft(row.period_of_performance_end),
    set_aside: row.set_aside,
    naics: row.naics,
    parent_award_id: row.parent_award_id,
    award_analysis: row.award_analysis,
    award_analysis_run_at: row.award_analysis_run_at,
    incumbent_name: row.incumbent_name,
    incumbent_name_sources: row.incumbent_name ? sources : [],
    linked_opportunity_id: row.linked_opportunity_id,
    priority_score: row.priority_score,
    not_interested: row.not_interested ?? false,
    not_interested_at: row.not_interested_at,
    dismissal_reason: row.dismissal_reason,
    dismissal_note: row.dismissal_note,
  };
}

/* ── Route registration ────────────────────────────────────────── */

export async function awardRoutes(app: FastifyInstance): Promise<void> {

  // ────────────────────────────────────────────────────────────────
  // GET /v3/awards — wheelhouse-filtered list with tabs + pagination
  // ────────────────────────────────────────────────────────────────
  app.get('/v3/awards', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;

    const rawLimit = query.limit ? Number(query.limit) : 50;
    const limit = Math.min(Math.max(rawLimit, 1), 200);
    const pageParam = query.page ? Math.max(Number(query.page), 1) : 1;
    const offset = (pageParam - 1) * limit;

    // Tab filter
    const tab = query.tab; // 'hot' | '90d' | '1yr' | 'weak' | 'vehicles' | 'pursuing' | 'excluded' | 'all'
    const search = query.search;
    const incumbentSearch = query.incumbent;
    const naicsFilter = query.naics;
    const valueMin = query.value_min ? Number(query.value_min) : undefined;
    const valueMax = query.value_max ? Number(query.value_max) : undefined;

    // Legacy support: map old tab params to new tab system
    const recompete = query.recompete;
    const hasIncumbent = query.has_incumbent === 'true';
    const pursuing = query.pursuing === 'true';

    const params: unknown[] = [];
    let paramIdx = 1;

    // For the "excluded" tab, show everything NOT in wheelhouse
    if (tab === 'excluded') {
      const conditions: string[] = ["a.data_source = 'usaspending'"];

      // Excluded = usaspending rows that FAIL the wheelhouse filter
      const agencyList = WHEELHOUSE_AGENCIES.map((_, i) => `$${paramIdx + i}`);
      params.push(...WHEELHOUSE_AGENCIES);
      paramIdx += WHEELHOUSE_AGENCIES.length;

      conditions.push(`(
        a.naics NOT IN (SELECT naics FROM envision_wheelhouse_naics WHERE active = TRUE)
        OR a.value_obligated < ${WHEELHOUSE_VALUE_MIN}
        OR a.value_obligated > ${WHEELHOUSE_VALUE_MAX}
        OR a.agency_name NOT IN (${agencyList.join(', ')})
        OR a.period_of_performance_end IS NULL
        OR a.period_of_performance_end < CURRENT_DATE - INTERVAL '60 days'
      )`);

      if (search) {
        conditions.push(`(a.awardee_name ILIKE $${paramIdx} OR a.agency_name ILIKE $${paramIdx} OR a.piid ILIKE $${paramIdx})`);
        params.push(`%${search}%`);
        paramIdx++;
      }

      const where = `WHERE ${conditions.join(' AND ')}`;
      const countSql = `SELECT COUNT(*)::int AS total FROM awards a ${where}`;
      const countRes = await pool.query<{ total: number }>(countSql, params);
      const total = countRes.rows[0]?.total ?? 0;
      const totalPages = Math.max(Math.ceil(total / limit), 1);

      const dataSql = `SELECT ${SELECT_COLS} ${FROM_CLAUSE} ${where}
        ORDER BY a.value_obligated DESC NULLS LAST, a.id DESC
        LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
      const dataParams = [...params, limit, offset];
      const res = await pool.query<AwardRow>(dataSql, dataParams);

      return reply.status(200).send(
        successEnvelope({ items: res.rows.map(rowToItem), total, page: pageParam, totalPages }, req.requestId),
      );
    }

    // Build wheelhouse base conditions
    const { clause: wheelhouseClause, nextIdx } = buildWheelhouseWhere(paramIdx, params);
    paramIdx = nextIdx;

    const conditions: string[] = [wheelhouseClause];

    // Tab-specific conditions
    if (tab === 'hot') {
      conditions.push(`a.priority_score >= 70`);
      conditions.push(`a.period_of_performance_end <= CURRENT_DATE + INTERVAL '365 days'`);
      conditions.push(`COALESCE(a.not_interested, FALSE) = FALSE`);
    } else if (tab === '90d' || recompete === '90d') {
      conditions.push(`a.period_of_performance_end BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'`);
      conditions.push(`COALESCE(a.not_interested, FALSE) = FALSE`);
    } else if (tab === '1yr' || recompete === '1yr') {
      conditions.push(`a.period_of_performance_end BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '365 days'`);
      conditions.push(`COALESCE(a.not_interested, FALSE) = FALSE`);
    } else if (tab === 'weak') {
      conditions.push(`(a.award_analysis->>'threat_level')::text = 'low'`);
      conditions.push(`a.period_of_performance_end <= CURRENT_DATE + INTERVAL '365 days'`);
      conditions.push(`COALESCE(a.not_interested, FALSE) = FALSE`);
    } else if (tab === 'vehicles') {
      conditions.push(`a.parent_award_id IN (SELECT contract_number FROM contract_vehicles WHERE is_active = TRUE AND contract_number IS NOT NULL)`);
      conditions.push(`COALESCE(a.not_interested, FALSE) = FALSE`);
    } else if (tab === 'pursuing' || pursuing) {
      conditions.push(`a.linked_opportunity_id IS NOT NULL`);
    } else {
      // 'all' or no tab — show all wheelhouse, exclude dismissed
      conditions.push(`COALESCE(a.not_interested, FALSE) = FALSE`);
    }

    // Legacy support
    if (hasIncumbent) {
      conditions.push(`a.incumbent_name IS NOT NULL`);
    }

    // Additional filters
    if (search) {
      conditions.push(`(a.awardee_name ILIKE $${paramIdx} OR a.agency_name ILIKE $${paramIdx} OR a.piid ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }
    if (incumbentSearch) {
      conditions.push(`a.incumbent_name ILIKE $${paramIdx}`);
      params.push(`%${incumbentSearch}%`);
      paramIdx++;
    }
    if (naicsFilter) {
      conditions.push(`a.naics ILIKE $${paramIdx}`);
      params.push(`%${naicsFilter}%`);
      paramIdx++;
    }
    if (valueMin !== undefined) {
      conditions.push(`a.value_obligated >= $${paramIdx}`);
      params.push(valueMin);
      paramIdx++;
    }
    if (valueMax !== undefined) {
      conditions.push(`a.value_obligated <= $${paramIdx}`);
      params.push(valueMax);
      paramIdx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    // Count
    const countSql = `SELECT COUNT(*)::int AS total FROM awards a ${where}`;
    const countRes = await pool.query<{ total: number }>(countSql, params);
    const total = countRes.rows[0]?.total ?? 0;
    const totalPages = Math.max(Math.ceil(total / limit), 1);

    // Data — sort by priority_score DESC for hot/default tabs
    const orderBy = (tab === 'hot' || !tab)
      ? 'a.priority_score DESC NULLS LAST, a.period_of_performance_end ASC NULLS LAST'
      : 'a.priority_score DESC NULLS LAST, a.award_date DESC, a.id DESC';

    const dataSql = `SELECT ${SELECT_COLS} ${FROM_CLAUSE} ${where}
      ORDER BY ${orderBy}
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    const dataParams = [...params, limit, offset];
    const res = await pool.query<AwardRow>(dataSql, dataParams);

    return reply.status(200).send(
      successEnvelope({ items: res.rows.map(rowToItem), total, page: pageParam, totalPages }, req.requestId),
    );
  });

  // ────────────────────────────────────────────────────────────────
  // GET /v3/awards/count — wheelhouse-scoped count for nav badge
  // ────────────────────────────────────────────────────────────────
  app.get('/v3/awards/count', async (req, reply) => {
    const params: unknown[] = [];
    const { clause } = buildWheelhouseWhere(1, params);

    const res = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM awards a WHERE ${clause} AND COALESCE(a.not_interested, FALSE) = FALSE`,
      params,
    );
    const count = Number(res.rows[0]?.count ?? 0);
    return reply.status(200).send(successEnvelope({ count }, req.requestId));
  });

  // ────────────────────────────────────────────────────────────────
  // GET /v3/awards/kpis — action-oriented KPI metrics
  // ────────────────────────────────────────────────────────────────
  app.get('/v3/awards/kpis', async (req, reply) => {
    const params: unknown[] = [];
    const { clause } = buildWheelhouseWhere(1, params);

    const kpiSql = `
      SELECT
        COUNT(*) FILTER (
          WHERE a.priority_score >= 70
          AND a.period_of_performance_end <= CURRENT_DATE + INTERVAL '365 days'
          AND COALESCE(a.not_interested, FALSE) = FALSE
        )::int AS hot_recompetes,
        COUNT(*) FILTER (
          WHERE COALESCE(a.not_interested, FALSE) = FALSE
        )::int AS wheelhouse_awards,
        COUNT(*) FILTER (
          WHERE (a.award_analysis->>'threat_level')::text = 'low'
          AND a.period_of_performance_end <= CURRENT_DATE + INTERVAL '365 days'
          AND COALESCE(a.not_interested, FALSE) = FALSE
        )::int AS weak_incumbents,
        COUNT(*) FILTER (
          WHERE a.parent_award_id IN (
            SELECT contract_number FROM contract_vehicles
            WHERE is_active = TRUE AND contract_number IS NOT NULL
          )
          AND COALESCE(a.not_interested, FALSE) = FALSE
        )::int AS in_my_vehicles,
        COUNT(*) FILTER (
          WHERE a.linked_opportunity_id IS NOT NULL
        )::int AS already_pursuing
      FROM awards a
      WHERE ${clause}
    `;

    const res = await pool.query<AwardsKpis>(kpiSql, params);
    const kpis: AwardsKpis = res.rows[0] ?? {
      hot_recompetes: 0,
      wheelhouse_awards: 0,
      weak_incumbents: 0,
      in_my_vehicles: 0,
      already_pursuing: 0,
    };

    return reply.status(200).send(successEnvelope(kpis, req.requestId));
  });

  // ────────────────────────────────────────────────────────────────
  // GET /v3/awards/:id — single award detail
  // ────────────────────────────────────────────────────────────────
  app.get('/v3/awards/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const { rows } = await pool.query<AwardRow>(
      `SELECT ${SELECT_COLS} ${FROM_CLAUSE} WHERE a.id = $1`,
      [id],
    );

    if (rows.length === 0) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Award not found', req.requestId));
    }

    const item = rowToItem(rows[0]);

    // Fetch vehicle fit info
    const vehicleRes = await pool.query<{ short_name: string; name: string; naics_primary: string | null }>(
      `SELECT short_name, name, naics_primary FROM contract_vehicles
       WHERE is_active = TRUE AND (
         naics_primary = $1
         OR contract_number = $2
       )`,
      [rows[0].naics, rows[0].parent_award_id],
    );

    return reply.status(200).send(
      successEnvelope({
        ...item,
        vehicle_fit: vehicleRes.rows.map(v => ({ short_name: v.short_name, name: v.name })),
      }, req.requestId),
    );
  });

  // ────────────────────────────────────────────────────────────────
  // POST /v3/awards/:id/analyze — AI So-What analysis
  // ────────────────────────────────────────────────────────────────
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

  // ────────────────────────────────────────────────────────────────
  // POST /v3/awards/:id/pursue — create opportunity from award
  // ────────────────────────────────────────────────────────────────
  app.post('/v3/awards/:id/pursue', async (req, reply) => {
    const { id } = req.params as { id: string };
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows } = await client.query<{
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
         FROM awards WHERE id = $1 FOR UPDATE`,
        [id],
      );

      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Award not found', req.requestId));
      }

      const award = rows[0];

      if (award.linked_opportunity_id) {
        await client.query('ROLLBACK');
        return reply.status(200).send(
          successEnvelope({ opportunity_id: award.linked_opportunity_id, already_linked: true }, req.requestId),
        );
      }

      const sourceResult = await client.query<{ id: string }>(
        `INSERT INTO sources (kind, title, retrieved_at)
         VALUES ('internal', 'Award pursuit', NOW()) RETURNING id`,
      );
      const sourceId = sourceResult.rows[0]!.id;

      const title = `Re-compete: ${award.awardee_name ?? 'Unknown'} — ${award.agency_name ?? 'Unknown Agency'} (${award.piid ?? 'N/A'})`;
      const valueNum = award.value_obligated !== null ? Number(award.value_obligated) : null;

      const oppResult = await client.query<{ id: number }>(
        `INSERT INTO opportunities (title, agency, naics, set_aside, value_min, value_max, data_source, source_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'manual', $7, NOW(), NOW())
         RETURNING id`,
        [title, award.agency_name, award.naics, award.set_aside, valueNum, valueNum, sourceId],
      );

      const oppId = oppResult.rows[0]?.id;
      if (!oppId) {
        await client.query('ROLLBACK');
        return reply.status(500).send(
          errorEnvelope('INTERNAL_ERROR', 'Failed to create opportunity', req.requestId),
        );
      }

      await client.query(
        `UPDATE awards SET linked_opportunity_id = $1, recompete_flagged_at = NOW() WHERE id = $2`,
        [oppId, id],
      );

      await client.query('COMMIT');

      return reply.status(201).send(
        successEnvelope({ opportunity_id: oppId, already_linked: false }, req.requestId),
      );
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // ────────────────────────────────────────────────────────────────
  // POST /v3/awards/:id/dismiss — "Not Interested" with reason
  // ────────────────────────────────────────────────────────────────
  app.post('/v3/awards/:id/dismiss', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { reason: string; note?: string } | undefined;

    if (!body?.reason) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'reason is required', req.requestId),
      );
    }

    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM awards WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Award not found', req.requestId));
    }

    await pool.query(
      `UPDATE awards SET not_interested = TRUE, not_interested_at = NOW() WHERE id = $1`,
      [id],
    );

    await pool.query(
      `INSERT INTO award_dismissals (award_id, reason, note)
       VALUES ($1, $2, $3)
       ON CONFLICT (award_id) DO UPDATE SET reason = $2, note = $3, created_at = NOW()`,
      [id, body.reason, body.note ?? null],
    );

    return reply.status(200).send(successEnvelope({ dismissed: true }, req.requestId));
  });

  // ────────────────────────────────────────────────────────────────
  // POST /v3/awards/:id/undismiss — undo "Not Interested"
  // ────────────────────────────────────────────────────────────────
  app.post('/v3/awards/:id/undismiss', async (req, reply) => {
    const { id } = req.params as { id: string };

    await pool.query(
      `UPDATE awards SET not_interested = FALSE, not_interested_at = NULL WHERE id = $1`,
      [id],
    );
    await pool.query(`DELETE FROM award_dismissals WHERE award_id = $1`, [id]);

    return reply.status(200).send(successEnvelope({ undismissed: true }, req.requestId));
  });

  // ────────────────────────────────────────────────────────────────
  // GET /v3/wheelhouse/naics — list wheelhouse NAICS codes
  // ────────────────────────────────────────────────────────────────
  app.get('/v3/wheelhouse/naics', async (req, reply) => {
    const { rows } = await pool.query<{
      naics: string;
      label: string | null;
      reason: string | null;
      active: boolean;
      created_at: string;
    }>(`SELECT naics, label, reason, active, created_at FROM envision_wheelhouse_naics ORDER BY naics`);

    return reply.status(200).send(successEnvelope({ items: rows }, req.requestId));
  });

  // ────────────────────────────────────────────────────────────────
  // POST /v3/wheelhouse/naics — add a NAICS code
  // ────────────────────────────────────────────────────────────────
  app.post('/v3/wheelhouse/naics', async (req, reply) => {
    const body = req.body as { naics: string; label?: string; reason?: string } | undefined;

    if (!body?.naics) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'naics code is required', req.requestId),
      );
    }

    await pool.query(
      `INSERT INTO envision_wheelhouse_naics (naics, label, reason)
       VALUES ($1, $2, $3)
       ON CONFLICT (naics) DO UPDATE SET label = $2, reason = $3, active = TRUE, updated_at = NOW()`,
      [body.naics, body.label ?? null, body.reason ?? null],
    );

    return reply.status(201).send(successEnvelope({ added: true, naics: body.naics }, req.requestId));
  });

  // ────────────────────────────────────────────────────────────────
  // DELETE /v3/wheelhouse/naics/:code — deactivate a NAICS code
  // ────────────────────────────────────────────────────────────────
  app.delete('/v3/wheelhouse/naics/:code', async (req, reply) => {
    const { code } = req.params as { code: string };

    const res = await pool.query(
      `UPDATE envision_wheelhouse_naics SET active = FALSE, updated_at = NOW() WHERE naics = $1`,
      [code],
    );

    if (res.rowCount === 0) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'NAICS code not found', req.requestId));
    }

    return reply.status(200).send(successEnvelope({ removed: true, naics: code }, req.requestId));
  });
}
