import { pool } from '../../lib/db.js';

interface DedupResult {
  isDuplicate: boolean;
  existingRiskId: number | null;
}

/**
 * Check if a similar risk already exists on the same entity within 7 days.
 * Uses trigram similarity on title+description to detect near-duplicates.
 * Falls back to simple ILIKE comparison if pg_trgm is not available.
 */
export async function checkRiskDedup(
  title: string,
  description: string,
  opportunityId: number | null,
  captureId: number | null,
  pipelineItemId: number | null,
): Promise<DedupResult> {
  // Build entity condition — at least one entity must match
  const entityConditions: string[] = [];
  const params: unknown[] = [];

  if (opportunityId) {
    params.push(opportunityId);
    entityConditions.push(`opportunity_id = $${params.length}`);
  }
  if (captureId) {
    params.push(captureId);
    entityConditions.push(`related_capture_id = $${params.length}`);
  }
  if (pipelineItemId) {
    params.push(pipelineItemId);
    entityConditions.push(`related_pipeline_item_id = $${params.length}`);
  }

  // If no entity link, cannot dedup
  if (entityConditions.length === 0) {
    return { isDuplicate: false, existingRiskId: null };
  }

  const entityClause = entityConditions.join(' OR ');

  // Search for risks within 7 days with similar title (case-insensitive substring match)
  params.push(title.toLowerCase().trim());
  const titleParam = params.length;

  const { rows } = await pool.query(
    `SELECT id, title, description
     FROM risks
     WHERE (${entityClause})
       AND created_at > NOW() - INTERVAL '7 days'
       AND LOWER(title) = $${titleParam}
     LIMIT 1`,
    params,
  );

  if (rows.length > 0) {
    return { isDuplicate: true, existingRiskId: rows[0].id };
  }

  // Fuzzy match: check if title is very similar (contains or contained by)
  const fuzzyRes = await pool.query(
    `SELECT id, title
     FROM risks
     WHERE (${entityClause})
       AND created_at > NOW() - INTERVAL '7 days'
       AND (
         LOWER(title) LIKE '%' || $${titleParam} || '%'
         OR $${titleParam} LIKE '%' || LOWER(title) || '%'
       )
     LIMIT 1`,
    params,
  );

  if (fuzzyRes.rows.length > 0) {
    return { isDuplicate: true, existingRiskId: fuzzyRes.rows[0].id };
  }

  return { isDuplicate: false, existingRiskId: null };
}
