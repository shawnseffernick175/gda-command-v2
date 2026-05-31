/**
 * Awards routes — read-only surface for USAspending contract awards.
 *
 * Endpoints:
 *   GET /v3/awards       — list with filters, cursor pagination
 *   GET /v3/awards/count — total count for nav badge
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';

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
}

interface AwardItem {
  id: string;
  recipient_name: string | null;
  agency: string | null;
  contract_type: string | null;
  awarded_amount: number | null;
  awarded_at: string | null;
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

function rowToItem(row: AwardRow): AwardItem {
  return {
    id: String(row.id),
    recipient_name: row.awardee_name,
    agency: row.agency_name,
    contract_type: row.contract_type,
    awarded_amount: row.value_obligated !== null ? Number(row.value_obligated) : null,
    awarded_at: row.award_date,
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

    const conditions: string[] = ["data_source = 'usaspending'"];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters.agency) {
      conditions.push(`agency_name ILIKE $${paramIdx++}`);
      params.push(`%${filters.agency}%`);
    }
    if (filters.contract_type) {
      conditions.push(`contract_type ILIKE $${paramIdx++}`);
      params.push(`%${filters.contract_type}%`);
    }
    if (filters.awarded_after) {
      conditions.push(`award_date >= $${paramIdx++}`);
      params.push(filters.awarded_after);
    }
    if (filters.awarded_before) {
      conditions.push(`award_date <= $${paramIdx++}`);
      params.push(filters.awarded_before);
    }

    if (filters.cursor) {
      try {
        const decoded = JSON.parse(
          Buffer.from(filters.cursor, 'base64').toString('utf-8'),
        ) as { id: number };
        conditions.push(`id < $${paramIdx++}`);
        params.push(decoded.id);
      } catch {
        // invalid cursor, ignore
      }
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const sql = `SELECT id, piid, awardee_name, agency_name, contract_type, value_obligated, award_date, fpds_url, data_source FROM awards ${where} ORDER BY award_date DESC, id DESC LIMIT $${paramIdx}`;
    params.push(filters.limit + 1);

    const res = await pool.query<AwardRow>(sql, params);
    const rows = res.rows;

    const hasMore = rows.length > filters.limit;
    const items = hasMore ? rows.slice(0, filters.limit) : rows;

    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1]!;
      nextCursor = Buffer.from(JSON.stringify({ id: Number(lastItem.id) })).toString('base64');
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
