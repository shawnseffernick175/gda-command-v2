/**
 * FasTrac technology-pipeline sync.
 *
 * The research feeds (arXiv, NSF, NIH, SBIR) ingest into the `opportunities`
 * table (Ops Tracker store). FasTrac's UI reads emerging-technology signals
 * from `fast_track_signals` (pipeline='tech'), so those feeds never surfaced
 * in FasTrac. This job mirrors the *lane-relevant* subset of recent research
 * opportunities into fast_track_signals(pipeline='tech'), giving the
 * emerging-technology pipeline live data instead of leaving it empty.
 *
 * It is a read-then-upsert sweep over recent rows — it does not touch the feed
 * jobs and is fully reversible (unschedule the cron). Dedup is on source_url
 * (the paper/award link), matching the fast_track_signals unique index, so it
 * is idempotent across overlapping windows.
 *
 * Relevance: only opportunities matching Envision's lanes (defense IT, cyber,
 * C5ISR, SETA, AI/autonomy, space) are mirrored — the whole point of #1132 was
 * that the raw feed firehose is noise, so an unfiltered mirror is not wanted.
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import type { IngestResult } from '../framework/registry.js';

/** Research data_source → FasTrac tech-signal presentation. */
const SOURCE_META: Record<
  string,
  { display: string; institutionType: string; fundingMechanism: string | null; horizon: string; strength: number }
> = {
  arxiv: { display: 'arXiv', institutionType: 'ACADEMIA', fundingMechanism: null, horizon: '12-24mo', strength: 2 },
  nsf: { display: 'NSF', institutionType: 'ACADEMIA', fundingMechanism: 'Grant', horizon: '12-24mo', strength: 3 },
  nih: { display: 'NIH', institutionType: 'ACADEMIA', fundingMechanism: 'Grant', horizon: '12-24mo', strength: 3 },
  sbir: { display: 'DoD SBIR/STTR', institutionType: 'AGENCY', fundingMechanism: 'SBIR/STTR', horizon: '6-12mo', strength: 4 },
};

const RESEARCH_SOURCES = Object.keys(SOURCE_META);

/** Days of recent research opportunities to consider each run. */
const SYNC_WINDOW_DAYS = 10;

/**
 * Envision lane keyword → mission tag. A signal must hit at least one lane to
 * be mirrored; matched tags become its mission_tags. Kept intentionally tight
 * to keep the emerging-technology pipeline signal-dense.
 */
const LANE_KEYWORDS: Array<{ tag: string; patterns: RegExp }> = [
  { tag: 'cyber', patterns: /\b(cyber|zero.?trust|malware|ransomware|intrusion|encryption|cryptograph|vulnerabilit|exploit|threat intelligence)\b/i },
  { tag: 'C5ISR', patterns: /\b(isr|c2|c4isr|c5isr|jadc2|command and control|sensor fusion|electronic warfare|sigint|signals intelligence|radar|spectrum|geospatial|imagery)\b/i },
  { tag: 'AI/ML', patterns: /\b(machine learning|deep learning|artificial intelligence|\bai\b|\bml\b|neural network|computer vision|natural language|large language model|\bllm\b|reinforcement learning)\b/i },
  { tag: 'autonomous systems', patterns: /\b(autonomous|autonomy|unmanned|\buav\b|\buas\b|\bugv\b|drone|swarm|robotic)\b/i },
  { tag: 'networking', patterns: /\b(satcom|5g\b|mesh network|tactical network|communications|waveform|software.?defined radio|\bsdr\b|resilient network)\b/i },
  { tag: 'space', patterns: /\b(space|satellite|orbital|hypersonic|missile|launch vehicle)\b/i },
  { tag: 'cloud/edge', patterns: /\b(edge computing|cloud migration|devsecops|kubernetes|containeriz|zero.?trust architecture)\b/i },
];

// Defense context for the arXiv gate: explicit defense words plus "hard
// defense" domain terms that are effectively military even when a paper never
// says "military" (e.g. ISR, electronic warfare, hypersonic, counter-UAS).
// Tuned against production arXiv volume: admits ~5% of the feed (signal-dense),
// vs. requiring a literal "defense/military" word which admitted <1%.
const DEFENSE_CONTEXT =
  /\b(defense|defence|military|warfighter|dod|department of defense|department of war|army|navy|air force|marine|combatant|tactical|battlefield|national security|joint force|isr|electronic warfare|sigint|jadc2|missile|hypersonic|unmanned|uav|swarm|radar|weapon|warfare|contested|gps.?denied|counter.?uas)\b/i;

interface CandidateRow {
  title: string;
  description: string | null;
  tags: string[] | null;
  data_source: string;
  published_at: string | null;
  source_url: string;
}

/**
 * Decide whether a research opportunity is lane-relevant, returning the matched
 * mission tags (empty ⇒ not relevant). arXiv is held to a stricter bar (it must
 * also read as defense-relevant) because its raw volume is the largest.
 */
export function assessTechRelevance(row: CandidateRow): string[] {
  const haystack = `${row.title} ${row.description ?? ''} ${(row.tags ?? []).join(' ')}`;
  const tags = LANE_KEYWORDS.filter((l) => l.patterns.test(haystack)).map((l) => l.tag);
  if (tags.length === 0) return [];

  // arXiv is the highest-volume, lowest-specificity feed — require an explicit
  // defense/military context in addition to a lane hit to keep it signal-dense.
  if (row.data_source === 'arxiv' && !DEFENSE_CONTEXT.test(haystack)) return [];

  return tags;
}

/**
 * Mirror lane-relevant recent research opportunities into
 * fast_track_signals(pipeline='tech'). Idempotent (dedup on source_url).
 */
export async function runFastracTechSync(): Promise<IngestResult> {
  logger.info({ sources: RESEARCH_SOURCES, windowDays: SYNC_WINDOW_DAYS }, 'fastrac_tech_sync_start');

  const { rows } = await pool.query<CandidateRow>(
    `SELECT o.title,
            o.description,
            o.tags,
            o.data_source,
            o.posted_at AS published_at,
            s.url AS source_url
       FROM opportunities o
       JOIN sources s ON s.id = o.source_id
      WHERE o.data_source = ANY($1)
        AND o.created_at > NOW() - ($2 || ' days')::interval
        AND s.url IS NOT NULL`,
    [RESEARCH_SOURCES, String(SYNC_WINDOW_DAYS)],
  );

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    const missionTags = assessTechRelevance(row);
    if (missionTags.length === 0) {
      skipped++;
      continue;
    }

    const meta = SOURCE_META[row.data_source];
    if (!meta) {
      skipped++;
      continue;
    }

    try {
      const result = await pool.query<{ is_insert: boolean }>(
        `INSERT INTO fast_track_signals
           (pipeline, source, title, summary, mission_tags, horizon,
            signal_strength, source_url, published_at, ingested_at,
            funding_mechanism, institution_type, signal_type)
         VALUES
           ('tech', $1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, 'solution')
         ON CONFLICT (source_url) WHERE source_url IS NOT NULL
         DO UPDATE SET
           title = EXCLUDED.title,
           mission_tags = EXCLUDED.mission_tags,
           ingested_at = NOW(),
           summary = COALESCE(EXCLUDED.summary, fast_track_signals.summary)
         RETURNING (xmax = 0) AS is_insert`,
        [
          meta.display,
          row.title,
          row.description,
          missionTags,
          meta.horizon,
          meta.strength,
          row.source_url,
          row.published_at,
          meta.fundingMechanism,
          meta.institutionType,
        ],
      );
      if (result.rows[0]?.is_insert) inserted++;
      else updated++;
    } catch (err) {
      errors++;
      logger.error(
        { source: row.data_source, url: row.source_url, error: err instanceof Error ? err.message : String(err) },
        'fastrac_tech_sync_write_error',
      );
    }
  }

  logger.info(
    { candidates: rows.length, inserted, updated, skipped, errors },
    'fastrac_tech_sync_complete',
  );

  const degraded = errors > 0;
  return {
    inserted,
    updated,
    skipped,
    degraded,
    degradedReason: degraded ? `${errors} tech-signal write error(s)` : undefined,
    stats: { candidates: rows.length, errors },
  };
}
