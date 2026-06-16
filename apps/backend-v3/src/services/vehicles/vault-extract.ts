/**
 * Vault → Vehicle Extraction Service
 *
 * Reads contract-related docs from the Vault, runs LLM extraction via
 * the vault_vehicle_extract task, and upserts rows into contract_vehicles.
 * Results are cached by document content hash so re-runs are free.
 */

import { createHash } from 'node:crypto';
import { pool } from '../../lib/db.js';
import { llmRouter } from '../../lib/llm-router.js';
import { logger } from '../../lib/logger.js';
import type { VaultVehicleExtractOutput } from '../../lib/llm-router.types.js';

/** Doc types likely to contain contract vehicle info */
const VEHICLE_DOC_TYPES = new Set([
  'contract',
  'subcontract_teaming',
  'capability_statement',
  'other',
]);

interface VaultDocRow {
  id: number;
  filename: string;
  doc_type: string;
  extracted_text: string | null;
  file_path: string | null;
}

interface ExtractionResult {
  vault_doc_id: number;
  filename: string;
  status: 'success' | 'failed' | 'skipped';
  vehicle_id: number | null;
  reason: string | null;
}

function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Extract vehicle data from a single vault document.
 * Returns the extraction result including the vehicle_id if upserted.
 */
export async function extractVehicleFromDoc(doc: VaultDocRow): Promise<ExtractionResult> {
  if (!doc.extracted_text || doc.extracted_text.trim().length === 0) {
    return {
      vault_doc_id: doc.id,
      filename: doc.filename,
      status: 'skipped',
      vehicle_id: null,
      reason: 'No extracted text available (OCR required or empty document)',
    };
  }

  const hash = contentHash(doc.extracted_text);

  // Check cache — skip if already processed with same content
  const cached = await pool.query<{ extraction_status: string; vehicle_id: number | null }>(
    `SELECT extraction_status, vehicle_id FROM vault_vehicle_extraction_cache
     WHERE vault_doc_id = $1 AND content_hash = $2`,
    [doc.id, hash],
  );

  if (cached.rows.length > 0) {
    const row = cached.rows[0];
    return {
      vault_doc_id: doc.id,
      filename: doc.filename,
      status: row.extraction_status as 'success' | 'failed' | 'skipped',
      vehicle_id: row.vehicle_id,
      reason: 'Cached — document content unchanged since last extraction',
    };
  }

  try {
    const result = await llmRouter.route({
      task: 'vault_vehicle_extract',
      input: {
        filename: doc.filename,
        extracted_text: doc.extracted_text,
        doc_type: doc.doc_type,
      },
    });

    if (!result.ok || !result.output) {
      await upsertCache(doc.id, hash, null, 'failed', 'LLM extraction failed');
      return {
        vault_doc_id: doc.id,
        filename: doc.filename,
        status: 'failed',
        vehicle_id: null,
        reason: 'LLM extraction returned an error',
      };
    }

    const output: VaultVehicleExtractOutput = result.output;

    if (!output.is_contract_vehicle) {
      await upsertCache(doc.id, hash, null, 'skipped', 'Document is not a contract vehicle');
      return {
        vault_doc_id: doc.id,
        filename: doc.filename,
        status: 'skipped',
        vehicle_id: null,
        reason: 'LLM determined document is not a contract vehicle',
      };
    }

    // Upsert into contract_vehicles
    const vehicleId = await upsertVehicle(output, doc);

    await upsertCache(doc.id, hash, vehicleId, 'success', null);

    return {
      vault_doc_id: doc.id,
      filename: doc.filename,
      status: 'success',
      vehicle_id: vehicleId,
      reason: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, docId: doc.id, filename: doc.filename }, '[vault-vehicle-extract] Extraction failed');
    await upsertCache(doc.id, hash, null, 'failed', message);
    return {
      vault_doc_id: doc.id,
      filename: doc.filename,
      status: 'failed',
      vehicle_id: null,
      reason: message,
    };
  }
}

/**
 * Upsert a vehicle row from LLM extraction output.
 * If contract_number exists, update; otherwise insert new.
 */
async function upsertVehicle(output: VaultVehicleExtractOutput, doc: VaultDocRow): Promise<number> {
  const now = new Date().toISOString();
  const docPath = doc.file_path ?? `vault-doc-${doc.id}`;
  const hash = contentHash(doc.extracted_text ?? '');

  // Compute status based on expiration
  let status: 'active' | 'expired' | 'pending' = 'pending';
  if (output.expiration_date) {
    const exp = new Date(output.expiration_date);
    status = exp > new Date() ? 'active' : 'expired';
  }

  const needsReview = output.extraction_confidence === 'low';

  // Try upsert by contract_number if available
  if (output.contract_number) {
    const existing = await pool.query<{ id: number; source_doc_paths: string[] | null; source_vault_doc_ids: number[] | null }>(
      `SELECT id, source_doc_paths, source_vault_doc_ids FROM contract_vehicles WHERE contract_number = $1`,
      [output.contract_number],
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      const existingPaths = row.source_doc_paths ?? [];
      const existingDocIds = row.source_vault_doc_ids ?? [];
      const newPaths = existingPaths.includes(docPath) ? existingPaths : [...existingPaths, docPath];
      const newDocIds = existingDocIds.includes(doc.id) ? existingDocIds : [...existingDocIds, doc.id];

      await pool.query(
        `UPDATE contract_vehicles SET
          name = COALESCE($1, name),
          short_name = COALESCE($2, short_name),
          sponsor_agency = COALESCE($3, sponsor_agency),
          agency = COALESCE($3, agency),
          prime_or_sub = COALESCE($4, prime_or_sub),
          prime_contractor = COALESCE($5, prime_contractor),
          ceiling_value = COALESCE($6, ceiling_value),
          period_of_performance_start = COALESCE($7, period_of_performance_start),
          period_of_performance_end = COALESCE($8, period_of_performance_end),
          expiration_date = COALESCE($9, expiration_date),
          naics_codes = COALESCE($10, naics_codes),
          set_aside_type = COALESCE($11, set_aside_type),
          status = $12,
          source_doc_paths = $13,
          source_vault_doc_ids = $14,
          extraction_confidence = $15,
          needs_review = $16,
          extracted_at = $17,
          doc_content_hash = $18,
          updated_at = NOW()
        WHERE id = $19`,
        [
          output.vehicle_name,
          output.vehicle_name, // short_name fallback
          output.sponsor_agency,
          output.prime_or_sub,
          output.prime_contractor,
          output.ceiling_value,
          output.period_of_performance_start,
          output.period_of_performance_end,
          output.expiration_date,
          output.naics_codes.length > 0 ? output.naics_codes : null,
          output.set_aside_type,
          status,
          newPaths,
          newDocIds,
          output.extraction_confidence,
          needsReview,
          now,
          hash,
          row.id,
        ],
      );

      return row.id;
    }
  }

  // Insert new vehicle
  const insertRes = await pool.query<{ id: number }>(
    `INSERT INTO contract_vehicles (
      name, short_name, contract_number, vehicle_type,
      agency, sponsor_agency, naics_primary,
      prime_or_sub, prime_contractor,
      ceiling_value, period_of_performance_start, period_of_performance_end,
      expiration_date, naics_codes, set_aside_type,
      status, source_doc_paths, source_vault_doc_ids,
      extraction_confidence, needs_review, extracted_at, doc_content_hash,
      is_active
    ) VALUES (
      $1, $2, $3, 'IDIQ',
      $4, $4, $5,
      $6, $7,
      $8, $9, $10,
      $11, $12, $13,
      $14, $15, $16,
      $17, $18, $19, $20,
      true
    ) RETURNING id`,
    [
      output.vehicle_name ?? doc.filename,
      output.vehicle_name ?? doc.filename,
      output.contract_number,
      output.sponsor_agency,
      output.naics_codes.length > 0 ? output.naics_codes[0] : null,
      output.prime_or_sub,
      output.prime_contractor,
      output.ceiling_value,
      output.period_of_performance_start,
      output.period_of_performance_end,
      output.expiration_date,
      output.naics_codes.length > 0 ? output.naics_codes : null,
      output.set_aside_type,
      status,
      [docPath],
      [doc.id],
      output.extraction_confidence,
      needsReview,
      now,
      hash,
    ],
  );

  return insertRes.rows[0].id;
}

async function upsertCache(
  vaultDocId: number,
  hash: string,
  vehicleId: number | null,
  status: string,
  errorReason: string | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO vault_vehicle_extraction_cache
      (vault_doc_id, content_hash, vehicle_id, extraction_status, error_reason, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (vault_doc_id, content_hash)
     DO UPDATE SET vehicle_id = $3, extraction_status = $4, error_reason = $5, updated_at = NOW()`,
    [vaultDocId, hash, vehicleId, status, errorReason],
  );
}

/**
 * Run extraction on all eligible vault documents.
 * Targets docs with doc_type in VEHICLE_DOC_TYPES or filename heuristics.
 */
export async function ingestAllVaultVehicles(forceRerun = false): Promise<{
  scanned: number;
  extracted: number;
  skipped: number;
  failed: number;
  results: ExtractionResult[];
}> {
  const docTypeList = [...VEHICLE_DOC_TYPES].map(t => `'${t}'`).join(',');

  const sql = `
    SELECT id, filename, doc_type, extracted_text, file_path
    FROM vault_documents
    WHERE deleted_at IS NULL
      AND (
        doc_type IN (${docTypeList})
        OR filename ILIKE '%contract%'
        OR filename ILIKE '%vehicle%'
        OR filename ILIKE '%idiq%'
        OR filename ILIKE '%bpa%'
        OR filename ILIKE '%gwac%'
        OR filename ILIKE '%task order%'
      )
    ORDER BY uploaded_at DESC
  `;

  const res = await pool.query<VaultDocRow>(sql);
  const docs = res.rows;

  let extracted = 0;
  let skipped = 0;
  let failed = 0;
  const results: ExtractionResult[] = [];

  for (const doc of docs) {
    if (forceRerun) {
      // Clear cache for this doc so it re-runs
      await pool.query(
        `DELETE FROM vault_vehicle_extraction_cache WHERE vault_doc_id = $1`,
        [doc.id],
      );
    }

    const result = await extractVehicleFromDoc(doc);
    results.push(result);

    if (result.status === 'success') extracted++;
    else if (result.status === 'skipped') skipped++;
    else failed++;
  }

  logger.info(
    { scanned: docs.length, extracted, skipped, failed },
    '[vault-vehicle-extract] Ingestion complete',
  );

  return { scanned: docs.length, extracted, skipped, failed, results };
}

/**
 * Extract vehicle from a single vault doc by ID.
 * Used for on-upload hook.
 */
export async function extractVehicleFromVaultDoc(docId: number): Promise<ExtractionResult | null> {
  const res = await pool.query<VaultDocRow>(
    `SELECT id, filename, doc_type, extracted_text, file_path
     FROM vault_documents WHERE id = $1 AND deleted_at IS NULL`,
    [docId],
  );

  if (res.rows.length === 0) return null;
  return extractVehicleFromDoc(res.rows[0]);
}
