/**
 * Awards routes — read-only surface for USAspending contract awards.
 *
 * Endpoints:
 *   GET /v3/awards       — list with filters, cursor pagination
 *   GET /v3/awards/count — total count for nav badge
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope } from '../lib/envelope.js';
import type { SourceRef } from '../lib/sources.js';

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
}

interface AwardListFilters {
  agency?: string;
  contract_type?: string;
  awarded_after?: string;
  awarded_before?: string;
  limit: number;
  cursor?: string;
}

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
  };
}

export async function awardRoutes(app: FastifyInstance): Promise<void> {
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

    const where = `WHERE ${conditions.join(' AND ')}`;

    if (pageParam) {
      const page = Math.max(pageParam, 1);
      const offset = (page - 1) * filters.limit;

      const countSql = `SELECT COUNT(*)::int AS total FROM awards a ${where}`;
      const countRes = await pool.query<{ total: number }>(countSql, params);
      const total = countRes.rows[0]?.total ?? 0;
      const totalPages = Math.max(Math.ceil(total / filters.limit), 1);

      const dataSql = `SELECT a.id, a.piid, a.awardee_name, a.agency_name, a.contract_type, a.value_obligated, a.award_date, a.fpds_url, a.data_source, s.kind AS source_kind, s.title AS source_title, s.url AS source_url, s.retrieved_at AS source_retrieved_at FROM awards a LEFT JOIN sources s ON s.id = a.source_id ${where} ORDER BY a.award_date DESC, a.id DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
      const dataParams = [...params, filters.limit, offset];
      const res = await pool.query<AwardRow>(dataSql, dataParams);

      return reply.status(200).send(
        successEnvelope({ items: res.rows.map(rowToItem), total, page, totalPages }, req.requestId),
      );
    }

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

    const sql = `SELECT a.id, a.piid, a.awardee_name, a.agency_name, a.contract_type, a.value_obligated, a.award_date, a.fpds_url, a.data_source, s.kind AS source_kind, s.title AS source_title, s.url AS source_url, s.retrieved_at AS source_retrieved_at FROM awards a LEFT JOIN sources s ON s.id = a.source_id ${where} ORDER BY a.award_date DESC, a.id DESC LIMIT $${paramIdx}`;
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

  app.get('/v3/awards/count', async (req, reply) => {
    const res = await pool.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM awards WHERE data_source = 'usaspending'",
    );
    const count = Number(res.rows[0]?.count ?? 0);
    return reply.status(200).send(successEnvelope({ count }, req.requestId));
  });
}
