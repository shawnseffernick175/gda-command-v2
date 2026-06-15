/**
 * FasTrac Army Installation Signal Ingestion — Tier 1.
 *
 * Polls SAM.gov for each Tier 1 installation using keyword + org-path
 * filters, normalises matches into fast_track_signals with installation
 * and unit tagging.
 *
 * Dedup: ON CONFLICT (source_url) DO NOTHING — same pattern as the
 * innovation-org ingestion (PR #842).
 *
 * Source of truth for every installation name, mission tag, and search
 * term: docs/dev-notes/2026-06-15_research_army_bases.md
 */

import { logger } from '../../lib/logger.js';
import { pool } from '../../lib/db.js';
import { getSAMApiKey } from '../sam/client.js';
import {
  TIER1_INSTALLATIONS,
  TIER1_UNIT_CHANNELS,
  type Tier1Installation,
  type Tier1UnitChannel,
} from './tier1-catalog.js';
import type { SAMOpportunityRaw, SAMSearchResponse } from '../sam/types.js';
import type { IngestResult } from '../framework/registry.js';

const SAM_SEARCH_URL = 'https://api.sam.gov/opportunities/v2/search';
const PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = parseInt(process.env.SAM_REQUEST_TIMEOUT_MS ?? '60000', 10);
const REQUEST_DELAY_MS = 600;
const LOOKBACK_HOURS = 48;

function toSAMDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function buildSAMUrl(noticeId: string): string {
  return `https://sam.gov/opp/${noticeId}/view`;
}

/**
 * Infer horizon from posting language heuristics.
 */
function inferHorizon(title: string, description: string | undefined): string {
  const text = `${title} ${description ?? ''}`.toLowerCase();
  if (/immediate|urgent|asap|within\s+30\s+day|within\s+60\s+day/.test(text)) return '0-6mo';
  if (/fy\s*2[0-9]\b|next\s+fiscal|12.month|annual/.test(text)) return '6-12mo';
  if (/multi.year|idiq|5.year|long.range|out.year/.test(text)) return '12-24mo';
  if (/baa|broad\s+agency|research|concept/.test(text)) return '12-24mo';
  return '0-6mo';
}

/**
 * Extract extra mission tags from posting body.
 */
function extractBodyTags(title: string, description: string | undefined): string[] {
  const text = `${title} ${description ?? ''}`.toLowerCase();
  const tags: string[] = [];
  const patterns: [RegExp, string][] = [
    [/c[45]isr/i, 'C5ISR'],
    [/cyber/i, 'cyber'],
    [/ai\b|artificial\s+intelligence|machine\s+learning/i, 'AI/ML'],
    [/logistics|sustainment/i, 'logistics'],
    [/autonomous|unmanned|uas|uav/i, 'autonomous systems'],
    [/medical|medevac|surgical/i, 'medical'],
    [/missile|rocket|munition/i, 'missiles'],
    [/radar|sensor|electronic\s+warfare|ew\b/i, 'EW/sensors'],
    [/training|simulation|ste\b/i, 'training'],
    [/network|comms|communication/i, 'networking'],
    [/space|satellite/i, 'space'],
    [/vehicle|stryker|abrams|bradley/i, 'ground vehicles'],
    [/sbir|sttr/i, 'SBIR/STTR'],
  ];
  for (const [re, tag] of patterns) {
    if (re.test(text)) tags.push(tag);
  }
  return tags;
}

/**
 * Search SAM.gov for a single keyword phrase within a date window.
 * Returns raw opportunity records.
 */
async function searchSAM(
  apiKey: string,
  keyword: string,
  fromDate: Date,
  toDate: Date,
): Promise<SAMOpportunityRaw[]> {
  const url = new URL(SAM_SEARCH_URL);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('postedFrom', toSAMDate(fromDate));
  url.searchParams.set('postedTo', toSAMDate(toDate));
  url.searchParams.set('limit', String(PAGE_SIZE));
  url.searchParams.set('offset', '0');
  url.searchParams.set('keyword', keyword);

  try {
    const resp = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      logger.warn(
        { keyword, status: resp.status, body: text.slice(0, 200) },
        'fastrac_army_sam_search_error',
      );
      return [];
    }

    const data = (await resp.json()) as SAMSearchResponse;
    return data.opportunitiesData ?? [];
  } catch (err) {
    logger.warn(
      { keyword, error: err instanceof Error ? err.message : String(err) },
      'fastrac_army_sam_search_failed',
    );
    return [];
  }
}

/**
 * Check whether a SAM opportunity matches an installation by org-path fragments.
 */
function matchesOrgPath(raw: SAMOpportunityRaw, orgFragments: string[]): boolean {
  const orgPath = raw.fullParentPathName?.toLowerCase() ?? '';
  return orgFragments.some((frag) => orgPath.includes(frag.toLowerCase()));
}

const UPSERT_SQL = `
  INSERT INTO fast_track_signals (
    pipeline, source, title, summary, mission_tags, problem_tags,
    horizon, signal_strength, source_url, published_at, ingested_at,
    pipeline_side, institution_type, institution_name,
    installation, unit
  ) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, NOW(),
    $11, $12, $13,
    $14, $15
  )
  ON CONFLICT DO NOTHING
`;

/**
 * Insert a signal into fast_track_signals with dedup on source_url.
 * Returns true if inserted, false if duplicate.
 */
async function insertSignal(params: {
  source: string;
  title: string;
  summary: string | null;
  missionTags: string[];
  horizon: string;
  sourceUrl: string;
  publishedAt: string | null;
  institutionType: string;
  institutionName: string;
  installation: string;
  unit: string | null;
}): Promise<boolean> {
  // Pre-check for existing source_url to avoid inserting duplicates
  const exists = await pool.query(
    'SELECT 1 FROM fast_track_signals WHERE source_url = $1 LIMIT 1',
    [params.sourceUrl],
  );
  if (exists.rows.length > 0) return false;

  const result = await pool.query(UPSERT_SQL, [
    'requirement',                // pipeline — installation signals are needs/requirements
    params.source,                // source
    params.title,                 // title
    params.summary,               // summary
    params.missionTags,           // mission_tags
    [],                           // problem_tags
    params.horizon,               // horizon
    3,                            // signal_strength (default medium)
    params.sourceUrl,             // source_url
    params.publishedAt,           // published_at
    'government',                 // pipeline_side
    params.institutionType,       // institution_type
    params.institutionName,       // institution_name
    params.installation,          // installation
    params.unit,                  // unit
  ]);

  return (result.rowCount ?? 0) > 0;
}

/**
 * Ingest signals for a single Tier 1 installation.
 */
async function ingestInstallation(
  apiKey: string,
  inst: Tier1Installation,
  fromDate: Date,
  toDate: Date,
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  const seenUrls = new Set<string>();

  for (const keyword of inst.samKeywords) {
    const rawOpps = await searchSAM(apiKey, keyword, fromDate, toDate);

    for (const raw of rawOpps) {
      if (!raw.noticeId) { skipped++; continue; }

      const sourceUrl = raw.uiLink ?? buildSAMUrl(raw.noticeId);
      if (seenUrls.has(sourceUrl)) continue;
      seenUrls.add(sourceUrl);

      // Validate match: either org-path matches or keyword was specific enough
      const orgMatch = inst.samOrgFragments.length === 0 || matchesOrgPath(raw, inst.samOrgFragments);
      const titleMatch = inst.samKeywords.some((kw) =>
        raw.title?.toLowerCase().includes(kw.toLowerCase()),
      );
      if (!orgMatch && !titleMatch) {
        // Keyword hit but no org-path or title match — likely false positive
        skipped++;
        continue;
      }

      const bodyTags = extractBodyTags(raw.title ?? '', raw.description);
      const allTags = [...new Set([...inst.missionTags, ...bodyTags])];
      const horizon = inferHorizon(raw.title ?? '', raw.description);

      try {
        const ok = await insertSignal({
          source: inst.name,
          title: raw.title ?? 'Untitled',
          summary: raw.description?.slice(0, 2000) ?? null,
          missionTags: allTags,
          horizon,
          sourceUrl,
          publishedAt: raw.postedDate ?? null,
          institutionType: inst.institutionType,
          institutionName: inst.name,
          installation: inst.name,
          unit: null,
        });
        if (ok) inserted++;
        else skipped++;
      } catch (err) {
        logger.error(
          { installation: inst.name, noticeId: raw.noticeId, error: err instanceof Error ? err.message : String(err) },
          'fastrac_army_insert_error',
        );
        skipped++;
      }
    }

    // Rate limit between keyword searches
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  }

  return { inserted, skipped };
}

/**
 * Ingest signals for a single Tier 1 unit innovation channel.
 * Uses SAM.gov keyword search (most unit channels are captured via SAM).
 */
async function ingestUnitChannel(
  apiKey: string,
  ch: Tier1UnitChannel,
  fromDate: Date,
  toDate: Date,
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  const seenUrls = new Set<string>();

  for (const keyword of ch.samKeywords) {
    const rawOpps = await searchSAM(apiKey, keyword, fromDate, toDate);

    for (const raw of rawOpps) {
      if (!raw.noticeId) { skipped++; continue; }

      const sourceUrl = raw.uiLink ?? buildSAMUrl(raw.noticeId);
      if (seenUrls.has(sourceUrl)) continue;
      seenUrls.add(sourceUrl);

      const bodyTags = extractBodyTags(raw.title ?? '', raw.description);
      const allTags = [...new Set([...ch.missionTags, ...bodyTags])];
      const horizon = inferHorizon(raw.title ?? '', raw.description);

      try {
        const ok = await insertSignal({
          source: ch.name,
          title: raw.title ?? 'Untitled',
          summary: raw.description?.slice(0, 2000) ?? null,
          missionTags: allTags,
          horizon,
          sourceUrl,
          publishedAt: raw.postedDate ?? null,
          institutionType: ch.institutionType,
          institutionName: ch.unit,
          installation: ch.installation,
          unit: ch.unit,
        });
        if (ok) inserted++;
        else skipped++;
      } catch (err) {
        logger.error(
          { unit: ch.name, noticeId: raw.noticeId, error: err instanceof Error ? err.message : String(err) },
          'fastrac_army_unit_insert_error',
        );
        skipped++;
      }
    }

    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  }

  return { inserted, skipped };
}

/**
 * Main entry point — run the full Tier 1 Army installation ingestion.
 */
export async function runFastracArmyIngest(): Promise<IngestResult> {
  const apiKey = getSAMApiKey();
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000);

  logger.info(
    {
      source: 'fastrac-army',
      installationCount: TIER1_INSTALLATIONS.filter((i) => i.enabled).length,
      unitCount: TIER1_UNIT_CHANNELS.filter((u) => u.enabled).length,
      fromDate: fromDate.toISOString(),
      toDate: toDate.toISOString(),
    },
    'fastrac_army_ingest_start',
  );

  let totalInserted = 0;
  let totalSkipped = 0;

  // Phase 1: Installation-level signals (Pattern A — SAM.gov keyword + org-path)
  for (const inst of TIER1_INSTALLATIONS) {
    if (!inst.enabled) {
      logger.info({ installation: inst.name }, 'fastrac_army_installation_disabled');
      totalSkipped++;
      continue;
    }

    try {
      const result = await ingestInstallation(apiKey, inst, fromDate, toDate);
      totalInserted += result.inserted;
      totalSkipped += result.skipped;
      logger.info(
        { installation: inst.name, inserted: result.inserted, skipped: result.skipped },
        'fastrac_army_installation_done',
      );
    } catch (err) {
      logger.error(
        { installation: inst.name, error: err instanceof Error ? err.message : String(err) },
        'fastrac_army_installation_error',
      );
    }
  }

  // Phase 2: Unit innovation channel signals (Pattern B — SAM keyword for unit names)
  for (const ch of TIER1_UNIT_CHANNELS) {
    if (!ch.enabled) {
      logger.info({ unit: ch.name }, 'fastrac_army_unit_disabled');
      totalSkipped++;
      continue;
    }

    try {
      const result = await ingestUnitChannel(apiKey, ch, fromDate, toDate);
      totalInserted += result.inserted;
      totalSkipped += result.skipped;
      logger.info(
        { unit: ch.name, inserted: result.inserted, skipped: result.skipped },
        'fastrac_army_unit_done',
      );
    } catch (err) {
      logger.error(
        { unit: ch.name, error: err instanceof Error ? err.message : String(err) },
        'fastrac_army_unit_error',
      );
    }
  }

  logger.info(
    { source: 'fastrac-army', inserted: totalInserted, skipped: totalSkipped },
    'fastrac_army_ingest_complete',
  );

  return { inserted: totalInserted, updated: 0, skipped: totalSkipped };
}
