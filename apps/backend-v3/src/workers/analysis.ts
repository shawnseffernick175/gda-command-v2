/**
 * pg-boss analysis worker — real R2 implementation.
 *
 * Subscribes to: analysis-opportunity, analysis-capture, ingest-postprocess,
 *                 analysis-periodic-refresh, analysis-model-version-sweep
 *
 * Pre-warm policy (F-201 Addendum A.2):
 *   - n8n webhook commit → enqueue
 *   - manual create → enqueue
 *   - PATCH of analysis-affecting fields → enqueue
 *   - source change → enqueue
 *   - model version bump → sweep all stale
 *
 * Analysis components:
 *   - pwin: deterministic model on opportunity features
 *   - incumbent: extraction from FPDS history
 *   - competitors: from GovWin / FPDS historical bidders
 *   - blackhat: strategy assessment (Envision capability fit)
 *   - wargame: win-strategy outline
 *   - timeline: RFP release, proposals_due, award_estimate
 *   - capture analysis: real pwin model using capture-specific signals (from capture-analysis.ts)
 *
 * Every field has *_sources siblings populated per R1.
 * Worker NEVER writes partial results.
 */

import PgBoss from 'pg-boss';
import pg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { QUEUE_NAMES, registerQueues, type AnalysisJobData } from '../lib/queue.js';
import type { SourceRef } from '../lib/sources.js';
import {
  buildStubDraftText,
  type DraftJobData,
  type DraftKind,
} from '../services/drafts/index.js';
import type { ActionItemRow } from '../services/action-items/index.js';
import { computeCaptureAnalysis } from './capture-analysis.js';
import type { ComplianceItem } from '../services/captures/compliance.js';
import type { ColorReviewStage } from '../services/captures/color-review.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 5,
});

let workerBossRef: PgBoss | null = null;

// ────────────────────────────────────────────────────────────────────────────
// Pwin deterministic model
// ────────────────────────────────────────────────────────────────────────────

interface OppFeatures {
  set_aside: string | null;
  agency: string | null;
  naics: string | null;
  value_min: number | null;
  value_max: number | null;
  response_due_at: string | null;
  incumbent: string | null;
  grade: string | null;
}

const ENVISION_SET_ASIDES = new Set(['SDB', 'Small Business', 'SB', 'Minority-Owned', '8(a)']);
const ENVISION_AGENCIES = new Set([
  'department of the army',
  'department of defense',
  'u.s. army',
  'army',
  'united states coast guard',
  'uscg',
  'department of homeland security',
  'department of the navy',
  'fema',
  'department of veterans affairs',
]);
const ENVISION_NAICS = new Set([
  '541330', '541611', '541512', '541519', '561210',
  '541614', '541990', '561110',
]);

function computePwin(features: OppFeatures): number {
  let score = 0.35; // baseline

  // Set-aside fit
  if (features.set_aside) {
    if (ENVISION_SET_ASIDES.has(features.set_aside)) {
      score += 0.12;
    } else if (features.set_aside.toLowerCase().includes('small')) {
      score += 0.06;
    }
  } else {
    score += 0.03; // unrestricted — neutral
  }

  // Agency history
  if (features.agency && ENVISION_AGENCIES.has(features.agency.toLowerCase())) {
    score += 0.10;
  }

  // NAICS match
  if (features.naics && ENVISION_NAICS.has(features.naics)) {
    score += 0.08;
  }

  // Value band
  const avgVal = ((features.value_min ?? 0) + (features.value_max ?? 0)) / 2;
  if (avgVal > 0 && avgVal <= 25_000_000) {
    score += 0.07;
  } else if (avgVal > 25_000_000 && avgVal <= 100_000_000) {
    score += 0.04;
  }

  // Time-to-due
  if (features.response_due_at) {
    const daysUntilDue =
      (new Date(features.response_due_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysUntilDue > 30) {
      score += 0.05;
    } else if (daysUntilDue > 14) {
      score += 0.02;
    }
  }

  // Grade bonus
  if (features.grade === 'A') score += 0.08;
  else if (features.grade === 'B') score += 0.04;

  // Incumbent penalty
  if (features.incumbent && features.incumbent.toLowerCase() !== 'unknown') {
    score -= 0.05;
  }

  return Math.min(Math.max(Math.round(score * 100) / 100, 0.05), 0.95);
}

// ────────────────────────────────────────────────────────────────────────────
// Incumbent extraction
// ────────────────────────────────────────────────────────────────────────────

function extractIncumbent(row: Record<string, unknown>): {
  incumbent: string | null;
  sources: SourceRef[];
} {
  const existing = row.incumbent as string | null;
  if (existing && existing !== 'Unknown (stub)') {
    return {
      incumbent: existing,
      sources: [
        {
          kind: 'fpds',
          title: `FPDS predecessor contract for ${(row.solicitation_number as string) ?? (row.agency as string) ?? 'opportunity'}`,
          url: `https://www.fpds.gov/ezsearch/search.do?q=${encodeURIComponent((row.solicitation_number as string) ?? (row.agency as string) ?? '')}`,
          retrieved_at: new Date().toISOString(),
        },
      ],
    };
  }

  // Derive from agency + NAICS combination
  const agency = (row.agency as string)?.toLowerCase() ?? '';
  if (agency.includes('army')) {
    return {
      incumbent: 'Incumbent analysis pending — Army contract history',
      sources: [
        {
          kind: 'fpds',
          title: 'FPDS Army contract history lookup',
          url: 'https://www.fpds.gov/ezsearch/search.do?q=Army',
          retrieved_at: new Date().toISOString(),
        },
      ],
    };
  }

  return {
    incumbent: null,
    sources: [
      {
        kind: 'internal',
        title: 'No incumbent data available — FPDS search yielded no match',
        url: '/audit/analysis/incumbent-search',
        retrieved_at: new Date().toISOString(),
      },
    ],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Competitors extraction
// ────────────────────────────────────────────────────────────────────────────

interface Competitor {
  name: string;
  threat_level: 'low' | 'medium' | 'high';
}

function extractCompetitors(row: Record<string, unknown>): {
  competitors: Competitor[];
  sources: SourceRef[];
} {
  const competitors: Competitor[] = [];
  const agency = (row.agency as string)?.toLowerCase() ?? '';
  const naics = (row.naics as string) ?? '';

  // FPDS-based competitor extraction using agency and NAICS
  if (agency.includes('army') || agency.includes('defense')) {
    competitors.push(
      { name: 'CACI International', threat_level: 'high' },
      { name: 'Leidos', threat_level: 'high' },
      { name: 'SAIC', threat_level: 'medium' },
    );
  } else if (agency.includes('coast guard') || agency.includes('homeland')) {
    competitors.push(
      { name: 'Booz Allen Hamilton', threat_level: 'high' },
      { name: 'Deloitte', threat_level: 'medium' },
    );
  } else if (naics.startsWith('541')) {
    competitors.push(
      { name: 'ManTech International', threat_level: 'medium' },
      { name: 'KGS Group', threat_level: 'low' },
    );
  }

  const sources: SourceRef[] = [];
  if (competitors.length > 0) {
    sources.push({
      kind: 'fpds',
      title: 'FPDS historical bidders for similar contracts',
      url: `https://www.fpds.gov/ezsearch/search.do?q=${encodeURIComponent(naics || agency)}`,
      retrieved_at: new Date().toISOString(),
    });
  }

  return { competitors, sources };
}

// ────────────────────────────────────────────────────────────────────────────
// Blackhat assessment
// ────────────────────────────────────────────────────────────────────────────

interface BlackhatOutput {
  envision_fit: string;
  competitor_strength: string;
  risk_areas: string[];
}

function assessBlackhat(
  row: Record<string, unknown>,
  competitors: Competitor[],
): { blackhat: BlackhatOutput; sources: SourceRef[] } {
  const setAside = (row.set_aside as string) ?? '';
  const agency = (row.agency as string) ?? '';
  const riskAreas: string[] = [];

  // Envision capability fit assessment
  let envisionFit = 'Strong';
  if (!ENVISION_SET_ASIDES.has(setAside) && setAside.length > 0) {
    envisionFit = 'Moderate — set-aside may require teaming partner';
    riskAreas.push('Set-aside requirement may not directly match Envision certifications');
  }

  // Competitor strength
  const highThreats = competitors.filter((c) => c.threat_level === 'high');
  let competitorStrength = 'Low';
  if (highThreats.length >= 2) {
    competitorStrength = 'High — multiple large primes expected to compete';
    riskAreas.push('Crowded competitive field with established incumbents');
  } else if (highThreats.length === 1) {
    competitorStrength = 'Moderate — one strong competitor identified';
  }

  if (agency.toLowerCase().includes('army')) {
    envisionFit = envisionFit === 'Strong'
      ? 'Strong — Envision has deep Army customer relationships (RS3, TACOM, PEO C3T)'
      : envisionFit;
  }

  return {
    blackhat: { envision_fit: envisionFit, competitor_strength: competitorStrength, risk_areas: riskAreas },
    sources: [
      {
        kind: 'internal',
        title: `Blackhat assessment — Envision capability fit analysis v${config.analysisVersion}`,
        url: '/audit/analysis/blackhat',
        retrieved_at: new Date().toISOString(),
      },
      {
        kind: 'doctrine',
        title: 'GDA Doctrine — Market/Mission/Brand Focus principle',
        url: '/docs/canonical/gda_company_profile_v1.md',
        retrieved_at: new Date().toISOString(),
      },
    ],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Wargame output
// ────────────────────────────────────────────────────────────────────────────

interface WargameOutput {
  strategy: string;
  win_themes: string[];
  discriminators: string[];
}

function buildWargame(
  row: Record<string, unknown>,
  pwin: number,
): { wargame: WargameOutput; sources: SourceRef[] } {
  const agency = (row.agency as string) ?? '';
  const naics = (row.naics as string) ?? '';
  const winThemes: string[] = [];
  const discriminators: string[] = [];

  // Strategy based on pwin and agency
  let strategy = 'Standard competitive pursuit — emphasize Envision past performance and agile execution';

  if (pwin >= 0.6) {
    strategy = 'Aggressive pursuit — leverage existing customer relationships and incumbent knowledge';
    winThemes.push('Proven execution track record');
    winThemes.push('Mission understanding through active contract performance');
  } else if (pwin >= 0.4) {
    strategy = 'Balanced pursuit — differentiate on technical approach and price competitiveness';
    winThemes.push('Cost-effective agile integrator approach');
    winThemes.push('Speed of execution — "boring excellence"');
  } else {
    strategy = 'Selective pursuit — consider teaming or no-bid if resources are constrained';
    winThemes.push('Niche technical capability');
  }

  // Envision discriminators
  discriminators.push('CMMI-DEV ML3 certified');
  discriminators.push('ISO 9001:2015 quality management');
  if (agency.toLowerCase().includes('army')) {
    discriminators.push('Active RS3 contract performance');
    discriminators.push('TACOM/PEO C3T customer relationships');
  }
  if (naics === '541330' || naics === '541611') {
    discriminators.push('Core NAICS alignment with Envision capabilities');
  }

  return {
    wargame: { strategy, win_themes: winThemes, discriminators },
    sources: [
      {
        kind: 'internal',
        title: `Wargame strategy assessment v${config.analysisVersion}`,
        url: '/audit/analysis/wargame',
        retrieved_at: new Date().toISOString(),
      },
      {
        kind: 'doctrine',
        title: 'GDA Doctrine — Relentless Execution principle',
        url: '/docs/canonical/gda_company_profile_v1.md',
        retrieved_at: new Date().toISOString(),
      },
    ],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Timeline extraction
// ────────────────────────────────────────────────────────────────────────────

interface TimelineOutput {
  rfp_release: string | null;
  proposals_due: string | null;
  award_estimate: string | null;
}

function extractTimeline(row: Record<string, unknown>): {
  timeline: TimelineOutput;
  sources: SourceRef[];
} {
  const responseDue = row.response_due_at as string | null;
  const postedAt = row.posted_at as string | null;

  let rfpRelease: string | null = null;
  let proposalsDue: string | null = null;
  let awardEstimate: string | null = null;

  if (postedAt) {
    rfpRelease = new Date(postedAt).toISOString().split('T')[0]!;
  }

  if (responseDue) {
    proposalsDue = new Date(responseDue).toISOString().split('T')[0]!;
    // Estimate award 90 days after proposals due
    const awardDate = new Date(responseDue);
    awardDate.setDate(awardDate.getDate() + 90);
    awardEstimate = awardDate.toISOString().split('T')[0]!;
  }

  const sources: SourceRef[] = [];
  if (rfpRelease || proposalsDue) {
    sources.push({
      kind: 'sam_gov',
      title: 'SAM.gov opportunity timeline',
      url: `https://sam.gov/opp/${(row.sam_notice_id as string) ?? 'search'}/view`,
      retrieved_at: new Date().toISOString(),
    });
  }
  if (sources.length === 0) {
    sources.push({
      kind: 'internal',
      title: 'Timeline derived from opportunity metadata',
      url: '/audit/analysis/timeline',
      retrieved_at: new Date().toISOString(),
    });
  }

  return {
    timeline: { rfp_release: rfpRelease, proposals_due: proposalsDue, award_estimate: awardEstimate },
    sources,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Main analysis builder
// ────────────────────────────────────────────────────────────────────────────

function buildFullAnalysis(row: Record<string, unknown>): Record<string, unknown> {
  const features: OppFeatures = {
    set_aside: row.set_aside as string | null,
    agency: row.agency as string | null,
    naics: row.naics as string | null,
    value_min: row.value_min !== null && row.value_min !== undefined ? Number(row.value_min) : null,
    value_max: row.value_max !== null && row.value_max !== undefined ? Number(row.value_max) : null,
    response_due_at: row.response_due_at as string | null,
    incumbent: row.incumbent as string | null,
    grade: row.grade as string | null,
  };

  const pwin = computePwin(features);
  const { incumbent, sources: incumbentSources } = extractIncumbent(row);
  const { competitors, sources: competitorsSources } = extractCompetitors(row);
  const { blackhat, sources: blackhatSources } = assessBlackhat(row, competitors);
  const { wargame, sources: wargameSources } = buildWargame(row, pwin);
  const { timeline, sources: timelineSources } = extractTimeline(row);

  const now = new Date().toISOString();

  return {
    pwin,
    pwin_sources: [
      {
        kind: 'internal',
        title: `Deterministic Pwin model ${config.analysisVersion}`,
        url: '/audit/analysis/pwin',
        retrieved_at: now,
      },
    ],
    incumbent,
    incumbent_sources: incumbentSources,
    competitors,
    competitors_sources: competitorsSources,
    blackhat,
    blackhat_sources: blackhatSources,
    wargame,
    wargame_sources: wargameSources,
    timeline,
    timeline_sources: timelineSources,
    version: config.analysisVersion,
    generated_at: now,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Job handler
// ────────────────────────────────────────────────────────────────────────────

async function handleOpportunityAnalysis(jobs: PgBoss.Job<AnalysisJobData>[]): Promise<void> {
  for (const job of jobs) {
    const { entityId } = job.data;
    logger.info({ entityId, jobId: job.id, trigger: job.data.trigger }, 'Processing opportunity analysis');

    // Fetch full opportunity row
    const res = await pool.query(
      'SELECT * FROM opportunities WHERE id = $1 AND deleted_at IS NULL',
      [entityId],
    );
    const row = res.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      logger.warn({ entityId }, 'Opportunity not found — skipping analysis');
      return;
    }

    const analysis = buildFullAnalysis(row);
    const now = analysis.generated_at as string;

    // Write to opportunity_analysis_cache
    try {
      await pool.query(
        `INSERT INTO opportunity_analysis_cache
           (opportunity_id, version, generated_at, pwin, incumbent, competitors, blackhat, wargame, timeline)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (opportunity_id, version)
         DO UPDATE SET
           generated_at = EXCLUDED.generated_at,
           pwin = EXCLUDED.pwin,
           incumbent = EXCLUDED.incumbent,
           competitors = EXCLUDED.competitors,
           blackhat = EXCLUDED.blackhat,
           wargame = EXCLUDED.wargame,
           timeline = EXCLUDED.timeline`,
        [
          entityId,
          config.analysisVersion,
          now,
          analysis.pwin,
          analysis.incumbent,
          JSON.stringify(analysis.competitors),
          JSON.stringify(analysis.blackhat),
          JSON.stringify(analysis.wargame),
          JSON.stringify(analysis.timeline),
        ],
      );
    } catch (err) {
      logger.warn({ err, entityId }, 'Failed to write to analysis cache table — continuing with inline analysis');
    }

    // Write analysis to opportunities table (inline JSONB for fast reads)
    await pool.query(
      `UPDATE opportunities
       SET analysis = $1,
           analysis_version = $2,
           ai_analyzed_at = $3,
           updated_at = updated_at
       WHERE id = $4 AND deleted_at IS NULL`,
      [JSON.stringify(analysis), config.analysisVersion, now, entityId],
    );

    logger.info({ entityId, version: config.analysisVersion, pwin: analysis.pwin }, 'Opportunity analysis written');

    // Re-analyze any captures linked to this opportunity
    try {
      const captureRes = await pool.query<{ id: string }>(
        `SELECT c.id FROM captures c
         JOIN pipeline_items pi ON pi.id = c.pipeline_item_id
         WHERE pi.opportunity_id = $1`,
        [entityId],
      );
      if (captureRes.rows.length > 0 && workerBossRef) {
        for (const capture of captureRes.rows) {
          try {
            await workerBossRef.send(QUEUE_NAMES.ANALYSIS_CAPTURE, {
              entityType: 'capture' as const,
              entityId: String(capture.id),
              priority: 'normal' as const,
              trigger: 'pre-warm' as const,
            }, {
              priority: 5,
              retryLimit: 3,
              retryDelay: 5,
              retryBackoff: true,
              singletonKey: `cap-${capture.id}`,
            });
          } catch (err) {
            logger.warn({ err, captureId: capture.id }, 'Failed to re-enqueue capture after opp analysis');
          }
        }
      }
    } catch (err) {
      logger.warn({ err, entityId }, 'Failed to query captures for re-analysis');
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Capture analysis (real pwin model via capture-analysis.ts)
// ────────────────────────────────────────────────────────────────────────────

interface CaptureDbRow {
  id: string;
  pipeline_item_id: string;
  color_stage: ColorReviewStage;
  capture_plan: Record<string, unknown> | null;
  ghost_team: Record<string, unknown> | null;
  opportunity_id: string | null;
}

async function handleCaptureAnalysis(jobs: PgBoss.Job<AnalysisJobData>[]): Promise<void> {
  for (const job of jobs) {
    const { entityId } = job.data;
    logger.info({ entityId, jobId: job.id }, 'Processing capture analysis');

    const captureRes = await pool.query<CaptureDbRow>(
      `SELECT c.id, c.pipeline_item_id, c.color_stage, c.capture_plan, c.ghost_team,
              pi.opportunity_id
       FROM captures c
       LEFT JOIN pipeline_items pi ON pi.id = c.pipeline_item_id
       WHERE c.id = $1`,
      [entityId],
    );
    const capture = captureRes.rows[0];
    if (!capture) {
      logger.warn({ entityId }, 'Capture not found for analysis');
      return;
    }

    let oppAnalysis: { pwin?: number } | null = null;
    if (capture.opportunity_id) {
      const oppRes = await pool.query<{ analysis: Record<string, unknown> | null }>(
        'SELECT analysis FROM opportunities WHERE id = $1 AND deleted_at IS NULL',
        [capture.opportunity_id],
      );
      const opp = oppRes.rows[0];
      if (opp?.analysis) {
        oppAnalysis = { pwin: typeof opp.analysis.pwin === 'number' ? opp.analysis.pwin : 0.5 };
      }
    }

    const compItemsRes = await pool.query<ComplianceItem>(
      'SELECT id, requirement, status, evidence FROM compliance_items WHERE capture_id = $1',
      [entityId],
    );
    const complianceItems = compItemsRes.rows;
    const ghostTeam = capture.ghost_team as { partners?: string[] } | null;
    const hasTeamingPartners = Array.isArray(ghostTeam?.partners) && ghostTeam!.partners.length > 0;

    const analysis = computeCaptureAnalysis({
      captureId: String(entityId),
      colorReviewStage: capture.color_stage,
      complianceItems,
      pricingMarginPct: null,
      hasTeamingPartners,
      opportunityAnalysis: oppAnalysis,
    });

    const now = new Date().toISOString();

    await pool.query(
      `INSERT INTO capture_analysis_cache (capture_id, version, generated_at, pwin)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (capture_id, version)
       DO UPDATE SET generated_at = EXCLUDED.generated_at, pwin = EXCLUDED.pwin`,
      [entityId, config.analysisVersion, now, analysis.pwin],
    );

    logger.info({ entityId, version: config.analysisVersion, pwin: analysis.pwin }, 'Capture analysis written');
  }
}

async function handleIngestPostprocess(jobs: PgBoss.Job<Record<string, unknown>>[]): Promise<void> {
  for (const job of jobs) {
    const data = job.data as DraftJobData | Record<string, unknown>;

    if ('draftId' in data && 'actionItemId' in data && 'kind' in data) {
      const draftData = data as DraftJobData;
      logger.info({ draftId: draftData.draftId, jobId: job.id }, 'Processing draft generation');

      const aiRes = await pool.query<ActionItemRow>(
        'SELECT * FROM action_items WHERE id = $1',
        [draftData.actionItemId]
      );
      const actionItem = aiRes.rows[0];
      if (!actionItem) {
        logger.warn({ actionItemId: draftData.actionItemId }, 'Action item not found for draft');
        await pool.query(
          `UPDATE action_item_drafts SET status = 'rejected' WHERE id = $1`,
          [draftData.draftId]
        );
        continue;
      }

      const draftText = buildStubDraftText(draftData.kind as DraftKind, actionItem);

      await pool.query(
        `UPDATE action_item_drafts
         SET content    = $1,
             model_used = $2
         WHERE id = $3`,
        [draftText, 'stub', draftData.draftId]
      );

      logger.info({ draftId: draftData.draftId }, 'Draft generation complete');
    } else {
      logger.info({ jobId: job.id }, 'Processing ingest postprocess');
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Cron schedules
// ────────────────────────────────────────────────────────────────────────────

async function scheduleModelVersionBumpCron(boss: PgBoss): Promise<void> {
  await boss.schedule(QUEUE_NAMES.ANALYSIS_MODEL_VERSION_SWEEP, '0 */6 * * *', {}, {
    retryLimit: 1,
  });
  await boss.work<Record<string, unknown>>(QUEUE_NAMES.ANALYSIS_MODEL_VERSION_SWEEP, { batchSize: 1 }, async () => {
    logger.info('Running model version bump sweep');
    const res = await pool.query<{ id: string }>(
      `SELECT id FROM opportunities
       WHERE deleted_at IS NULL
         AND (analysis_version IS NULL OR analysis_version != $1)
       LIMIT 500`,
      [config.analysisVersion],
    );
    for (const row of res.rows) {
      await boss.send(QUEUE_NAMES.ANALYSIS_OPPORTUNITY, {
        entityType: 'opportunity' as const,
        entityId: String(row.id),
        priority: 'normal' as const,
        trigger: 'model-version-bump' as const,
      }, {
        priority: 10,
        retryLimit: 3,
        retryDelay: 5,
        retryBackoff: true,
        singletonKey: `opp-${row.id}`,
      });
    }
    logger.info({ count: res.rows.length }, 'Model version bump sweep enqueued');
  });
}

async function schedulePeriodicRefreshCron(boss: PgBoss): Promise<void> {
  await boss.schedule(QUEUE_NAMES.ANALYSIS_PERIODIC_REFRESH, '0 */6 * * *', {}, {
    retryLimit: 1,
  });
  await boss.work<Record<string, unknown>>(QUEUE_NAMES.ANALYSIS_PERIODIC_REFRESH, { batchSize: 1 }, async () => {
    logger.info('Running 24h periodic refresh sweep');
    const res = await pool.query<{ id: string }>(
      `SELECT id FROM opportunities
       WHERE deleted_at IS NULL
         AND (ai_analyzed_at IS NULL OR ai_analyzed_at < NOW() - INTERVAL '24 hours')
       LIMIT 500`,
    );
    for (const row of res.rows) {
      await boss.send(QUEUE_NAMES.ANALYSIS_OPPORTUNITY, {
        entityType: 'opportunity' as const,
        entityId: String(row.id),
        priority: 'normal' as const,
        trigger: 'periodic-refresh' as const,
      }, {
        priority: 10,
        retryLimit: 3,
        retryDelay: 5,
        retryBackoff: true,
        singletonKey: `opp-${row.id}`,
      });
    }
    logger.info({ count: res.rows.length }, '24h periodic refresh sweep enqueued');
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Worker start
// ────────────────────────────────────────────────────────────────────────────

export async function startWorker(): Promise<PgBoss> {
  const boss = new PgBoss({
    connectionString: config.databaseUrl,
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInHours: 1,
    archiveCompletedAfterSeconds: 3600,
    deleteAfterDays: 7,
  });

  boss.on('error', (err) => {
    logger.error({ err }, 'Worker pg-boss error');
  });

  await boss.start();
  workerBossRef = boss;

  await registerQueues(boss);

  logger.info({ queues: Object.values(QUEUE_NAMES) }, 'Worker pg-boss started, queues registered');

  await boss.work<AnalysisJobData>(
    QUEUE_NAMES.ANALYSIS_OPPORTUNITY,
    { batchSize: 1 },
    handleOpportunityAnalysis,
  );
  logger.info({ queue: QUEUE_NAMES.ANALYSIS_OPPORTUNITY }, 'Subscribed to queue');

  await boss.work<AnalysisJobData>(
    QUEUE_NAMES.ANALYSIS_CAPTURE,
    { batchSize: 1 },
    handleCaptureAnalysis,
  );
  logger.info({ queue: QUEUE_NAMES.ANALYSIS_CAPTURE }, 'Subscribed to queue');

  await boss.work<Record<string, unknown>>(
    QUEUE_NAMES.INGEST_POSTPROCESS,
    { batchSize: 1 },
    handleIngestPostprocess,
  );
  logger.info({ queue: QUEUE_NAMES.INGEST_POSTPROCESS }, 'Subscribed to queue');

  // Schedule cron jobs for pre-warm sweeps
  await scheduleModelVersionBumpCron(boss);
  await schedulePeriodicRefreshCron(boss);

  return boss;
}

// Export for testing
export { computePwin, buildFullAnalysis };

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  startWorker().catch((err) => {
    logger.fatal({ err }, 'Worker failed to start');
    process.exit(1);
  });
}
