/**
 * Unified mirror — idempotent helper that projects a legacy `opportunities`
 * row into `unified_opportunities` + `unified_opportunity_links`.
 *
 * Called (a) from ingest after each opportunity upsert commits, and
 * (b) by the one-time backfill script.
 */

import type pg from 'pg';
import { logger } from '../../lib/logger.js';
import type { LifecycleStage } from '../../db/types/opportunity.js';

// ─── Public types ────────────────────────────────────────────────────────────

export interface LegacyOpportunityRow {
  id: number;
  data_source: string;
  sam_notice_id: string | null;
  external_id: string | null;
  title: string | null;
  agency: string | null;
  sub_agency: string | null;
  naics: string | null;
  psc: string | null;
  set_aside: string | null;
  value_min: number | null;
  value_max: number | null;
  posted_at: string | null;
  response_due_at: string | null;
  status: string | null;
}

export interface MirrorResult {
  internal_id: string;
  created: boolean;
}

// ─── Source/native-id resolution ─────────────────────────────────────────────

const DATA_SOURCE_TO_LINK: Record<string, { source: string; field: 'sam_notice_id' | 'external_id' }> = {
  'sam.gov': { source: 'sam', field: 'sam_notice_id' },
  'govwin': { source: 'govwin', field: 'sam_notice_id' },
  'arxiv': { source: 'arxiv', field: 'external_id' },
  'grants_gov': { source: 'grants_gov', field: 'external_id' },
  'nsf': { source: 'nsf', field: 'external_id' },
  'nih': { source: 'nih', field: 'external_id' },
  'sbir': { source: 'sbir', field: 'external_id' },
  'dod_rss': { source: 'dod_rss', field: 'external_id' },
};

/**
 * Derive the unified link source + native id from a legacy opportunity row.
 * Exported so batch-score can resolve the unified row for pwin writes.
 */
export function resolveUnifiedLink(
  legacy: Pick<LegacyOpportunityRow, 'data_source' | 'sam_notice_id' | 'external_id'>,
): { source: string; source_native_id: string } | null {
  return resolveLink(legacy as LegacyOpportunityRow);
}

function resolveLink(legacy: LegacyOpportunityRow): { source: string; source_native_id: string } | null {
  const mapping = DATA_SOURCE_TO_LINK[legacy.data_source];
  if (!mapping) return null;

  const rawId = legacy[mapping.field];
  if (!rawId) return null;

  let nativeId = rawId;
  if (legacy.data_source === 'govwin') {
    // Strip leading "govwin-" prefix per spec
    nativeId = rawId.startsWith('govwin-') ? rawId.slice('govwin-'.length) : rawId;
  }

  return { source: mapping.source, source_native_id: nativeId };
}

// ─── Lifecycle mapping ───────────────────────────────────────────────────────

export function mapStatusToLifecycle(status: string | null | undefined): LifecycleStage {
  if (!status) return 'pre_sol';
  const s = status.toLowerCase().trim();
  if (s === 'awarded') return 'awarded';
  if (s === 'closed' || s === 'no_bid') return 'closed';
  return 'pre_sol';
}

// ─── Estimated value ─────────────────────────────────────────────────────────

function computeEstimatedValueCents(valueMin: number | null, valueMax: number | null): number | null {
  if (valueMin != null) return Math.round(valueMin * 100);
  if (valueMax != null) return Math.round(valueMax * 100);
  return null;
}

// ─── Main mirror function ────────────────────────────────────────────────────

export async function mirrorOpportunityToUnified(
  pool: pg.Pool,
  legacy: LegacyOpportunityRow,
): Promise<MirrorResult> {
  const noopResult: MirrorResult = { internal_id: '', created: false };

  try {
    const link = resolveLink(legacy);
    if (!link) {
      logger.debug(
        { legacyId: legacy.id, dataSource: legacy.data_source },
        'unified_mirror_skip: no native id derivable',
      );
      return noopResult;
    }

    const { source, source_native_id } = link;
    const lifecycleStage = mapStatusToLifecycle(legacy.status);
    const estimatedValueCents = computeEstimatedValueCents(legacy.value_min, legacy.value_max);
    const office = legacy.sub_agency || null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if link already exists
      const { rows: existingLinks } = await client.query<{ internal_id: string }>(
        `SELECT internal_id FROM unified_opportunity_links
         WHERE source = $1 AND source_native_id = $2`,
        [source, source_native_id],
      );

      let internalId: string;
      let created: boolean;

      if (existingLinks.length > 0) {
        // UPDATE existing unified_opportunities row (do NOT touch pwin or doctrine_status)
        internalId = existingLinks[0].internal_id;
        created = false;

        await client.query(
          `UPDATE unified_opportunities SET
             lifecycle_stage = $1,
             primary_source = $2,
             title = $3,
             agency = $4,
             office = $5,
             naics = $6,
             psc = $7,
             set_aside = $8,
             estimated_value_cents = $9,
             posted_at = $10,
             response_due_at = $11,
             updated_at = NOW()
           WHERE internal_id = $12`,
          [
            lifecycleStage,
            source,
            legacy.title,
            legacy.agency,
            office,
            legacy.naics,
            legacy.psc,
            legacy.set_aside,
            estimatedValueCents,
            legacy.posted_at,
            legacy.response_due_at,
            internalId,
          ],
        );
      } else {
        // INSERT new unified_opportunities + link
        const { rows: insertedRows } = await client.query<{ internal_id: string }>(
          `INSERT INTO unified_opportunities (
             lifecycle_stage, primary_source, title, agency, office,
             naics, psc, set_aside, estimated_value_cents,
             posted_at, response_due_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING internal_id`,
          [
            lifecycleStage,
            source,
            legacy.title,
            legacy.agency,
            office,
            legacy.naics,
            legacy.psc,
            legacy.set_aside,
            estimatedValueCents,
            legacy.posted_at,
            legacy.response_due_at,
          ],
        );
        internalId = insertedRows[0].internal_id;
        created = true;

        // Insert link with ON CONFLICT guard for races
        await client.query(
          `INSERT INTO unified_opportunity_links
             (internal_id, source, source_native_id, match_method, matched_at)
           VALUES ($1, $2, $3, 'auto_mirror', NOW())
           ON CONFLICT (source, source_native_id) DO NOTHING`,
          [internalId, source, source_native_id],
        );
      }

      await client.query('COMMIT');
      return { internal_id: internalId, created };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error(
      {
        legacyId: legacy.id,
        dataSource: legacy.data_source,
        error: err instanceof Error ? err.message : String(err),
      },
      'unified_mirror_error',
    );
    return noopResult;
  }
}
