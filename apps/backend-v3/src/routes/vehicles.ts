/**
 * Vehicle routes — IDIQ contract vehicle tracking.
 * Lists vehicles, vehicle-tagged opportunities, manual link/unlink.
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope } from '../lib/envelope.js';

export async function vehicleRoutes(fastify: FastifyInstance): Promise<void> {

  // List all vehicles with opportunity counts
  fastify.get('/v3/vehicles', async (req, reply) => {
    const result = await pool.query(`
      SELECT
        cv.id,
        cv.name,
        cv.short_name,
        cv.contract_number,
        cv.vehicle_type,
        cv.agency,
        cv.naics_primary,
        cv.expiration_date,
        cv.ceiling_value,
        cv.is_active,
        cv.notes,
        COUNT(DISTINCT ovl.opportunity_id) FILTER (
          WHERE o.deleted_at IS NULL
        ) AS opportunity_count,
        COUNT(DISTINCT ovl.opportunity_id) FILTER (
          WHERE o.deleted_at IS NULL AND o.pipeline_stage IS NOT NULL
        ) AS pipeline_count
      FROM contract_vehicles cv
      LEFT JOIN opportunity_vehicle_links ovl ON ovl.vehicle_id = cv.id
      LEFT JOIN opportunities o ON o.id = ovl.opportunity_id
      WHERE cv.is_active = true
      GROUP BY cv.id
      ORDER BY cv.agency, cv.name
    `);
    return reply.send(successEnvelope(result.rows, req.requestId));
  });

  // Opportunities under a specific vehicle
  fastify.get('/v3/vehicles/:vehicleId/opportunities', async (req, reply) => {
    const { vehicleId } = req.params as { vehicleId: string };
    const result = await pool.query(
      `SELECT
        o.id, o.title, o.agency, o.naics, o.value_min, o.value_max,
        o.response_due_at, o.posted_at, o.pipeline_stage,
        o.set_aside, o.source_uri, ovl.match_type, ovl.match_evidence
      FROM opportunities o
      JOIN opportunity_vehicle_links ovl ON ovl.opportunity_id = o.id
      WHERE ovl.vehicle_id = $1
        AND o.deleted_at IS NULL
      ORDER BY o.response_due_at ASC NULLS LAST`,
      [vehicleId],
    );
    return reply.send(successEnvelope(result.rows, req.requestId));
  });

  // Manually link an opportunity to a vehicle
  fastify.post('/v3/vehicles/:vehicleId/opportunities/:oppId', async (req, reply) => {
    const { vehicleId, oppId } = req.params as { vehicleId: string; oppId: string };
    await pool.query(
      `INSERT INTO opportunity_vehicle_links (opportunity_id, vehicle_id, match_type, match_evidence)
       VALUES ($1, $2, 'manual', 'Manually linked by user')
       ON CONFLICT (opportunity_id, vehicle_id) DO NOTHING`,
      [oppId, vehicleId],
    );
    return reply.send(successEnvelope({ linked: true }, req.requestId));
  });

  // Remove a link
  fastify.delete('/v3/vehicles/:vehicleId/opportunities/:oppId', async (req, reply) => {
    const { vehicleId, oppId } = req.params as { vehicleId: string; oppId: string };
    await pool.query(
      `DELETE FROM opportunity_vehicle_links WHERE opportunity_id = $1 AND vehicle_id = $2`,
      [oppId, vehicleId],
    );
    return reply.send(successEnvelope({ unlinked: true }, req.requestId));
  });
}
