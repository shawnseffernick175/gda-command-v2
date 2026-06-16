/**
 * Vehicle routes — IDIQ contract vehicle tracking.
 * Lists vehicles, vehicle-tagged opportunities, manual link/unlink.
 * EIS portfolio vehicles extracted from Vault docs.
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { ingestAllVaultVehicles, extractVehicleFromVaultDoc } from '../services/vehicles/vault-extract.js';
import { logger } from '../lib/logger.js';

export async function vehicleRoutes(fastify: FastifyInstance): Promise<void> {

  // List all vehicles with opportunity counts (includes both seeded + vault-extracted)
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
        cv.sponsor_agency,
        cv.prime_or_sub,
        cv.prime_contractor,
        cv.period_of_performance_start,
        cv.period_of_performance_end,
        cv.naics_codes,
        cv.set_aside_type,
        cv.status,
        cv.source_doc_paths,
        cv.source_vault_doc_ids,
        cv.extraction_confidence,
        cv.needs_review,
        cv.extracted_at,
        COUNT(DISTINCT ovl.opportunity_id) FILTER (
          WHERE o.deleted_at IS NULL
        ) AS opportunity_count,
        COUNT(DISTINCT ovl.opportunity_id) FILTER (
          WHERE o.deleted_at IS NULL AND EXISTS (SELECT 1 FROM pipeline_items pi WHERE pi.opportunity_id = o.id)
        ) AS pipeline_count
      FROM contract_vehicles cv
      LEFT JOIN opportunity_vehicle_links ovl ON ovl.vehicle_id = cv.id
      LEFT JOIN opportunities o ON o.id = ovl.opportunity_id
      WHERE cv.is_active = true
      GROUP BY cv.id
      ORDER BY cv.agency, cv.name
    `);
    const vehicles = result.rows.map((r) => ({
      ...r,
      id: Number(r.id),
      ceiling_value: r.ceiling_value !== null ? Number(r.ceiling_value) : null,
      opportunity_count: Number(r.opportunity_count),
      pipeline_count: Number(r.pipeline_count),
    }));
    return reply.send(successEnvelope(vehicles, req.requestId));
  });

  // GET /v3/vehicles/:vehicleId — single vehicle detail
  fastify.get('/v3/vehicles/:vehicleId', async (req, reply) => {
    const { vehicleId } = req.params as { vehicleId: string };
    const result = await pool.query(
      `SELECT
        cv.*,
        COUNT(DISTINCT ovl.opportunity_id) FILTER (
          WHERE o.deleted_at IS NULL
        ) AS opportunity_count,
        COUNT(DISTINCT ovl.opportunity_id) FILTER (
          WHERE o.deleted_at IS NULL AND EXISTS (SELECT 1 FROM pipeline_items pi WHERE pi.opportunity_id = o.id)
        ) AS pipeline_count
      FROM contract_vehicles cv
      LEFT JOIN opportunity_vehicle_links ovl ON ovl.vehicle_id = cv.id
      LEFT JOIN opportunities o ON o.id = ovl.opportunity_id
      WHERE cv.id = $1
      GROUP BY cv.id`,
      [vehicleId],
    );
    if (!result.rows[0]) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Vehicle not found', req.requestId));
    }

    // Fetch source vault docs metadata
    const vaultDocIds = result.rows[0].source_vault_doc_ids as number[] | null;
    let sourceDocs: { id: number; filename: string; doc_type: string; uploaded_at: string }[] = [];
    if (vaultDocIds && vaultDocIds.length > 0) {
      const docRes = await pool.query<{ id: number; filename: string; doc_type: string; uploaded_at: string }>(
        `SELECT id, filename, doc_type, uploaded_at FROM vault_documents
         WHERE id = ANY($1) AND deleted_at IS NULL`,
        [vaultDocIds],
      );
      sourceDocs = docRes.rows;
    }

    const row = result.rows[0];
    const vehicle = {
      ...row,
      id: Number(row.id),
      ceiling_value: row.ceiling_value !== null ? Number(row.ceiling_value) : null,
      opportunity_count: Number(row.opportunity_count),
      pipeline_count: Number(row.pipeline_count),
      source_docs: sourceDocs,
    };
    return reply.send(successEnvelope(vehicle, req.requestId));
  });

  // POST /v3/vehicles/ingest/:docId — extract vehicle from a single vault doc
  fastify.post('/v3/vehicles/ingest/:docId', async (req, reply) => {
    const { docId } = req.params as { docId: string };
    try {
      const result = await extractVehicleFromVaultDoc(Number(docId));
      if (!result) {
        return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Vault document not found', req.requestId));
      }
      return reply.send(successEnvelope(result, req.requestId));
    } catch (err) {
      logger.error({ err, docId }, '[vehicles] Single doc ingestion failed');
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', err instanceof Error ? err.message : 'Ingestion failed', req.requestId),
      );
    }
  });

  // POST /v3/vehicles/reingest-all — re-run extraction on all eligible vault docs
  fastify.post('/v3/vehicles/reingest-all', async (req, reply) => {
    const body = req.body as { force?: boolean } | null;
    const force = body?.force ?? false;
    try {
      logger.info({ force }, '[vehicles] Starting full vault vehicle re-ingestion');
      // Respond immediately, run in background
      void (async () => {
        try {
          const result = await ingestAllVaultVehicles(force);
          logger.info(result, '[vehicles] Full re-ingestion complete');
        } catch (err) {
          logger.error({ err }, '[vehicles] Full re-ingestion failed');
        }
      })();
      return reply.send(successEnvelope({ status: 'started', force }, req.requestId));
    } catch (err) {
      logger.error({ err }, '[vehicles] Re-ingestion trigger failed');
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', err instanceof Error ? err.message : 'Re-ingestion failed', req.requestId),
      );
    }
  });

  // Opportunities under a specific vehicle
  fastify.get('/v3/vehicles/:vehicleId/opportunities', async (req, reply) => {
    const { vehicleId } = req.params as { vehicleId: string };
    const result = await pool.query(
      `SELECT
        o.id, o.title, o.agency, o.naics, o.value_min, o.value_max,
        o.response_due_at, o.posted_at, COALESCE((SELECT pi.stage FROM pipeline_items pi WHERE pi.opportunity_id = o.id ORDER BY pi.id DESC LIMIT 1), 'interest') AS pipeline_stage,
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
