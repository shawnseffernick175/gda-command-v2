/**
 * Ingest router — F-304.
 *
 * Routes classified documents to their target surface.
 * Creates action items for user triage.
 * Links to vault_documents when applicable.
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import type { ClassificationResult } from './classifier.js';

export interface RouteResult {
  target_entity_id: string | null;
  action_item_id: number | null;
  vault_document_id: number | null;
}

const SURFACE_LABELS: Record<string, string> = {
  opportunities: 'Opportunities',
  pipeline: 'Pipeline',
  capture: 'Capture',
  partner_intel: 'Partner Intel',
  action_items: 'Action Items',
  daily_news: 'Daily News',
  sentinel: 'Sentinel',
  vault: 'Vault',
  financials: 'Financial Bible',
  regulatory: 'Regulatory',
  fastrac: 'FasTrac',
  vehicles: 'Vehicles',
  digest: 'Digest',
  inbox: 'Inbox / Needs Triage',
};

export async function routeToSurface(
  jobId: string,
  classification: ClassificationResult,
): Promise<RouteResult> {
  const result: RouteResult = {
    target_entity_id: null,
    action_item_id: null,
    vault_document_id: null,
  };

  // Fetch job details
  const jobRes = await pool.query(
    'SELECT filename, file_path, extracted_text, source_surface, doctrine_flag FROM ingest_jobs WHERE id = $1',
    [jobId],
  );
  const job = jobRes.rows[0];
  if (!job) return result;

  const surfaceLabel = SURFACE_LABELS[classification.surface] ?? classification.surface;
  const isTeamingContext = classification.doctrine_flag === 'OU2' || classification.doctrine_flag === 'OU3';

  // Store in vault as the canonical repository
  try {
    const vaultRes = await pool.query<{ id: number }>(
      `INSERT INTO vault_documents (filename, file_path, doc_type, extracted_text, extraction_status, uploaded_by, file_size_bytes)
       VALUES ($1, $2, $3, $4, 'success', 'ingest-system', (SELECT file_size_bytes FROM ingest_jobs WHERE id = $5))
       RETURNING id`,
      [job.filename, job.file_path, mapEntityToVaultType(classification.entity_type), job.extracted_text, jobId],
    );
    result.vault_document_id = vaultRes.rows[0]?.id ?? null;

    // Update ingest job with vault link
    if (result.vault_document_id) {
      await pool.query(
        'UPDATE ingest_jobs SET vault_document_id = $1, updated_at = NOW() WHERE id = $2',
        [result.vault_document_id, jobId],
      );
    }
  } catch (err) {
    logger.warn({ err, jobId }, 'Failed to store in vault');
  }

  // Create action item for user triage
  const triageTitle = isTeamingContext
    ? `[Teaming Context] Triage: ${job.filename} → ${surfaceLabel}`
    : `Triage: ${job.filename} → ${surfaceLabel}`;

  const confidenceNote = classification.confidence < 0.7
    ? ` (low confidence: ${Math.round(classification.confidence * 100)}%)`
    : '';

  const description = [
    `Auto-classified as "${classification.entity_type}" for ${surfaceLabel}${confidenceNote}.`,
    classification.rationale,
    isTeamingContext ? `Doctrine flag: ${classification.doctrine_flag} — read-only teaming context, not a qualified pursuit.` : null,
    classification.evidence_grade ? `Evidence grade: ${classification.evidence_grade}` : null,
  ].filter(Boolean).join('\n');

  try {
    const aiRes = await pool.query<{ id: number }>(
      `INSERT INTO action_items (title, description, status, priority, source, linked_record_type, linked_record_id, owner, assignee_id)
       VALUES ($1, $2, 'open', $3, 'ingest', 'ingest_job', $4, 'system', NULL)
       RETURNING id`,
      [
        triageTitle,
        description,
        classification.confidence < 0.7 ? 'high' : 'medium',
        jobId,
      ],
    );
    result.action_item_id = aiRes.rows[0]?.id ?? null;
  } catch (err) {
    logger.warn({ err, jobId }, 'Failed to create triage action item');
  }

  result.target_entity_id = jobId;

  return result;
}

function mapEntityToVaultType(entityType: string): string {
  const map: Record<string, string> = {
    opportunity: 'rfp',
    capture_doc: 'proposal',
    partner_doc: 'subcontract_teaming',
    action_item: 'correspondence',
    regulatory_notice: 'policy_regulatory',
    news_item: 'other',
    financial_doc: 'financial',
    cpar: 'past_performance',
    doctrine_doc: 'other',
    vehicle_doc: 'contract',
    other: 'other',
  };
  return map[entityType] ?? 'other';
}
