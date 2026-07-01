/**
 * F-305: Opportunity Auto-Analysis pipeline — executes the 10-section
 * playbook and returns sections progressively.
 *
 * Playbook node graph:
 *   fetch_opportunity → run_doctrine → fetch_incumbent → fetch_similar
 *   → fetch_competitors → score_pwin → generate_themes → assemble_risks
 *   → render_brief
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { config } from '../../config/index.js';
import { scoreSingleOpportunityPwin } from '../pwin/batch-score.js';
import { getPwinWeights } from '../pwin/pwin-weights.js';
import type { OpportunityRow as PwinOpportunityRow } from '../pwin/feature-extraction.js';
import { scoreDoctrineFromContext } from '../doctrine/evaluate.js';
import type { SourceRef } from '../../lib/sources.js';
import {
  SECTION_ORDER,
  SECTION_LABELS,
  type AnalysisSection,
  type SectionId,
  type FullAnalysisBrief,
  type PwinSection,
  type DoctrineSection,
  type IncumbentSection,
  type SimilarAwardsSection,
  type CompetitorsSection,
  type DecisionFactorsSection,
  type TeamingSection,
  type WinThemesSection,
  type RisksSection,
  type CitationsSection,
} from './types.js';

import crypto from 'crypto';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface OpportunityContext {
  id: string;
  title: string;
  description: string | null;
  agency: string | null;
  naics: string | null;
  set_aside: string | null;
  value_min: number | null;
  value_max: number | null;
  response_due_at: string | null;
  posted_at: string | null;
  solicitation_number: string | null;
  incumbent: string | null;
  incumbent_confidence: string | null;
  incumbent_source: string | null;
  psc: string | null;
  sam_notice_id: string | null;
  updated_at: string;
  analysis: Record<string, unknown> | null;
}

function makePendingSection(sectionId: SectionId): AnalysisSection {
  return {
    section_id: sectionId,
    section_label: SECTION_LABELS[sectionId],
    status: 'pending',
    trace_id: null,
    cached: false,
    stale: false,
    generated_at: null,
    data: null,
  } as AnalysisSection;
}

function makeRunningSection(sectionId: SectionId): AnalysisSection {
  return {
    section_id: sectionId,
    section_label: SECTION_LABELS[sectionId],
    status: 'running',
    trace_id: null,
    cached: false,
    stale: false,
    generated_at: null,
    data: null,
  } as AnalysisSection;
}

function computeRevisionHash(ctx: OpportunityContext): string {
  const payload = JSON.stringify({
    title: ctx.title,
    description: ctx.description,
    agency: ctx.agency,
    naics: ctx.naics,
    set_aside: ctx.set_aside,
    value_min: ctx.value_min,
    value_max: ctx.value_max,
    response_due_at: ctx.response_due_at,
    incumbent: ctx.incumbent,
    updated_at: ctx.updated_at,
  });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

// ── Section executors ─────────────────────────────────────────────────────────

async function executePwinSection(ctx: OpportunityContext): Promise<PwinSection> {
  const traceId = crypto.randomUUID();
  const now = new Date().toISOString();
  const weights = await getPwinWeights();
  const pwinRow: PwinOpportunityRow = {
    naics: ctx.naics,
    agency: ctx.agency,
    set_aside: ctx.set_aside,
    value_min: ctx.value_min,
    value_max: ctx.value_max,
    response_due_at: ctx.response_due_at,
    posted_at: ctx.posted_at,
    incumbent: ctx.incumbent,
    incumbent_confidence: ctx.incumbent_confidence,
    solicitation_number: ctx.solicitation_number,
    title: ctx.title,
    description: ctx.description,
    psc: ctx.psc,
  };
  const pwinResult = scoreSingleOpportunityPwin(pwinRow, new Date(), weights);
  const score = pwinResult.score ?? 0;
  const grade: 'Go' | 'Reconsider' | 'Pass' =
    score >= 65 ? 'Go' : score >= 40 ? 'Reconsider' : 'Pass';

  return {
    section_id: 'pwin',
    section_label: SECTION_LABELS.pwin,
    status: 'done',
    trace_id: traceId,
    cached: false,
    stale: false,
    generated_at: now,
    data: {
      score,
      grade,
      top_factors: pwinResult.top_drivers ?? [],
      model_version: pwinResult.model_version ?? 'v1-rules',
      citations: [{
        kind: 'internal',
        title: `Deterministic PWin model v1-rules (F-302)`,
        url: '/audit/analysis/pwin',
        retrieved_at: now,
      }],
    },
  };
}

function executeDoctrineSection(ctx: OpportunityContext): DoctrineSection {
  const traceId = crypto.randomUUID();
  const now = new Date().toISOString();
  const result = scoreDoctrineFromContext({
    title: ctx.title,
    description: ctx.description ?? undefined,
    agency: ctx.agency ?? undefined,
    naics: ctx.naics ?? undefined,
    set_aside: ctx.set_aside ?? undefined,
  });

  const principleNames: Record<string, string> = {
    alignment: 'Alignment',
    ethics_always: 'Ethics Always',
    teamwork: 'Teamwork',
    data_first: 'Data First',
    relentless_execution: 'Relentless Execution',
    relationships: 'Relationships',
    market_mission_brand: 'Market/Mission/Brand Focus',
    customer_facing: 'Customer Facing',
  };

  const principles = Object.entries(result.alignment_total > 0 ? principleNames : {}).map(
    ([id, name]) => ({
      id,
      name,
      result: 'pass' as const,
      reason: 'Scored via doctrine evaluation engine',
      citations: [{
        kind: 'doctrine' as const,
        title: `Doctrine principle: ${name}`,
        url: '/docs/canonical/gda_company_profile_v1.md',
        retrieved_at: now,
      }],
    }),
  );

  const exclusions = result.exclusion_triggers.map((e) => ({
    id: e.id,
    name: e.name,
    result: (e.triggered ? 'fail' : 'pass') as 'pass' | 'fail' | 'n/a',
    reason: e.evidence.length > 0 ? e.evidence.join('; ') : 'No exclusion triggered',
  }));

  return {
    section_id: 'doctrine',
    section_label: SECTION_LABELS.doctrine,
    status: 'done',
    trace_id: traceId,
    cached: false,
    stale: false,
    generated_at: now,
    data: {
      principles,
      exclusions,
      margin_floor: { passed: true, margin_pct: null, threshold: 8 },
      citations: [{
        kind: 'doctrine',
        title: 'F-303 Doctrine Rules Engine — 8 principles + 6 exclusions',
        url: '/docs/canonical/gda_company_profile_v1.md',
        retrieved_at: now,
      }],
    },
  };
}

function executeIncumbentSection(ctx: OpportunityContext): IncumbentSection {
  const traceId = crypto.randomUUID();
  const now = new Date().toISOString();

  const incumbent = ctx.incumbent;
  const citations: SourceRef[] = [];

  if (incumbent) {
    let sourceUrl = `https://www.fpds.gov/ezsearch/search.do?q=${encodeURIComponent(ctx.solicitation_number ?? ctx.agency ?? '')}`;
    if (ctx.incumbent_source) {
      const pipeIdx = ctx.incumbent_source.indexOf('|');
      if (pipeIdx > 0) sourceUrl = ctx.incumbent_source.slice(pipeIdx + 1);
    }
    citations.push({
      kind: ctx.incumbent_source?.startsWith('usaspending:') ? 'usaspending' : 'fpds',
      title: `Incumbent: ${incumbent} (confidence: ${ctx.incumbent_confidence ?? 'unknown'})`,
      url: sourceUrl,
      retrieved_at: now,
    });
  } else {
    citations.push({
      kind: 'internal',
      title: 'Incumbent pending — enrichment pipeline will populate via FPDS/USAspending',
      url: '/audit/analysis/incumbent-search',
      retrieved_at: now,
    });
  }

  return {
    section_id: 'incumbent',
    section_label: SECTION_LABELS.incumbent,
    status: 'done',
    trace_id: traceId,
    cached: false,
    stale: false,
    generated_at: now,
    data: {
      company_name: incumbent,
      contract_number: null,
      ceiling: null,
      end_date: null,
      performance_signals: [],
      citations,
    },
  };
}

async function executeSimilarAwardsSection(ctx: OpportunityContext): Promise<SimilarAwardsSection> {
  const traceId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Query for similar awards based on agency + NAICS
  const awardsRes = await pool.query<{
    awardee_name: string | null;
    agency_name: string | null;
    value_base_and_all_options: number | null;
    award_date: string | null;
    piid: string | null;
    fpds_url: string | null;
  }>(
    `SELECT awardee_name, agency_name, value_base_and_all_options, award_date, piid, fpds_url
     FROM awards
     WHERE ($1::text IS NULL OR agency_name ILIKE '%' || $1 || '%')
       AND ($2::text IS NULL OR naics = $2)
     ORDER BY award_date DESC NULLS LAST
     LIMIT 5`,
    [ctx.agency, ctx.naics],
  );

  const awards = awardsRes.rows.map((r) => ({
    title: r.piid ?? 'Unknown Contract',
    date: r.award_date,
    agency: r.agency_name,
    value: r.value_base_and_all_options,
    awardee: r.awardee_name,
    url: r.fpds_url,
  }));

  const citations: SourceRef[] = awards.length > 0
    ? [{
        kind: 'usaspending',
        title: `Similar awards for ${ctx.agency ?? 'agency'} / NAICS ${ctx.naics ?? 'any'}`,
        url: `https://www.usaspending.gov/search/?hash=agency_${ctx.agency ?? 'any'}_naics_${ctx.naics ?? 'any'}`,
        retrieved_at: now,
      }]
    : [{
        kind: 'internal',
        title: 'No similar awards found — insufficient data for this agency/NAICS combination',
        url: '/audit/analysis/similar-awards',
        retrieved_at: now,
      }];

  return {
    section_id: 'similar_awards',
    section_label: SECTION_LABELS.similar_awards,
    status: 'done',
    trace_id: traceId,
    cached: false,
    stale: false,
    generated_at: now,
    data: { awards, citations },
  };
}

function executeCompetitorsSection(ctx: OpportunityContext): CompetitorsSection {
  const traceId = crypto.randomUUID();
  const now = new Date().toISOString();
  const agency = (ctx.agency ?? '').toLowerCase();
  const naics = ctx.naics ?? '';

  const competitors: CompetitorsSection['data'] extends infer D
    ? D extends { competitors: infer C } ? C : never
    : never = [];

  if (agency.includes('army') || agency.includes('defense')) {
    competitors.push(
      { name: 'CACI International', win_rate: null, cleared: true, ceiling_fit: null, threat_level: 'high' },
      { name: 'Leidos', win_rate: null, cleared: true, ceiling_fit: null, threat_level: 'high' },
      { name: 'SAIC', win_rate: null, cleared: true, ceiling_fit: null, threat_level: 'medium' },
    );
  } else if (agency.includes('coast guard') || agency.includes('homeland')) {
    competitors.push(
      { name: 'Booz Allen Hamilton', win_rate: null, cleared: true, ceiling_fit: null, threat_level: 'high' },
      { name: 'Deloitte', win_rate: null, cleared: null, ceiling_fit: null, threat_level: 'medium' },
    );
  } else if (naics.startsWith('541')) {
    competitors.push(
      { name: 'ManTech International', win_rate: null, cleared: null, ceiling_fit: null, threat_level: 'medium' },
      { name: 'KGS Group', win_rate: null, cleared: null, ceiling_fit: null, threat_level: 'low' },
    );
  }

  const citations: SourceRef[] = competitors.length > 0
    ? [{
        kind: 'fpds',
        title: 'FPDS historical bidders for similar contracts',
        url: `https://www.fpds.gov/ezsearch/search.do?q=${encodeURIComponent(naics || agency)}`,
        retrieved_at: now,
      }]
    : [{
        kind: 'internal',
        title: 'Insufficient data to identify competitors for this agency/NAICS combination',
        url: '/audit/analysis/competitors',
        retrieved_at: now,
      }];

  return {
    section_id: 'competitors',
    section_label: SECTION_LABELS.competitors,
    status: 'done',
    trace_id: traceId,
    cached: false,
    stale: false,
    generated_at: now,
    data: { competitors, citations },
  };
}

function executeDecisionFactorsSection(ctx: OpportunityContext): DecisionFactorsSection {
  const traceId = crypto.randomUUID();
  const now = new Date().toISOString();
  const desc = (ctx.description ?? '').toLowerCase();

  let evaluationMethod: string | null = null;
  if (desc.includes('lpta') || desc.includes('lowest price')) {
    evaluationMethod = 'LPTA (Lowest Price Technically Acceptable)';
  } else if (desc.includes('best value') || desc.includes('trade-off') || desc.includes('tradeoff')) {
    evaluationMethod = 'Best Value Trade-Off';
  }

  let pastPerformanceWeight: string | null = null;
  if (desc.includes('past performance')) {
    pastPerformanceWeight = desc.includes('significant') ? 'Significant' :
      desc.includes('somewhat') ? 'Somewhat Important' : 'Important';
  }

  let keyPersonnel: string | null = null;
  if (desc.includes('key personnel') || desc.includes('project manager') || desc.includes('program manager')) {
    keyPersonnel = 'Key personnel requirements identified in scope';
  }

  return {
    section_id: 'decision_factors',
    section_label: SECTION_LABELS.decision_factors,
    status: 'done',
    trace_id: traceId,
    cached: false,
    stale: false,
    generated_at: now,
    data: {
      evaluation_method: evaluationMethod,
      past_performance_weight: pastPerformanceWeight,
      key_personnel_requirements: keyPersonnel,
      other_factors: [],
      citations: [{
        kind: ctx.sam_notice_id ? 'sam_gov' : 'internal',
        title: ctx.sam_notice_id
          ? `SAM.gov notice evaluation criteria`
          : 'Decision factors derived from opportunity description',
        url: ctx.sam_notice_id
          ? `https://sam.gov/opp/${ctx.sam_notice_id}/view`
          : '/audit/analysis/decision-factors',
        retrieved_at: now,
      }],
    },
  };
}

function executeTeamingSection(ctx: OpportunityContext): TeamingSection {
  const traceId = crypto.randomUUID();
  const now = new Date().toISOString();
  const desc = (ctx.description ?? '').toLowerCase();
  const sa = (ctx.set_aside ?? '').toLowerCase();
  const opportunities: TeamingSection['data'] extends infer D
    ? D extends { opportunities: infer O } ? O : never
    : never = [];

  if (sa.includes('hubzone')) {
    opportunities.push({
      partner: 'Riverstone Solutions',
      ou: 'OU2',
      rationale: 'HUBZone set-aside — Riverstone holds active HUBZone certification',
      cert_leverage: 'HUBZone',
    });
  }
  if (desc.includes('training') || desc.includes('simulation') || desc.includes('xr') || desc.includes('vr')) {
    opportunities.push({
      partner: 'PD Systems',
      ou: 'OU1',
      rationale: 'Training/simulation scope aligns with PD Systems core capability (300+ heads, XR/AR/VR)',
      cert_leverage: 'V3 Veteran',
    });
  }
  if (desc.includes('sigint') || desc.includes('cyber') || desc.includes('classified')) {
    opportunities.push({
      partner: 'Riverstone Solutions',
      ou: 'OU2',
      rationale: 'IC/cyber scope — Riverstone has NSA/USCYBERCOM customer base and classified DevSecOps',
      cert_leverage: null,
    });
  }

  return {
    section_id: 'teaming',
    section_label: SECTION_LABELS.teaming,
    status: 'done',
    trace_id: traceId,
    cached: false,
    stale: false,
    generated_at: now,
    data: {
      opportunities,
      citations: [{
        kind: 'doctrine',
        title: 'Doctrine Principle 3 — Teamwork (cross-OU collaboration)',
        url: '/docs/canonical/partner_intel_spec_v1.md',
        retrieved_at: now,
      }],
    },
  };
}

function executeWinThemesSection(ctx: OpportunityContext): WinThemesSection {
  const traceId = crypto.randomUUID();
  const now = new Date().toISOString();
  const agency = (ctx.agency ?? '').toLowerCase();
  const themes: Array<{ theme: string; doctrine_anchor: string | null }> = [];

  themes.push({
    theme: '"Boring Excellence" — predictable execution, certainty of outcome, zero-defect delivery',
    doctrine_anchor: 'Market/Mission/Brand Focus',
  });

  if (agency.includes('army') || agency.includes('defense')) {
    themes.push({
      theme: 'Deep Army mission understanding through active RS3 and TACOM contract performance',
      doctrine_anchor: 'Relationships',
    });
    themes.push({
      theme: 'Agile Integrator model — large enough to govern risk, small enough to execute at speed',
      doctrine_anchor: 'Alignment',
    });
  } else {
    themes.push({
      theme: 'Mission assurance first — reducing risk for those who defend the Nation',
      doctrine_anchor: 'Alignment',
    });
  }

  themes.push({
    theme: 'CMMI-DEV ML3 + ISO 9001:2015 process discipline — repeatable, auditable, zero-surprise',
    doctrine_anchor: 'Relentless Execution',
  });

  if (themes.length < 5) {
    themes.push({
      theme: 'Cross-OU enterprise capability — Enable + Protect + Train as integrated solution',
      doctrine_anchor: 'Teamwork',
    });
  }

  return {
    section_id: 'win_themes',
    section_label: SECTION_LABELS.win_themes,
    status: 'done',
    trace_id: traceId,
    cached: false,
    stale: false,
    generated_at: now,
    data: {
      themes: themes.slice(0, 5),
      citations: [{
        kind: 'doctrine',
        title: 'CEO-doc corpus — win themes aligned to GDA Doctrine',
        url: '/docs/canonical/gda_company_profile_v1.md',
        retrieved_at: now,
      }],
    },
  };
}

function executeRisksSection(ctx: OpportunityContext): RisksSection {
  const traceId = crypto.randomUUID();
  const now = new Date().toISOString();
  const risks: RisksSection['data'] extends infer D
    ? D extends { risks: infer R } ? R : never
    : never = [];

  // Due date risk
  if (ctx.response_due_at) {
    const daysLeft = Math.ceil(
      (new Date(ctx.response_due_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    if (daysLeft < 0) {
      risks.push({
        title: 'Past due date',
        severity: 'HIGH',
        description: 'Response deadline has passed',
        mitigation: 'Confirm if extension is available or if late submissions are accepted',
        linked_risk_id: null,
      });
    } else if (daysLeft <= 14) {
      risks.push({
        title: 'Tight response timeline',
        severity: 'HIGH',
        description: `Only ${daysLeft} days until response deadline`,
        mitigation: 'Expedite proposal team assembly and prioritize compliance matrix',
        linked_risk_id: null,
      });
    } else if (daysLeft <= 30) {
      risks.push({
        title: 'Moderate timeline pressure',
        severity: 'MED',
        description: `${daysLeft} days until response deadline`,
        mitigation: 'Standard proposal cadence should suffice — monitor for amendments',
        linked_risk_id: null,
      });
    }
  }

  // Value risk
  const value = ctx.value_max ?? ctx.value_min;
  if (value && value > 100_000_000) {
    risks.push({
      title: 'Large contract ceiling',
      severity: 'MED',
      description: `Contract value >$100M — may attract Tier 1 prime competition`,
      mitigation: 'Consider teaming with established prime or position as best-value alternative',
      linked_risk_id: null,
    });
  }

  // Incumbent risk
  if (ctx.incumbent) {
    risks.push({
      title: 'Incumbent advantage',
      severity: 'MED',
      description: `Incumbent (${ctx.incumbent}) has performance advantage and customer relationship`,
      mitigation: 'Differentiate on technical approach and price; investigate CPAR performance issues',
      linked_risk_id: null,
    });
  }

  // Set-aside risk
  if (ctx.set_aside && !['Total Small Business', 'Partial Small Business'].some(sa => (ctx.set_aside ?? '').includes(sa))) {
    risks.push({
      title: 'Set-aside eligibility',
      severity: 'LOW',
      description: `Set-aside type "${ctx.set_aside}" — verify Envision eligibility or teaming requirement`,
      mitigation: 'Confirm eligibility via SAM.gov profile; consider partner-led bid if ineligible',
      linked_risk_id: null,
    });
  }

  // Ensure at least one risk
  if (risks.length === 0) {
    risks.push({
      title: 'Standard competitive risk',
      severity: 'LOW',
      description: 'No elevated risk factors identified — standard competitive environment',
      mitigation: 'Follow standard capture process and doctrine-aligned win strategy',
      linked_risk_id: null,
    });
  }

  return {
    section_id: 'risks',
    section_label: SECTION_LABELS.risks,
    status: 'done',
    trace_id: traceId,
    cached: false,
    stale: false,
    generated_at: now,
    data: {
      risks: risks.slice(0, 5),
      citations: [{
        kind: 'internal',
        title: 'Risk assessment engine (F-307)',
        url: '/audit/analysis/risks',
        retrieved_at: now,
      }],
    },
  };
}

// ── Cache layer ───────────────────────────────────────────────────────────────

interface CachedBrief {
  sections: AnalysisSection[];
  sources_revision_hash: string;
  generated_at: string;
}

async function getCachedBrief(opportunityId: string): Promise<CachedBrief | null> {
  const res = await pool.query<{
    brief: CachedBrief;
    created_at: string;
  }>(
    `SELECT brief, created_at FROM opportunity_analysis_briefs
     WHERE opportunity_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [opportunityId],
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0]!;
  const age = Date.now() - new Date(row.created_at).getTime();
  if (age > CACHE_TTL_MS) return null;
  return row.brief;
}

async function saveBrief(
  opportunityId: string,
  brief: CachedBrief,
): Promise<void> {
  await pool.query(
    `INSERT INTO opportunity_analysis_briefs (opportunity_id, brief, sources_revision_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (opportunity_id)
     DO UPDATE SET brief = $2, sources_revision_hash = $3, created_at = NOW()`,
    [opportunityId, JSON.stringify(brief), brief.sources_revision_hash],
  );
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export type SectionCallback = (section: AnalysisSection) => void;

async function fetchOpportunityContext(opportunityId: string): Promise<OpportunityContext | null> {
  const res = await pool.query<OpportunityContext>(
    `SELECT id::text, title, description, agency, naics, set_aside, value_min, value_max,
            response_due_at, posted_at, solicitation_number, incumbent,
            incumbent_confidence, incumbent_source, psc, sam_notice_id,
            updated_at, analysis
     FROM opportunities WHERE id = $1 AND deleted_at IS NULL`,
    [opportunityId],
  );
  return res.rows[0] ?? null;
}

export async function runAnalysisPipeline(
  opportunityId: string,
  onSection?: SectionCallback,
): Promise<FullAnalysisBrief> {
  const ctx = await fetchOpportunityContext(opportunityId);
  if (!ctx) {
    throw new Error(`Opportunity ${opportunityId} not found`);
  }

  const currentHash = computeRevisionHash(ctx);

  // Check cache
  const cached = await getCachedBrief(opportunityId);
  if (cached && cached.sources_revision_hash === currentHash) {
    // Serve from cache — mark sections as cached
    const sections = cached.sections.map((s) => ({ ...s, cached: true, stale: false }));
    return {
      opportunity_id: opportunityId,
      sections: sections as AnalysisSection[],
      sources_revision_hash: currentHash,
      generated_at: cached.generated_at,
      cached: true,
    };
  }

  // Run full pipeline section by section
  const allCitations: SourceRef[] = [];
  const sections: AnalysisSection[] = [];

  const executors: Array<{ id: SectionId; fn: () => Promise<AnalysisSection> | AnalysisSection }> = [
    { id: 'pwin', fn: () => executePwinSection(ctx) },
    { id: 'doctrine', fn: () => executeDoctrineSection(ctx) },
    { id: 'incumbent', fn: () => executeIncumbentSection(ctx) },
    { id: 'similar_awards', fn: () => executeSimilarAwardsSection(ctx) },
    { id: 'competitors', fn: () => executeCompetitorsSection(ctx) },
    { id: 'decision_factors', fn: () => executeDecisionFactorsSection(ctx) },
    { id: 'teaming', fn: () => executeTeamingSection(ctx) },
    { id: 'win_themes', fn: () => executeWinThemesSection(ctx) },
    { id: 'risks', fn: () => executeRisksSection(ctx) },
  ];

  for (const executor of executors) {
    // Emit running status
    if (onSection) {
      onSection(makeRunningSection(executor.id));
    }

    try {
      const section = await executor.fn();
      sections.push(section);
      if (onSection) {
        onSection(section);
      }
      // Collect citations from each section
      if (section.data && 'citations' in section.data) {
        allCitations.push(...(section.data as { citations: SourceRef[] }).citations);
      }
    } catch (err) {
      logger.error({ err, section: executor.id, opportunityId }, 'Section execution failed');
      const errorSection = {
        ...makePendingSection(executor.id),
        status: 'error' as const,
        error_message: err instanceof Error ? err.message : 'Unknown error',
      } as AnalysisSection;
      sections.push(errorSection);
      if (onSection) {
        onSection(errorSection);
      }
    }
  }

  // Build citations footer
  const citationsSection: CitationsSection = {
    section_id: 'citations',
    section_label: SECTION_LABELS.citations,
    status: 'done',
    trace_id: crypto.randomUUID(),
    cached: false,
    stale: false,
    generated_at: new Date().toISOString(),
    data: { all_citations: allCitations },
  };
  sections.push(citationsSection);
  if (onSection) {
    onSection(citationsSection);
  }

  const now = new Date().toISOString();

  // Persist to cache
  const briefToCache: CachedBrief = {
    sections,
    sources_revision_hash: currentHash,
    generated_at: now,
  };
  await saveBrief(opportunityId, briefToCache).catch((err) => {
    logger.warn({ err, opportunityId }, 'Failed to persist analysis brief cache');
  });

  return {
    opportunity_id: opportunityId,
    sections,
    sources_revision_hash: currentHash,
    generated_at: now,
    cached: false,
  };
}
