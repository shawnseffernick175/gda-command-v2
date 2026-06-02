/**
 * Audit log routes (F-442).
 *
 *   GET /v3/audit-log — paginated, filterable read of the unified audit trail.
 *
 * Same auth as sibling endpoints (JWT via authHook).
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope } from '../lib/envelope.js';
import { listAuditLog } from '../services/audit/audit-log.js';

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v3/audit-log', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;

    const result = await listAuditLog(pool, {
      table_name: query.table_name,
      record_id: query.record_id ? Number(query.record_id) : undefined,
      record_ref: query.record_ref,
      action: query.action,
      actor: query.actor,
      limit: query.limit ? Number(query.limit) : undefined,
      cursor: query.cursor,
    });

    return reply.status(200).send(successEnvelope(result, req.requestId));
  });
}
