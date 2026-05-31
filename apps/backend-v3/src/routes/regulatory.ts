/**
 * Regulatory notices routes — Federal Register surface (R1 source links).
 *
 * Endpoints:
 *   GET /v3/regulatory-notices — list with filters, cursor pagination
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope } from '../lib/envelope.js';

interface RegulatoryNoticeRow {
  id: number;
  document_number: string;
  title: string;
  agency_names: string[];
  publication_date: string;
  html_url: string;
  pdf_url: string | null;
  data_source: string;
}

interface RegulatoryNoticeItem {
  id: number;
  document_number: string;
  title: string;
  agency_names: string[];
  publication_date: string;
  html_url: string;
  pdf_url: string | null;
  data_source: string;
}

function rowToItem(row: RegulatoryNoticeRow): RegulatoryNoticeItem {
  return {
    id: row.id,
    document_number: row.document_number,
    title: row.title,
    agency_names: row.agency_names,
    publication_date: row.publication_date,
    html_url: row.html_url,
    pdf_url: row.pdf_url,
    data_source: row.data_source,
  };
}

export async function regulatoryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v3/regulatory-notices', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;

    const agency = query.agency;
    const publishedAfter = query.published_after;
    const publishedBefore = query.published_before;
    const rawLimit = query.limit ? Number(query.limit) : 50;
    const limit = Math.min(Math.max(rawLimit, 1), 200);
    const cursor = query.cursor;

    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIdx = 1;

    if (agency) {
      conditions.push(`$${paramIdx} = ANY(agency_names)`);
      params.push(agency);
      paramIdx++;
    }

    if (publishedAfter) {
      conditions.push(`publication_date >= $${paramIdx}`);
      params.push(publishedAfter);
      paramIdx++;
    }

    if (publishedBefore) {
      conditions.push(`publication_date <= $${paramIdx}`);
      params.push(publishedBefore);
      paramIdx++;
    }

    if (cursor) {
      const sep = cursor.indexOf('::');
      if (sep !== -1) {
        const cursorDate = cursor.substring(0, sep);
        const cursorId = Number(cursor.substring(sep + 2));
        conditions.push(`(publication_date, id) < ($${paramIdx}, $${paramIdx + 1})`);
        params.push(cursorDate, cursorId);
        paramIdx += 2;
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit + 1);
    const limitParam = `$${paramIdx}`;

    const sql = `SELECT id, document_number, title, agency_names, publication_date, html_url, pdf_url, data_source FROM regulatory_notices ${whereClause} ORDER BY publication_date DESC, id DESC LIMIT ${limitParam}`;

    const result = await pool.query<RegulatoryNoticeRow>(sql, params);
    const rows = result.rows;

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(rowToItem);
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem ? `${lastItem.publication_date}::${lastItem.id}` : null;

    return reply.status(200).send(
      successEnvelope(
        { items, next_cursor: nextCursor },
        req.requestId,
      ),
    );
  });

  app.get('/v3/regulatory-notices/count', async (req, reply) => {
    const result = await pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM regulatory_notices');
    const count = Number(result.rows[0].count);
    return reply.status(200).send(successEnvelope({ count }, req.requestId));
  });
}
