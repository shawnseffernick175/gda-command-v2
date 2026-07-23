/**
 * Color Team F-300 runtime.
 *
 * Turns an uploaded document into per-color findings:
 *  - pink/red/black/blue/white/green qualitative findings come from the LLM,
 *    grounded strictly in the uploaded document text (+ optional RFP context).
 *    The LLM never supplies numbers, citations, or URLs.
 *  - green additionally produces DETERMINISTIC quantitative outputs from
 *    authoritative backend data: doctrine scorecard + exclusions (doctrine
 *    engine), a margin check (pricing scenarios + configured floor), and a
 *    source-traceable pricing strategy (Financial Bible indirects/fee bands).
 *
 * Nothing is fabricated. Missing document text, malformed/invalid LLM output,
 * or LLM errors abort the run (the caller marks it `error`); missing pricing or
 * doctrine inputs yield explicit unavailable states, never zeros or a pass.
 */

import type { Pool as PgPool } from 'pg';
import { llmRouter } from '../../lib/llm-router.js';
import { parseFile } from '../rag/parser.js';
import { evaluateDoctrineDetail } from '../doctrine/evaluate.js';
import type { EntityContext } from '../doctrine/evaluate.js';
import { getConfigValue } from '../doctrine/config.js';
import { logger } from '../../lib/logger.js';
import { COLOR_PROMPTS } from './prompts.js';
import type {
  ColorTeamColor,
  ColorTeamRunRow,
  Citation,
  DoctrineScoreRow,
  MarginCheck,
  PricingStrategy,
  PricingStrategyFact,
  FindingSeverity,
} from './types.js';
import { COLOR_TEAM_SEVERITIES } from './types.js';

/** A finding ready to persist (run_id supplied by the caller). */
export interface ColorTeamFindingDraft {
  color: ColorTeamColor;
  severity: FindingSeverity;
  section_ref?: string | null;
  finding: string;
  recommended_fix?: string | null;
  citations?: Citation[];
  doctrine_score?: DoctrineScoreRow[] | null;
  exclusion_hits?: string[] | null;
  margin_check?: MarginCheck | null;
  pricing_strategy?: PricingStrategy | null;
}

/** Fabricated-citation hosts / placeholders that must never be persisted. */
const FAKE_CITATION_HOST = 'gda-command.internal';
const MAX_DOCUMENT_CHARS = 60_000;
const DEFAULT_MARGIN_FLOOR_PCT = 8;

interface DocumentLite {
  id: string;
  filename: string;
  storage_path: string;
}

interface OpportunityContext extends EntityContext {
  id: string;
}

interface PricingScenarioRow {
  id: string;
  margin_pct: number;
  total_price: number;
  fee_pct: number;
  contract_type: string | null;
  bible_version_id: string;
}

interface IndirectRow {
  contract_type: string;
  fringe_pct: number;
  overhead_pct: number;
  ga_pct: number;
  fee_band_low: number;
  fee_band_high: number;
}

/**
 * Run the full color-team analysis for a run and return finding drafts.
 * Throws on any condition that must NOT produce fabricated findings (missing
 * document text, LLM failure, malformed/invalid LLM output).
 */
export async function runColorTeamAnalysis(
  pool: PgPool,
  run: ColorTeamRunRow
): Promise<ColorTeamFindingDraft[]> {
  const doc = await fetchDocument(pool, String(run.document_id));
  if (!doc) {
    throw new Error(`Document ${run.document_id} not found — no findings generated`);
  }

  const documentText = await extractDocumentText(doc);
  if (!documentText.trim()) {
    throw new Error(
      'Document text is empty or unreadable — no findings generated (findings are never fabricated)'
    );
  }

  const docCitation: Citation = {
    source: doc.filename,
    url: `/documents/${doc.id}`,
    grade: 'A',
  };

  const opportunity = run.linked_rfp_id
    ? await fetchOpportunityContext(pool, run.linked_rfp_id)
    : null;

  const rfpCitation: Citation | null = opportunity
    ? { source: `RFP / Opportunity #${opportunity.id}`, url: `/opportunities/${opportunity.id}`, grade: 'B' }
    : null;

  const rfpContext = opportunity
    ? [opportunity.title, opportunity.agency, opportunity.description]
        .filter((v): v is string => Boolean(v))
        .join('\n')
        .slice(0, MAX_DOCUMENT_CHARS)
    : null;

  const excerpt = documentText.slice(0, MAX_DOCUMENT_CHARS);
  const colors = (run.colors as ColorTeamColor[]).filter((c) => c in COLOR_PROMPTS);

  const drafts: ColorTeamFindingDraft[] = [];

  for (const color of colors) {
    const prompt = COLOR_PROMPTS[color];
    const res = await llmRouter.route({
      task: 'color_team_review' as const,
      input: {
        color,
        role: prompt.role,
        focus: prompt.description,
        document_filename: doc.filename,
        document_excerpt: excerpt,
        rfp_context: rfpContext,
      },
      opts: { object_ref: `color_team_run:${run.id}:${color}` },
    });

    if (!res.ok) {
      throw new Error(`Color Team ${color} LLM analysis failed: ${res.error_message}`);
    }

    const citations = rfpCitation ? [docCitation, rfpCitation] : [docCitation];
    for (const f of validateReviewOutput(res.output, color)) {
      drafts.push({
        color,
        severity: f.severity,
        section_ref: f.section_ref,
        finding: f.finding,
        recommended_fix: f.recommended_fix,
        citations,
      });
    }
  }

  if (colors.includes('green')) {
    drafts.push(await buildGreenSummary(pool, run, opportunity, docCitation, rfpCitation));
  }

  // Final guard: every persisted finding must carry a real, searchable citation (R1).
  for (const d of drafts) {
    assertRealCitations(d.citations ?? [], d.color);
  }

  return drafts;
}

// ── Document handling ───────────────────────────────────────────────────────

async function fetchDocument(pool: PgPool, id: string): Promise<DocumentLite | null> {
  const res = await pool.query<DocumentLite>(
    'SELECT id, filename, storage_path FROM documents WHERE id = $1',
    [id]
  );
  return res.rows[0] ?? null;
}

async function extractDocumentText(doc: DocumentLite): Promise<string> {
  try {
    const parsed = await parseFile(doc.storage_path);
    return parsed.text ?? '';
  } catch (err) {
    logger.error({ err, docId: doc.id, storagePath: doc.storage_path }, 'Color team document parse failed');
    throw new Error(
      `Uploaded document could not be read (${doc.filename}) — no findings generated`
    );
  }
}

// ── LLM output validation ─────────────────────────────────────────────────

interface ValidatedFinding {
  severity: FindingSeverity;
  section_ref: string | null;
  finding: string;
  recommended_fix: string | null;
}

function validateReviewOutput(output: unknown, color: ColorTeamColor): ValidatedFinding[] {
  if (!output || typeof output !== 'object' || !Array.isArray((output as { findings?: unknown }).findings)) {
    throw new Error(`Color Team ${color} returned malformed output (missing findings array)`);
  }
  const rawFindings = (output as { findings: unknown[] }).findings;
  const validated: ValidatedFinding[] = [];

  for (const raw of rawFindings) {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`Color Team ${color} returned an invalid finding entry`);
    }
    const r = raw as Record<string, unknown>;
    const severity = r['severity'];
    if (typeof severity !== 'string' || !(COLOR_TEAM_SEVERITIES as readonly string[]).includes(severity)) {
      throw new Error(`Color Team ${color} returned an invalid severity: ${String(severity)}`);
    }
    const finding = r['finding'];
    if (typeof finding !== 'string' || finding.trim().length === 0) {
      throw new Error(`Color Team ${color} returned a finding with no text`);
    }
    const sectionRef = r['section_ref'];
    if (sectionRef != null && typeof sectionRef !== 'string') {
      throw new Error(`Color Team ${color} returned an invalid section_ref`);
    }
    const recommendedFix = r['recommended_fix'];
    if (recommendedFix != null && typeof recommendedFix !== 'string') {
      throw new Error(`Color Team ${color} returned an invalid recommended_fix`);
    }
    validated.push({
      severity: severity as FindingSeverity,
      section_ref: (sectionRef as string | undefined) ?? null,
      finding: finding.trim(),
      recommended_fix: (recommendedFix as string | undefined) ?? null,
    });
  }
  return validated;
}

function assertRealCitations(citations: Citation[], color: ColorTeamColor): void {
  if (citations.length === 0) {
    throw new Error(`Color Team ${color} finding has no citation (R1 violation)`);
  }
  for (const c of citations) {
    if (!c.url || c.url === '#' || c.url.includes(FAKE_CITATION_HOST)) {
      throw new Error(`Color Team ${color} finding has a non-searchable citation URL: ${c.url}`);
    }
  }
}

// ── Green deterministic analysis ───────────────────────────────────────────

async function buildGreenSummary(
  pool: PgPool,
  run: ColorTeamRunRow,
  opportunity: OpportunityContext | null,
  docCitation: Citation,
  rfpCitation: Citation | null
): Promise<ColorTeamFindingDraft> {
  const marginFloor = await resolveMarginFloor();
  const scenario = opportunity ? await fetchLatestScenario(pool, opportunity.id) : null;

  // Doctrine scorecard + exclusions (deterministic; never LLM-supplied).
  let doctrineScore: DoctrineScoreRow[] | null = null;
  let exclusionHits: string[] | null = null;
  const doctrineCitations: Citation[] = [];

  if (opportunity) {
    const detail = await evaluateDoctrineDetail(opportunity);
    doctrineScore = detail.principles.map((p) => {
      const ps = detail.principle_scores[p.id];
      return {
        principle: p.name,
        score: Math.round(((ps?.score ?? 0) / 5) * 100),
        detail: ps?.rationale ?? 'No rationale available',
      };
    });
    exclusionHits = detail.exclusion_triggers.filter((t) => t.triggered).map((t) => t.name);
    doctrineCitations.push({ source: 'GDA Doctrine Engine', url: '/settings/scoring-doctrine', grade: 'A' });
  }

  // Margin check (deterministic; unavailable rather than fabricated).
  let marginCheck: MarginCheck | null = null;
  if (scenario) {
    const projected = Number(scenario.margin_pct);
    marginCheck = {
      projected_margin: projected,
      floor: marginFloor,
      pass: projected >= marginFloor,
      source: `pricing_scenario:${scenario.id}`,
    };
  }

  const financialsCitation: Citation = {
    source: 'Financial Bible / Pricing Scenarios',
    url: opportunity ? `/opportunities/${opportunity.id}/pricing` : '/financials',
    grade: 'A',
  };

  const pricingStrategy = await buildPricingStrategy(pool, scenario, marginFloor, opportunity != null);

  // Verdict severity is driven by deterministic data only.
  const severity: FindingSeverity = (exclusionHits && exclusionHits.length > 0)
    ? 'blocker'
    : marginCheck && !marginCheck.pass
    ? 'critical'
    : 'info';

  const summaryParts: string[] = [];
  if (doctrineScore) {
    summaryParts.push(`Doctrine scorecard evaluated across ${doctrineScore.length} principles.`);
  } else {
    summaryParts.push('Doctrine scorecard unavailable — no linked RFP/opportunity to evaluate.');
  }
  if (exclusionHits && exclusionHits.length > 0) {
    summaryParts.push(`Doctrine exclusions triggered: ${exclusionHits.join(', ')} (executive override required).`);
  } else if (opportunity) {
    summaryParts.push('No doctrine exclusions triggered.');
  }
  if (marginCheck) {
    summaryParts.push(
      `Projected margin ${marginCheck.projected_margin}% vs ${marginCheck.floor}% floor — ${marginCheck.pass ? 'PASS' : 'FAIL'} (source: pricing scenario).`
    );
  } else {
    summaryParts.push('Margin check unavailable — no pricing scenario on file for this opportunity.');
  }

  const citations = [docCitation, financialsCitation, ...doctrineCitations];
  if (rfpCitation) citations.push(rfpCitation);

  return {
    color: 'green',
    severity,
    section_ref: 'Executive / Final Pass',
    finding: summaryParts.join(' '),
    recommended_fix: null,
    citations,
    doctrine_score: doctrineScore,
    exclusion_hits: exclusionHits,
    margin_check: marginCheck,
    pricing_strategy: pricingStrategy,
  };
}

async function resolveMarginFloor(): Promise<number> {
  try {
    const configured = await getConfigValue('margin_floor_pct');
    if (typeof configured === 'number' && Number.isFinite(configured)) return configured;
  } catch (err) {
    logger.warn({ err }, 'Could not read configured margin floor; using default');
  }
  return DEFAULT_MARGIN_FLOOR_PCT;
}

async function buildPricingStrategy(
  pool: PgPool,
  scenario: PricingScenarioRow | null,
  marginFloor: number,
  hasOpportunity: boolean
): Promise<PricingStrategy> {
  const facts: PricingStrategyFact[] = [
    { label: 'Margin floor', value: `${marginFloor}%`, source: 'doctrine_rules_config:margin_floor_pct' },
  ];
  const recommendations: string[] = [];
  const missing: string[] = [];

  if (!hasOpportunity) {
    missing.push('No linked RFP/opportunity — link one to enable pricing analysis.');
  }

  if (!scenario) {
    missing.push('No pricing scenario on file — build one from the active Financial Bible to compute margin.');
    recommendations.push(
      'Create a pricing scenario from the active Financial Bible (labor mix, indirects, fee) so the green pass can validate margin against the floor.'
    );
    return { status: 'unavailable', sourced_facts: facts, recommendations, missing_inputs: missing };
  }

  const projected = Number(scenario.margin_pct);
  facts.push({ label: 'Projected margin', value: `${projected}%`, source: `pricing_scenario:${scenario.id}` });
  facts.push({ label: 'Total price', value: `$${Number(scenario.total_price).toLocaleString('en-US')}`, source: `pricing_scenario:${scenario.id}` });
  facts.push({ label: 'Fee', value: `${Number(scenario.fee_pct)}%`, source: `pricing_scenario:${scenario.id}` });

  const indirect = await fetchIndirects(pool, scenario.bible_version_id, scenario.contract_type);
  if (indirect) {
    facts.push({ label: 'Fringe', value: `${Number(indirect.fringe_pct)}%`, source: `financial_indirects:${scenario.bible_version_id}:${indirect.contract_type}` });
    facts.push({ label: 'Overhead', value: `${Number(indirect.overhead_pct)}%`, source: `financial_indirects:${scenario.bible_version_id}:${indirect.contract_type}` });
    facts.push({ label: 'G&A', value: `${Number(indirect.ga_pct)}%`, source: `financial_indirects:${scenario.bible_version_id}:${indirect.contract_type}` });
    facts.push({
      label: 'Fee band',
      value: `${Number(indirect.fee_band_low)}%–${Number(indirect.fee_band_high)}%`,
      source: `financial_indirects:${scenario.bible_version_id}:${indirect.contract_type}`,
    });
  } else {
    missing.push('No indirect rates for this contract type in the active Financial Bible.');
  }

  if (projected < marginFloor) {
    recommendations.push('Projected margin is below the configured floor; review the pricing posture before submission.');
    if (indirect) {
      recommendations.push('Consider positioning fee toward the upper end of the configured fee band where competitively viable.');
    }
    recommendations.push('Evaluate the labor mix for lower-cost qualified categories and reduce ODC pass-through where the solution allows.');
  } else {
    recommendations.push('Projected margin clears the floor; confirm the price remains competitive against known pricing history before final submission.');
  }

  return { status: 'available', sourced_facts: facts, recommendations, missing_inputs: missing };
}

// ── Backend data lookups ────────────────────────────────────────────────────

async function fetchOpportunityContext(pool: PgPool, id: string): Promise<OpportunityContext | null> {
  const res = await pool.query<OpportunityContext>(
    `SELECT id::text AS id, title, description, agency, naics, set_aside, analysis
     FROM opportunities WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return res.rows[0] ?? null;
}

async function fetchLatestScenario(pool: PgPool, opportunityId: string): Promise<PricingScenarioRow | null> {
  const numericId = Number(opportunityId);
  if (!Number.isInteger(numericId)) return null;
  const res = await pool.query<PricingScenarioRow>(
    `SELECT id::text AS id, margin_pct, total_price, fee_pct,
            (indirect_rates->>'contract_type') AS contract_type, bible_version_id::text AS bible_version_id
     FROM pricing_scenarios
     WHERE opportunity_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [numericId]
  );
  return res.rows[0] ?? null;
}

async function fetchIndirects(
  pool: PgPool,
  bibleVersionId: string,
  contractType: string | null
): Promise<IndirectRow | null> {
  if (contractType) {
    const res = await pool.query<IndirectRow>(
      `SELECT contract_type, fringe_pct, overhead_pct, ga_pct, fee_band_low, fee_band_high
       FROM financial_indirects WHERE version_id = $1 AND contract_type = $2 LIMIT 1`,
      [bibleVersionId, contractType]
    );
    if (res.rows[0]) return res.rows[0];
  }
  const res = await pool.query<IndirectRow>(
    `SELECT contract_type, fringe_pct, overhead_pct, ga_pct, fee_band_low, fee_band_high
     FROM financial_indirects WHERE version_id = $1 ORDER BY contract_type LIMIT 1`,
    [bibleVersionId]
  );
  return res.rows[0] ?? null;
}
