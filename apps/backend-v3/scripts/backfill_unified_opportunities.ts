#!/usr/bin/env tsx
/**
 * F-404: Backfill — migrate per-source rows into unified opportunities + links.
 *
 * Usage:
 *   tsx scripts/backfill_unified_opportunities.ts              # live run
 *   tsx scripts/backfill_unified_opportunities.ts --dry-run     # counts only, no writes
 *   tsx scripts/backfill_unified_opportunities.ts --resume      # pick up from last cursor
 *
 * Features:
 *   - Dry-run mode — reports counts without writing
 *   - Resumable — tracks cursor in backfill_cursors table
 *   - Idempotent — re-running is a no-op (ON CONFLICT checks)
 *   - Progress logging every 500 rows
 *   - Final report: totals for source rows, unified opps, HIGH/MEDIUM links, skipped
 */

import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { resolveAdapterForDataSource } from '../src/ingest/adapter/registry.js';
import { MatcherV1 } from '../src/matching/matcher_v1.js';
import type { LegacyOpportunityRow } from '../src/ingest/adapter/types.js';
import type { UnifiedRecord } from '../src/matching/matcher_v1.js';

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const CURSOR_ID = 'backfill_unified_v1';
const BATCH_SIZE = 200;
const PROGRESS_INTERVAL = 500;
const SUPPORTED_SOURCES = ['sam.gov', 'sam', 'govtribe', 'govwin'];

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://gda:gda_dev_password@localhost:5432/gda_command';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const RESUME = args.includes('--resume');

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
interface BackfillStats {
  totalSourceRows: number;
  totalUnifiedCreated: number;
  totalHighLinks: number;
  totalMediumLinks: number;
  totalSkipped: number;
  bySource: Record<string, number>;
}

const stats: BackfillStats = {
  totalSourceRows: 0,
  totalUnifiedCreated: 0,
  totalHighLinks: 0,
  totalMediumLinks: 0,
  totalSkipped: 0,
  bySource: {},
};

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
function log(msg: string, data?: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  if (data) {
    console.log(`[${ts}] ${msg}`, JSON.stringify(data));
  } else {
    console.log(`[${ts}] ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  log(`Starting backfill${DRY_RUN ? ' (DRY RUN)' : ''}${RESUME ? ' (RESUME)' : ''}`);

  const pool = new Pool({ connectionString: DATABASE_URL, max: 5 });

  try {
    // Ensure the unified tables exist (migration should have run already)
    await ensureTablesExist(pool);

    // Get resume cursor
    let lastProcessedId = 0;
    if (RESUME && !DRY_RUN) {
      lastProcessedId = await getCursor(pool);
      if (lastProcessedId > 0) {
        log(`Resuming from legacy opportunity id > ${lastProcessedId}`);
      }
    }

    // Count total source rows
    const totalCount = await countSourceRows(pool, lastProcessedId);
    log(`Found ${totalCount} source rows to process (id > ${lastProcessedId})`);

    if (totalCount === 0) {
      log('Nothing to backfill.');
      printReport();
      return;
    }

    // Build matcher index from any existing unified records
    const matcher = new MatcherV1();
    if (!DRY_RUN) {
      await indexExistingUnified(pool, matcher);
    }

    // Process in batches
    let processed = 0;
    let currentLastId = lastProcessedId;

    while (true) {
      const batch = await fetchBatch(pool, currentLastId, BATCH_SIZE);
      if (batch.length === 0) break;

      for (const row of batch) {
        await processRow(pool, row, matcher);
        processed++;
        currentLastId = row.id;

        if (processed % PROGRESS_INTERVAL === 0) {
          log(`Progress: ${processed}/${totalCount}`, {
            unified: stats.totalUnifiedCreated,
            high: stats.totalHighLinks,
            medium: stats.totalMediumLinks,
            skipped: stats.totalSkipped,
          });

          if (!DRY_RUN) {
            await updateCursor(pool, currentLastId, processed);
          }
        }
      }
    }

    // Final cursor update
    if (!DRY_RUN && processed > 0) {
      await completeCursor(pool, currentLastId, processed);
    }

    printReport();
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Row processing
// ---------------------------------------------------------------------------
async function processRow(
  pool: pg.Pool,
  row: LegacyOpportunityRow,
  matcher: MatcherV1,
): Promise<void> {
  stats.totalSourceRows++;
  const sourceName = row.data_source?.toLowerCase() ?? 'unknown';
  stats.bySource[sourceName] = (stats.bySource[sourceName] ?? 0) + 1;

  const adapter = resolveAdapterForDataSource(row.data_source);
  if (!adapter) {
    stats.totalSkipped++;
    return;
  }

  const normalized = adapter.normalize(row);

  if (DRY_RUN) {
    // In dry-run mode, still run matcher logic for counting
    const candidate = matcher.findCandidate(normalized);
    if (candidate) {
      if (candidate.confidence === 'HIGH') stats.totalHighLinks++;
      else stats.totalMediumLinks++;
    } else {
      stats.totalUnifiedCreated++;
      // Index for further dry-run matching
      const dryId = uuidv4();
      matcher.index({
        internalId: dryId,
        title: normalized.title,
        agency: normalized.agency,
        solicitationNumber: normalized.solicitationNumber,
        naics: normalized.naics,
        estimatedValueCents: normalized.estimatedValueCents,
        source: normalized.source,
        sourceNativeId: normalized.sourceNativeId,
      });
    }
    return;
  }

  // Check idempotency: does this source_native_id already have a link?
  const existingLink = await checkExistingLink(pool, normalized.source, normalized.sourceNativeId);
  if (existingLink) {
    stats.totalSkipped++;
    return;
  }

  // Try to match against existing unified records
  const candidate = matcher.findCandidate(normalized);

  if (candidate) {
    // Link to existing unified record
    await insertLink(pool, {
      internalId: candidate.internalId,
      source: normalized.source,
      sourceNativeId: normalized.sourceNativeId,
      confidence: candidate.confidence,
      matchMethod: candidate.matchMethod,
      confirmedBy: candidate.confidence === 'HIGH' ? 'system' : null,
      confirmedAt: candidate.confidence === 'HIGH' ? new Date().toISOString() : null,
    });

    if (candidate.confidence === 'HIGH') stats.totalHighLinks++;
    else stats.totalMediumLinks++;
  } else {
    // Create new unified opportunity + primary link
    const internalId = uuidv4();

    await insertUnifiedOpportunity(pool, internalId, normalized);
    await insertLink(pool, {
      internalId,
      source: normalized.source,
      sourceNativeId: normalized.sourceNativeId,
      confidence: 'HIGH',
      matchMethod: 'new_internal',
      confirmedBy: 'system',
      confirmedAt: new Date().toISOString(),
    });

    stats.totalUnifiedCreated++;
    stats.totalHighLinks++;

    // Index for future matching within this run
    matcher.index({
      internalId,
      title: normalized.title,
      agency: normalized.agency,
      solicitationNumber: normalized.solicitationNumber,
      naics: normalized.naics,
      estimatedValueCents: normalized.estimatedValueCents,
      source: normalized.source,
      sourceNativeId: normalized.sourceNativeId,
    });
  }
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------
async function ensureTablesExist(pool: pg.Pool): Promise<void> {
  const { rows } = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_name = 'opportunities_unified'
     ) AS exists`,
  );
  if (!rows[0]?.exists) {
    throw new Error(
      'Table opportunities_unified does not exist. Run migration v3_026 first:\n' +
      '  cd apps/backend-v3 && DATABASE_URL=... npm run db:migrate',
    );
  }
}

async function countSourceRows(pool: pg.Pool, afterId: number): Promise<number> {
  const sourceFilter = SUPPORTED_SOURCES.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM opportunities
     WHERE LOWER(data_source) IN (${sourceFilter})
       AND id > $${SUPPORTED_SOURCES.length + 1}
       AND deleted_at IS NULL`,
    [...SUPPORTED_SOURCES, afterId],
  );
  return rows[0]?.cnt ?? 0;
}

async function fetchBatch(
  pool: pg.Pool,
  afterId: number,
  limit: number,
): Promise<LegacyOpportunityRow[]> {
  const sourceFilter = SUPPORTED_SOURCES.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query(
    `SELECT id, title, agency, sub_agency, department, solicitation_number,
            sam_notice_id, status, value_min, value_max, naics, psc,
            set_aside, place_of_performance, response_due_at, posted_at,
            description, data_source, tags, source_uri, govtribe_id,
            external_id, source_id, created_at, updated_at
     FROM opportunities
     WHERE LOWER(data_source) IN (${sourceFilter})
       AND id > $${SUPPORTED_SOURCES.length + 1}
       AND deleted_at IS NULL
     ORDER BY id ASC
     LIMIT $${SUPPORTED_SOURCES.length + 2}`,
    [...SUPPORTED_SOURCES, afterId, limit],
  );
  return rows as LegacyOpportunityRow[];
}

async function checkExistingLink(
  pool: pg.Pool,
  source: string,
  sourceNativeId: string,
): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM opportunity_links
     WHERE source = $1 AND source_native_id = $2
     LIMIT 1`,
    [source, sourceNativeId],
  );
  return rows.length > 0;
}

interface LinkRow {
  internalId: string;
  source: string;
  sourceNativeId: string;
  confidence: string;
  matchMethod: string;
  confirmedBy: string | null;
  confirmedAt: string | null;
}

async function insertLink(pool: pg.Pool, link: LinkRow): Promise<void> {
  await pool.query(
    `INSERT INTO opportunity_links
       (internal_id, source, source_native_id, confidence, match_method,
        matched_at, confirmed_by, confirmed_at)
     VALUES ($1, $2, $3, $4::link_confidence, $5, NOW(), $6, $7)
     ON CONFLICT (source, source_native_id) DO NOTHING`,
    [
      link.internalId,
      link.source,
      link.sourceNativeId,
      link.confidence,
      link.matchMethod,
      link.confirmedBy,
      link.confirmedAt,
    ],
  );
}

async function insertUnifiedOpportunity(
  pool: pg.Pool,
  internalId: string,
  n: {
    lifecycleStage: string;
    source: string;
    title: string | null;
    agency: string | null;
    office: string | null;
    naics: string | null;
    psc: string | null;
    setAside: string | null;
    estimatedValueCents: number | null;
    postedAt: string | null;
    responseDueAt: string | null;
    awardAt: string | null;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO opportunities_unified
       (internal_id, lifecycle_stage, primary_source, title, agency, office,
        naics, psc, set_aside, estimated_value_cents, posted_at,
        response_due_at, award_at)
     VALUES ($1, $2::lifecycle_stage, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (internal_id) DO NOTHING`,
    [
      internalId,
      n.lifecycleStage,
      n.source,
      n.title,
      n.agency,
      n.office,
      n.naics,
      n.psc,
      n.setAside,
      n.estimatedValueCents,
      n.postedAt,
      n.responseDueAt,
      n.awardAt,
    ],
  );
}

async function indexExistingUnified(pool: pg.Pool, matcher: MatcherV1): Promise<void> {
  log('Indexing existing unified records for matching...');
  const { rows } = await pool.query(
    `SELECT ou.internal_id, ou.title, ou.agency, ou.naics,
            ou.estimated_value_cents,
            ol.source, ol.source_native_id,
            COALESCE(
              (SELECT o.solicitation_number FROM opportunities o
               WHERE o.sam_notice_id = ol.source_native_id
                  OR o.external_id = ol.source_native_id
               LIMIT 1),
              NULL
            ) AS solicitation_number
     FROM opportunities_unified ou
     JOIN opportunity_links ol ON ol.internal_id = ou.internal_id`,
  );

  for (const row of rows) {
    matcher.index({
      internalId: row.internal_id,
      title: row.title,
      agency: row.agency,
      solicitationNumber: row.solicitation_number,
      naics: row.naics,
      estimatedValueCents: row.estimated_value_cents
        ? Number(row.estimated_value_cents)
        : null,
      source: row.source,
      sourceNativeId: row.source_native_id,
    } satisfies UnifiedRecord);
  }

  log(`Indexed ${rows.length} existing unified link(s)`);
}

// ---------------------------------------------------------------------------
// Cursor management (resume support)
// ---------------------------------------------------------------------------
async function getCursor(pool: pg.Pool): Promise<number> {
  const { rows } = await pool.query(
    `SELECT last_processed_id FROM backfill_cursors WHERE id = $1`,
    [CURSOR_ID],
  );
  return rows[0]?.last_processed_id ?? 0;
}

async function updateCursor(
  pool: pg.Pool,
  lastId: number,
  totalProcessed: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO backfill_cursors (id, last_processed_id, total_processed, status, updated_at)
     VALUES ($1, $2, $3, 'running', NOW())
     ON CONFLICT (id) DO UPDATE SET
       last_processed_id = $2,
       total_processed = $3,
       updated_at = NOW()`,
    [CURSOR_ID, lastId, totalProcessed],
  );
}

async function completeCursor(
  pool: pg.Pool,
  lastId: number,
  totalProcessed: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO backfill_cursors (id, last_processed_id, total_processed, status, updated_at)
     VALUES ($1, $2, $3, 'completed', NOW())
     ON CONFLICT (id) DO UPDATE SET
       last_processed_id = $2,
       total_processed = $3,
       status = 'completed',
       updated_at = NOW()`,
    [CURSOR_ID, lastId, totalProcessed],
  );
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
function printReport(): void {
  console.log('\n========================================');
  console.log('  F-404 Backfill Report');
  console.log('========================================');
  console.log(`  Mode:                    ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Total source rows:       ${stats.totalSourceRows}`);
  console.log(`  Unified opps created:    ${stats.totalUnifiedCreated}`);
  console.log(`  HIGH links:              ${stats.totalHighLinks}`);
  console.log(`  MEDIUM links:            ${stats.totalMediumLinks}`);
  console.log(`  Skipped (no adapter/dup):${stats.totalSkipped}`);
  console.log('  ──────────────────────────');
  console.log('  Rows by source:');
  for (const [src, count] of Object.entries(stats.bySource).sort()) {
    console.log(`    ${src}: ${count}`);
  }
  console.log('========================================\n');
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------
main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
