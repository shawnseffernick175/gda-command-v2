/**
 * One-shot backfill: reconcile opportunity_analysis_cache.pwin to use the
 * canonical single source of truth (issue #849).
 *
 * Priority: LLM win_probability > deterministic scorer.
 *
 * For each opportunity:
 *   1. If analysis.llm_analysis.win_probability exists → use it (/ 100)
 *   2. Else if analysis.pwin is an object with .score → use score / 100
 *   3. Else keep existing cache value
 *
 * Also propagates the canonical value to unified_opportunities.pwin.
 *
 * Idempotent — safe to re-run.
 *
 * Usage: npx tsx src/scripts/backfill-pwin-canonical.ts
 */

import pg from 'pg';

const { Pool } = pg;

const BATCH_SIZE = 500;

async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL']
    ?? 'postgresql://gda:gda_dev_password@localhost:5432/gda_command';

  const pool = new Pool({ connectionString: databaseUrl, max: 5 });

  let updated = 0;
  let skipped = 0;
  let unifiedUpdated = 0;
  let offset = 0;

  console.log('[backfill-pwin] Starting canonical pwin reconciliation...');

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { rows } = await pool.query<{
      id: string;
      analysis: Record<string, unknown> | null;
      data_source: string;
      sam_notice_id: string | null;
      govtribe_id: string | null;
      external_id: string | null;
    }>(
      `SELECT id, analysis, data_source, sam_notice_id, govtribe_id, external_id
       FROM opportunities
       WHERE deleted_at IS NULL
       ORDER BY id
       LIMIT $1 OFFSET $2`,
      [BATCH_SIZE, offset],
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      const analysis = row.analysis;
      if (!analysis) {
        skipped++;
        continue;
      }

      // Determine canonical pwin (0-1 fraction)
      let canonicalPwin: number | null = null;

      // Priority 1: LLM win_probability
      const llmAnalysis = analysis.llm_analysis as { win_probability?: number } | null | undefined;
      if (llmAnalysis && typeof llmAnalysis.win_probability === 'number') {
        canonicalPwin = llmAnalysis.win_probability / 100;
      }

      // Priority 2: deterministic pwin from analysis.pwin object
      if (canonicalPwin === null) {
        const pwinField = analysis.pwin;
        if (typeof pwinField === 'object' && pwinField !== null) {
          const score = (pwinField as { score?: number | null }).score;
          if (typeof score === 'number') {
            canonicalPwin = score / 100;
          }
        }
      }

      if (canonicalPwin === null) {
        skipped++;
        continue;
      }

      // Update opportunity_analysis_cache
      const cacheRes = await pool.query(
        `UPDATE opportunity_analysis_cache
         SET pwin = $1
         WHERE opportunity_id = $2`,
        [canonicalPwin, row.id],
      );
      if ((cacheRes.rowCount ?? 0) > 0) {
        updated++;
      } else {
        skipped++;
      }

      // Propagate to unified_opportunities
      const canonicalPwin100 = Math.round(canonicalPwin * 100);
      const link = resolveLink(row);
      if (link) {
        const uRes = await pool.query(
          `UPDATE unified_opportunities uo
             SET pwin = $1, updated_at = NOW()
             FROM unified_opportunity_links l
            WHERE l.internal_id = uo.internal_id
              AND l.source = $2 AND l.source_native_id = $3`,
          [canonicalPwin100, link.source, link.source_native_id],
        );
        if ((uRes.rowCount ?? 0) > 0) {
          unifiedUpdated++;
        }
      }
    }

    offset += rows.length;
    if (rows.length < BATCH_SIZE) break;
  }

  console.log(`[backfill-pwin] Done. Updated: ${updated}, Unified updated: ${unifiedUpdated}, Skipped: ${skipped}`);
  await pool.end();
}

// Inline link resolver (mirrors unified-mirror.ts logic without importing ESM)
const DATA_SOURCE_TO_LINK: Record<string, { source: string; field: 'sam_notice_id' | 'govtribe_id' | 'external_id' }> = {
  'sam.gov': { source: 'sam', field: 'sam_notice_id' },
  'govwin': { source: 'govwin', field: 'sam_notice_id' },
  'govtribe': { source: 'govtribe', field: 'govtribe_id' },
  'arxiv': { source: 'arxiv', field: 'external_id' },
  'grants_gov': { source: 'grants_gov', field: 'external_id' },
  'nsf': { source: 'nsf', field: 'external_id' },
  'nih': { source: 'nih', field: 'external_id' },
  'sbir': { source: 'sbir', field: 'external_id' },
  'dod_rss': { source: 'dod_rss', field: 'external_id' },
};

function resolveLink(row: { data_source: string; sam_notice_id: string | null; govtribe_id: string | null; external_id: string | null }): { source: string; source_native_id: string } | null {
  const mapping = DATA_SOURCE_TO_LINK[row.data_source];
  if (!mapping) return null;
  const rawId = row[mapping.field];
  if (!rawId) return null;
  let nativeId = rawId;
  if (row.data_source === 'govwin') {
    nativeId = rawId.startsWith('govwin-') ? rawId.slice('govwin-'.length) : rawId;
  }
  return { source: mapping.source, source_native_id: nativeId };
}

main().catch((err) => {
  console.error('[backfill-pwin] Fatal error:', err);
  process.exit(1);
});
