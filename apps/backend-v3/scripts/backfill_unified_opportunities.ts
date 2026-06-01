#!/usr/bin/env tsx
/**
 * F-404: Backfill — migrate per-source rows into unified opportunities + links.
 *
 * Reads every row from the legacy `opportunities` table (sam, govtribe, govwin),
 * normalises to NormalizedOpportunity, runs MatcherV1 for cross-source linking,
 * and writes to unified_opportunities + unified_opportunity_links.
 *
 * Usage:
 *   npx tsx scripts/backfill_unified_opportunities.ts              # live run
 *   npx tsx scripts/backfill_unified_opportunities.ts --dry-run    # counts only
 *   npx tsx scripts/backfill_unified_opportunities.ts --resume     # pick up mid-run
 *
 * Idempotent: re-running is a no-op (ON CONFLICT ... DO NOTHING + link-check).
 */

import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { MatcherV1 } from '../src/matching/matcher_v1.js';
import type { MatcherInput, CandidateOpportunity, CandidateLink } from '../src/matching/types.js';
import type { NormalizedOpportunity } from '../src/ingest/adapter/types.js';
import type { LifecycleStage, PrimarySource } from '../src/db/types/opportunity.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://gda:gda_dev_password@localhost:5432/gda_command';

const CURSOR_ID = 'backfill_unified_v1';
const BATCH_SIZE = 200;
const PROGRESS_INTERVAL = 500;

const SUPPORTED_SOURCES = ['sam', 'sam.gov', 'govtribe', 'govwin'];

// ─── CLI flags ───────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');
const RESUME = process.argv.includes('--resume');

// ─── Types ───────────────────────────────────────────────────────────────────

interface LegacyRow {
  id: number;
  title: string;
  agency: string | null;
  sub_agency: string | null;
  department: string | null;
  solicitation_number: string | null;
  sam_notice_id: string | null;
  status: string;
  value_min: string | null;
  value_max: string | null;
  naics: string | null;
  psc: string | null;
  set_aside: string | null;
  response_due_at: string | null;
  posted_at: string | null;
  description: string | null;
  data_source: string;
  source_uri: string | null;
  govtribe_id: string | null;
  external_id: string | null;
  agency_subtype: string | null;
}

interface BackfillStats {
  totalSourceRows: number;
  totalUnifiedCreated: number;
  totalHighLinks: number;
  totalMediumLinks: number;
  totalSkipped: number;
  bySource: Map<string, SourceStats>;
}

interface SourceStats {
  rows: number;
  unified: number;
  high: number;
  medium: number;
  skipped: number;
}

function emptySourceStats(): SourceStats {
  return { rows: 0, unified: 0, high: 0, medium: 0, skipped: 0 };
}

// ─── Source resolution ───────────────────────────────────────────────────────

function resolveSource(dataSource: string): PrimarySource | null {
  const ds = dataSource.toLowerCase();
  if (ds === 'sam' || ds === 'sam.gov') return 'sam';
  if (ds === 'govtribe') return 'govtribe';
  if (ds === 'govwin') return 'govwin';
  return null;
}

// ─── Legacy row → NormalizedOpportunity ──────────────────────────────────────

/**
 * The F-402 adapter normalize() methods expect API-format raw records, not DB
 * rows. For the one-shot backfill we normalise directly from the legacy
 * `opportunities` columns, producing the same NormalizedOpportunity shape.
 */
function normalizeLegacyRow(row: LegacyRow, source: PrimarySource): NormalizedOpportunity | null {
  const nativeId = deriveNativeId(row, source);
  if (!nativeId) return null;

  return {
    source_native_id: nativeId,
    lifecycle_stage: inferStage(row, source),
    title: row.title,
    agency: row.agency,
    office: row.sub_agency ?? row.agency_subtype ?? null,
    naics: row.naics ?? null,
    psc: row.psc ?? null,
    set_aside: row.set_aside ?? null,
    estimated_value_cents: valueToCents(row.value_max ?? row.value_min),
    posted_at: row.posted_at ?? null,
    response_due_at: row.response_due_at ?? null,
    award_at: null,
    source_url: row.source_uri ?? null,
    description: row.description ?? null,
  };
}

function deriveNativeId(row: LegacyRow, source: PrimarySource): string | null {
  switch (source) {
    case 'sam':
      return row.sam_notice_id ?? row.solicitation_number ?? `sam-legacy-${row.id}`;
    case 'govtribe':
      return row.govtribe_id ?? row.external_id ?? `govtribe-legacy-${row.id}`;
    case 'govwin':
      return row.external_id ?? extractGovwinPrefix(row.sam_notice_id) ?? `govwin-legacy-${row.id}`;
    default:
      return null;
  }
}

function extractGovwinPrefix(samNoticeId: string | null): string | null {
  if (!samNoticeId) return null;
  if (samNoticeId.toLowerCase().startsWith('govwin-')) return samNoticeId.slice(7);
  return null;
}

const AWARDED_STATUSES = new Set(['awarded']);
const CLOSED_STATUSES = new Set(['closed', 'no_bid']);
const FORECAST_STATUSES = new Set(['pre-rfp', 'forecast', 'planning', 'draft rfp']);

function inferStage(row: LegacyRow, source: PrimarySource): LifecycleStage {
  const status = (row.status ?? '').toLowerCase();
  if (AWARDED_STATUSES.has(status)) return 'awarded';
  if (CLOSED_STATUSES.has(status)) return 'closed';
  if (source === 'govwin' && FORECAST_STATUSES.has(status)) return 'forecast';
  if (source === 'govwin') return 'forecast';
  return 'solicitation';
}

function valueToCents(raw: string | null): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

type Queryable = { query: pg.Pool['query'] };

async function ensureCursorTable(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS backfill_cursors (
      id              TEXT        PRIMARY KEY,
      last_processed_id BIGINT   NOT NULL DEFAULT 0,
      total_processed   BIGINT   NOT NULL DEFAULT 0,
      status            TEXT     NOT NULL DEFAULT 'running',
      started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getCursor(pool: pg.Pool): Promise<{ lastId: number; totalProcessed: number } | null> {
  const res = await pool.query(
    `SELECT last_processed_id, total_processed FROM backfill_cursors WHERE id = $1`,
    [CURSOR_ID],
  );
  const row = res.rows[0] as { last_processed_id: string; total_processed: string } | undefined;
  if (!row) return null;
  return { lastId: Number(row.last_processed_id), totalProcessed: Number(row.total_processed) };
}

async function upsertCursor(pool: pg.Pool, lastId: number, totalProcessed: number): Promise<void> {
  await pool.query(
    `INSERT INTO backfill_cursors (id, last_processed_id, total_processed, status)
     VALUES ($1, $2, $3, 'running')
     ON CONFLICT (id) DO UPDATE SET
       last_processed_id = $2,
       total_processed = $3,
       status = 'running',
       updated_at = NOW()`,
    [CURSOR_ID, lastId, totalProcessed],
  );
}

async function completeCursor(pool: pg.Pool, totalProcessed: number): Promise<void> {
  await pool.query(
    `UPDATE backfill_cursors SET status = 'completed', total_processed = $2, updated_at = NOW() WHERE id = $1`,
    [CURSOR_ID, totalProcessed],
  );
}

async function countSourceRows(pool: pg.Pool, afterId: number): Promise<number> {
  const res = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM opportunities
     WHERE LOWER(data_source) = ANY($1) AND id > $2 AND deleted_at IS NULL`,
    [SUPPORTED_SOURCES, afterId],
  );
  return (res.rows[0] as { cnt: number }).cnt;
}

async function fetchBatch(pool: pg.Pool, afterId: number): Promise<LegacyRow[]> {
  const res = await pool.query(
    `SELECT id, title, agency, sub_agency, department,
            solicitation_number, sam_notice_id, status,
            value_min::text, value_max::text,
            naics, psc, set_aside, response_due_at::text, posted_at::text,
            description, data_source, source_uri, govtribe_id, external_id,
            agency_subtype
     FROM opportunities
     WHERE LOWER(data_source) = ANY($1) AND id > $2 AND deleted_at IS NULL
     ORDER BY id ASC
     LIMIT $3`,
    [SUPPORTED_SOURCES, afterId, BATCH_SIZE],
  );
  return res.rows as LegacyRow[];
}

async function checkExistingLink(
  pool: pg.Pool,
  source: string,
  sourceNativeId: string,
): Promise<string | null> {
  const res = await pool.query(
    `SELECT internal_id FROM unified_opportunity_links WHERE source = $1 AND source_native_id = $2`,
    [source, sourceNativeId],
  );
  const row = res.rows[0] as { internal_id: string } | undefined;
  return row?.internal_id ?? null;
}

async function insertUnifiedOpportunity(
  db: Queryable,
  internalId: string,
  n: NormalizedOpportunity,
  source: PrimarySource,
): Promise<void> {
  await db.query(
    `INSERT INTO unified_opportunities
       (internal_id, lifecycle_stage, primary_source, title, agency, office,
        naics, psc, set_aside, estimated_value_cents, posted_at, response_due_at, award_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (internal_id) DO NOTHING`,
    [
      internalId, n.lifecycle_stage, source, n.title, n.agency, n.office,
      n.naics, n.psc, n.set_aside, n.estimated_value_cents,
      n.posted_at, n.response_due_at, n.award_at,
    ],
  );
}

async function insertLink(
  db: Queryable,
  link: {
    internalId: string;
    source: string;
    sourceNativeId: string;
    confidence: string;
    matchMethod: string;
    confirmedBy: string | null;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO unified_opportunity_links
       (internal_id, source, source_native_id, confidence, match_method, matched_at, confirmed_by, confirmed_at)
     VALUES ($1,$2,$3,$4::opportunity_link_confidence,$5,$6,$7,$8)
     ON CONFLICT (source, source_native_id) DO NOTHING`,
    [
      link.internalId,
      link.source,
      link.sourceNativeId,
      link.confidence,
      link.matchMethod,
      new Date().toISOString(),
      link.confirmedBy,
      link.confirmedBy ? new Date().toISOString() : null,
    ],
  );
}

// ─── Load existing unified opportunities as matcher candidates ───────────────

async function loadExistingCandidates(pool: pg.Pool): Promise<CandidateOpportunity[]> {
  const oppRes = await pool.query(
    `SELECT internal_id, title, agency, naics, estimated_value_cents
     FROM unified_opportunities`,
  );
  const linkRes = await pool.query(
    `SELECT internal_id, source, source_native_id FROM unified_opportunity_links`,
  );

  const linksByInternal = new Map<string, CandidateLink[]>();
  for (const row of linkRes.rows as Array<{ internal_id: string; source: string; source_native_id: string }>) {
    const arr = linksByInternal.get(row.internal_id) ?? [];
    arr.push({ source: row.source, source_native_id: row.source_native_id });
    linksByInternal.set(row.internal_id, arr);
  }

  // Solicitation numbers from unified_opportunity_links source_native_ids
  // (the matcher uses these for sol_num_agency_exact matching)
  const solsByInternal = new Map<string, string[]>();
  for (const row of linkRes.rows as Array<{ internal_id: string; source_native_id: string }>) {
    const arr = solsByInternal.get(row.internal_id) ?? [];
    arr.push(row.source_native_id);
    solsByInternal.set(row.internal_id, arr);
  }

  return (
    oppRes.rows as Array<{
      internal_id: string;
      title: string | null;
      agency: string | null;
      naics: string | null;
      estimated_value_cents: string | null;
    }>
  ).map((row) => ({
    internal_id: row.internal_id,
    title: row.title,
    agency: row.agency,
    naics: row.naics,
    estimated_value_cents: row.estimated_value_cents != null ? Number(row.estimated_value_cents) : null,
    solicitation_numbers: solsByInternal.get(row.internal_id) ?? [],
    links: linksByInternal.get(row.internal_id) ?? [],
  }));
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });

  console.log('=== F-404 Backfill: Unified Opportunities ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);
  console.log(`Resume: ${RESUME ? 'yes' : 'no'}`);

  const stats: BackfillStats = {
    totalSourceRows: 0,
    totalUnifiedCreated: 0,
    totalHighLinks: 0,
    totalMediumLinks: 0,
    totalSkipped: 0,
    bySource: new Map(),
  };

  try {
    if (!DRY_RUN) {
      await ensureCursorTable(pool);
    }

    // Determine resume point
    let startAfterId = 0;
    if (RESUME && !DRY_RUN) {
      const cursor = await getCursor(pool);
      if (cursor) {
        startAfterId = cursor.lastId;
        stats.totalSourceRows = cursor.totalProcessed;
        console.log(`Resuming from id > ${startAfterId} (${cursor.totalProcessed} already processed)`);
      }
    }

    const remaining = await countSourceRows(pool, startAfterId);
    console.log(`Source rows to process: ${remaining}`);

    // Load existing unified opportunities as candidates
    console.log('Loading existing unified opportunities for matching...');
    const candidates = await loadExistingCandidates(pool);
    console.log(`Loaded ${candidates.length} existing candidates`);

    const matcher = new MatcherV1();
    let lastId = startAfterId;
    let batchRows: LegacyRow[];

    while (true) {
      batchRows = await fetchBatch(pool, lastId);
      if (batchRows.length === 0) break;

      for (const row of batchRows) {
        lastId = row.id;
        stats.totalSourceRows++;

        const source = resolveSource(row.data_source);
        if (!source) {
          stats.totalSkipped++;
          continue;
        }

        const srcStats = stats.bySource.get(source) ?? emptySourceStats();
        stats.bySource.set(source, srcStats);
        srcStats.rows++;

        const normalized = normalizeLegacyRow(row, source);
        if (!normalized) {
          stats.totalSkipped++;
          srcStats.skipped++;
          continue;
        }

        // Build MatcherInput
        const input: MatcherInput = {
          source,
          source_native_id: normalized.source_native_id,
          lifecycle_stage: normalized.lifecycle_stage,
          title: normalized.title,
          agency: normalized.agency,
          naics: normalized.naics,
          estimated_value_cents: normalized.estimated_value_cents,
          solicitation_number: row.solicitation_number ?? null,
        };

        if (DRY_RUN) {
          // Simulate matching without DB writes
          const result = matcher.findCandidate(input, candidates);
          if (result === null) {
            stats.totalSkipped++;
            srcStats.skipped++;
          } else if (result.outcome === 'new') {
            stats.totalUnifiedCreated++;
            stats.totalHighLinks++;
            srcStats.unified++;
            srcStats.high++;
            // Add to candidates for subsequent matching
            candidates.push({
              internal_id: randomUUID(),
              title: normalized.title,
              agency: normalized.agency,
              naics: normalized.naics,
              estimated_value_cents: normalized.estimated_value_cents,
              solicitation_numbers: row.solicitation_number ? [row.solicitation_number] : [],
              links: [{ source, source_native_id: normalized.source_native_id }],
            });
          } else if (result.confidence === 'HIGH') {
            stats.totalHighLinks++;
            srcStats.high++;
            // Update candidate links
            const cand = candidates.find((c) => c.internal_id === result.internal_id);
            if (cand) {
              cand.links.push({ source, source_native_id: normalized.source_native_id });
              if (row.solicitation_number) cand.solicitation_numbers.push(row.solicitation_number);
            }
          } else if (result.confidence === 'MEDIUM') {
            stats.totalMediumLinks++;
            srcStats.medium++;
            const cand = candidates.find((c) => c.internal_id === result.internal_id);
            if (cand) {
              cand.links.push({ source, source_native_id: normalized.source_native_id });
            }
          }
        } else {
          // LIVE mode
          // Idempotency: skip if link already exists
          const existingInternal = await checkExistingLink(pool, source, normalized.source_native_id);
          if (existingInternal) {
            stats.totalSkipped++;
            srcStats.skipped++;
            continue;
          }

          const result = matcher.findCandidate(input, candidates);

          if (result === null) {
            // Duplicate detected by matcher
            stats.totalSkipped++;
            srcStats.skipped++;
          } else if (result.outcome === 'linked' && result.internal_id) {
            // Link to existing unified opportunity
            const isHigh = result.confidence === 'HIGH';
            await insertLink(pool, {
              internalId: result.internal_id,
              source,
              sourceNativeId: normalized.source_native_id,
              confidence: result.confidence,
              matchMethod: result.match_method,
              confirmedBy: isHigh ? 'system' : null,
            });
            if (isHigh) {
              stats.totalHighLinks++;
              srcStats.high++;
            } else {
              stats.totalMediumLinks++;
              srcStats.medium++;
            }
            // Update candidate links for subsequent matching
            const cand = candidates.find((c) => c.internal_id === result.internal_id);
            if (cand) {
              cand.links.push({ source, source_native_id: normalized.source_native_id });
              if (row.solicitation_number) cand.solicitation_numbers.push(row.solicitation_number);
            }
          } else {
            // New unified opportunity — transactional insert
            const internalId = randomUUID();
            const client = await pool.connect();
            try {
              await client.query('BEGIN');
              await insertUnifiedOpportunity(client, internalId, normalized, source);
              await insertLink(client, {
                internalId,
                source,
                sourceNativeId: normalized.source_native_id,
                confidence: 'HIGH',
                matchMethod: 'new_internal',
                confirmedBy: 'system',
              });
              await client.query('COMMIT');
            } catch (err) {
              await client.query('ROLLBACK');
              throw err;
            } finally {
              client.release();
            }
            stats.totalUnifiedCreated++;
            stats.totalHighLinks++;
            srcStats.unified++;
            srcStats.high++;
            // Add to candidates for subsequent matching
            candidates.push({
              internal_id: internalId,
              title: normalized.title,
              agency: normalized.agency,
              naics: normalized.naics,
              estimated_value_cents: normalized.estimated_value_cents,
              solicitation_numbers: row.solicitation_number ? [row.solicitation_number] : [],
              links: [{ source, source_native_id: normalized.source_native_id }],
            });
          }

          // Update cursor every batch
        }

        // Progress logging every PROGRESS_INTERVAL rows
        if (stats.totalSourceRows % PROGRESS_INTERVAL === 0) {
          console.log(
            `[progress] ${stats.totalSourceRows} rows processed | ` +
              `unified=${stats.totalUnifiedCreated} high=${stats.totalHighLinks} ` +
              `medium=${stats.totalMediumLinks} skipped=${stats.totalSkipped}`,
          );
        }
      }

      // Update cursor after each batch (live mode only)
      if (!DRY_RUN) {
        await upsertCursor(pool, lastId, stats.totalSourceRows);
      }
    }

    // Mark complete
    if (!DRY_RUN) {
      await completeCursor(pool, stats.totalSourceRows);
    }

    printReport(stats);
  } finally {
    await pool.end();
  }
}

// ─── Report ──────────────────────────────────────────────────────────────────

function printReport(stats: BackfillStats): void {
  console.log('\n=== F-404 Backfill Report ===');
  console.log(`Mode:                        ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);
  console.log(`Total source rows:           ${stats.totalSourceRows}`);
  console.log(`Unified opportunities created: ${stats.totalUnifiedCreated}`);
  console.log(`HIGH links:                  ${stats.totalHighLinks}`);
  console.log(`MEDIUM links:                ${stats.totalMediumLinks}`);
  console.log(`Skipped (dup/unresolvable):  ${stats.totalSkipped}`);

  console.log('\n--- By Source ---');
  for (const [source, s] of stats.bySource) {
    console.log(
      `  ${source}: rows=${s.rows} unified=${s.unified} high=${s.high} medium=${s.medium} skipped=${s.skipped}`,
    );
  }

  console.log('\n=== Done ===');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
