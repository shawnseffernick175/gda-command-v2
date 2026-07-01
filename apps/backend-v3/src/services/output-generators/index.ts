/**
 * Output Generators service — F-313
 *
 * Generates publication-grade PDFs: Opportunity Briefings, Capture Plans,
 * and Win Theme decks. Each generator:
 *  1. Pulls cached F-305 analysis data (R2: auto-populated, no re-running)
 *  2. Renders via PDFKit with Hydra Teal + Inter aesthetics
 *  3. Saves to vault_documents as first-class docs
 *  4. Returns PDF binary + doc_id
 *
 * Hard rules:
 *  - 6 colors only (pink/red/black/blue/white/green)
 *  - R1: every claim cited with clickable URLs
 *  - Doctrine-aligned themes (reference at least one of 8 principles)
 *  - Themes without evidence labeled "draft — needs evidence"
 */

import { statSync } from 'node:fs';
import type { Pool } from 'pg';
import { logger } from '../../lib/logger.js';
import { renderPdf, type PdfSection, type PdfOptions } from './pdf-render.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeneratedDoc {
  id: number;
  docKind: 'briefing' | 'capture_plan' | 'win_themes';
  filePath: string;
  fileSizeBytes: number;
  vaultDocId: number | null;
}

interface OpportunityRow {
  id: string;
  title: string;
  agency: string | null;
  solicitation_number: string | null;
  value_min: number | null;
  value_max: number | null;
  naics: string | null;
  set_aside: string | null;
  due_date: string | null;
  response_deadline: string | null;
  description: string | null;
  source_uri: string | null;
}

interface AnalysisBriefRow {
  brief: Record<string, unknown>;
  sources_revision_hash: string;
}

interface AnalysisCacheRow {
  pwin: number | null;
  analysis_json: Record<string, unknown> | null;
}

interface CaptureJoinRow {
  id: string;
  pipeline_item_id: string;
  color_stage: string;
  capture_plan: Record<string, unknown> | null;
  win_themes: string[] | null;
  opportunity_id: string;
  title: string;
  agency: string | null;
  solicitation_number: string | null;
  value_min: number | null;
  value_max: number | null;
  stage: string;
}

interface GeneratedDocRow {
  id: string;
}

interface VaultDocRow {
  id: number;
}

// ---------------------------------------------------------------------------
// Doctrine principles (the 8 from company profile)
// ---------------------------------------------------------------------------

const DOCTRINE_PRINCIPLES = [
  'Mission Focus',
  'Technical Excellence',
  'Integrity',
  'Innovation',
  'Partnership',
  'Talent Development',
  'Agility',
  'Stewardship',
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMoney(val: number | null): string {
  if (val == null) return 'N/A';
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

function formatDate(d: string | null): string {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

function nowEastern(): string {
  return new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
}

function sectionText(brief: Record<string, unknown>, key: string): string {
  const val = brief[key];
  if (typeof val === 'string') return val;
  if (val && typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if (typeof obj.content === 'string') return obj.content;
    if (typeof obj.summary === 'string') return obj.summary;
    if (typeof obj.text === 'string') return obj.text;
    // Structured section: flatten known sub-fields
    const parts: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'sources' || k === 'citations') continue;
      if (typeof v === 'string') parts.push(v);
      else if (Array.isArray(v)) {
        for (const item of v) {
          if (typeof item === 'string') parts.push(`- ${item}`);
          else if (item && typeof item === 'object') {
            const it = item as Record<string, unknown>;
            const name = it.name ?? it.title ?? it.theme ?? '';
            const desc = it.description ?? it.reasoning ?? it.rationale ?? it.positioning ?? '';
            if (name) parts.push(`${name}${desc ? `: ${desc}` : ''}`);
          }
        }
      }
    }
    return parts.join('\n') || JSON.stringify(val, null, 2);
  }
  return '';
}

function extractCitations(brief: Record<string, unknown>): Array<{ label: string; url: string }> {
  const citations: Array<{ label: string; url: string }> = [];
  for (const [, val] of Object.entries(brief)) {
    if (val && typeof val === 'object') {
      const obj = val as Record<string, unknown>;
      const sources = obj.sources ?? obj.source_chips;
      if (Array.isArray(sources)) {
        for (const src of sources) {
          const s = src as Record<string, unknown>;
          const url = s.url ?? s.source_url;
          if (url && typeof url === 'string') {
            citations.push({
              label: typeof s.title === 'string' ? s.title : (typeof s.kind === 'string' ? s.kind : 'Source'),
              url,
            });
          }
        }
      }
    }
  }
  const seen = new Set<string>();
  return citations.filter((c) => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
}

function extractAnalysisCitations(json: Record<string, unknown> | null): Array<{ label: string; url: string }> {
  if (!json) return [];
  const chips = json.source_chips;
  if (!Array.isArray(chips)) return [];
  const results: Array<{ label: string; url: string }> = [];
  for (const chip of chips) {
    const c = chip as Record<string, unknown>;
    if (typeof c.url === 'string') {
      results.push({ label: String(c.title ?? c.label ?? 'Source'), url: c.url });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Generate Briefing PDF
// ---------------------------------------------------------------------------

export async function generateBriefing(
  pool: Pool,
  opportunityId: string,
): Promise<GeneratedDoc> {
  const oppRes = await pool.query<OpportunityRow>(
    `SELECT id::text, title, agency, solicitation_number, value_min, value_max,
            naics, set_aside, due_date, response_deadline, description, source_uri
     FROM opportunities WHERE id = $1 AND deleted_at IS NULL`,
    [opportunityId],
  );
  const opp = oppRes.rows[0];
  if (!opp) throw new Error(`Opportunity ${opportunityId} not found`);

  // Pull F-305 cached analysis brief (R2: no re-running)
  const briefRes = await pool.query<AnalysisBriefRow>(
    `SELECT brief, sources_revision_hash
     FROM opportunity_analysis_briefs
     WHERE opportunity_id = $1`,
    [opportunityId],
  );
  const brief = briefRes.rows[0]?.brief ?? {};

  // Pull opportunity_analysis_cache for pwin + structured analysis
  const cacheRes = await pool.query<AnalysisCacheRow>(
    `SELECT pwin, analysis_json
     FROM opportunity_analysis_cache
     WHERE opportunity_id = $1
     ORDER BY generated_at DESC LIMIT 1`,
    [opportunityId],
  );
  const cache = cacheRes.rows[0];
  const pwin = cache?.pwin != null ? Number(cache.pwin) : null;
  const analysisJson = cache?.analysis_json ?? null;

  // Build sections from cached data
  const execSummary = sectionText(brief, 'executive_summary')
    || (analysisJson ? String((analysisJson as Record<string, unknown>).executive_summary ?? '') : '')
    || 'Analysis data not yet available. Open this opportunity to trigger auto-analysis.';

  const analysisBody = sectionText(brief, 'competitive_landscape')
    || sectionText(brief, 'analysis')
    || '';

  const doctrineSection = sectionText(brief, 'doctrine_alignment')
    || buildDoctrineText(analysisJson);

  const risksSection = sectionText(brief, 'risks')
    || sectionText(brief, 'risk_assessment')
    || '';

  const recommendation = sectionText(brief, 'recommendation')
    || (analysisJson ? String((analysisJson as Record<string, unknown>).bid_recommendation ?? '') : '');

  // Collect all citations (R1)
  const allCitations = [
    ...extractCitations(brief),
    ...extractAnalysisCitations(analysisJson),
  ];
  if (opp.source_uri) {
    allCitations.unshift({ label: 'Original Listing', url: opp.source_uri });
  }
  // Deduplicate
  const seenUrls = new Set<string>();
  const dedupedCitations = allCitations.filter((c) => {
    if (seenUrls.has(c.url)) return false;
    seenUrls.add(c.url);
    return true;
  });

  const effectiveValue = opp.value_max ?? opp.value_min;
  const generatedAt = nowEastern();
  const filename = `briefing-${opportunityId}-${Date.now()}.pdf`;

  const sections: PdfSection[] = [
    { heading: 'Executive Summary', body: execSummary, citations: dedupedCitations.slice(0, 3) },
    { heading: 'R2 Analysis Summary', body: analysisBody },
    { heading: 'Doctrine Alignment', body: doctrineSection, doctrineRef: DOCTRINE_PRINCIPLES.join(', ') },
    { heading: 'Key Risks', body: risksSection },
    { heading: 'Recommended Action', body: recommendation },
  ];

  const pdfOpts: PdfOptions = {
    meta: {
      title: opp.title,
      subtitle: 'Opportunity Briefing',
      fields: [
        { label: 'Agency', value: opp.agency ?? 'N/A' },
        { label: 'Solicitation', value: opp.solicitation_number ?? 'N/A' },
        { label: 'Value', value: formatMoney(effectiveValue) },
        { label: 'Set-Aside', value: opp.set_aside ?? 'None' },
        { label: 'NAICS', value: opp.naics ?? 'N/A' },
        { label: 'Due Date', value: formatDate(opp.response_deadline ?? opp.due_date) },
        { label: 'Doctrine Fit', value: doctrineSection ? 'Aligned' : 'Pending Review' },
      ],
      pwin,
    },
    sections,
    allCitations: dedupedCitations,
    generatedAt,
  };

  const { filePath, sizeBytes } = await renderPdf(filename, pdfOpts);
  const stat = statSync(filePath);
  const finalSize = stat.size || sizeBytes;

  // Save to vault_documents as first-class doc
  const vaultRes = await pool.query<VaultDocRow>(
    `INSERT INTO vault_documents (filename, doc_type, file_size_bytes, file_path, ai_summary,
       linked_opportunity_id, uploaded_by, uploaded_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     RETURNING id`,
    [filename, 'other', finalSize, filePath,
     `Opportunity Briefing for ${opp.title}`,
     Number(opportunityId), 'output-generator'],
  );
  const vaultDocId = vaultRes.rows[0]?.id ?? null;

  const genRes = await pool.query<GeneratedDocRow>(
    `INSERT INTO generated_documents
       (doc_kind, opportunity_id, vault_doc_id, file_path, file_size_bytes,
        generation_model, generation_input, citations, doctrine_refs, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    ['briefing', Number(opportunityId), vaultDocId, filePath, finalSize,
     'cached-analysis', JSON.stringify({ opportunity_id: opportunityId }),
     JSON.stringify(dedupedCitations), JSON.stringify(DOCTRINE_PRINCIPLES),
     'output-generator'],
  );

  logger.info({ opportunityId, docId: genRes.rows[0]!.id, vaultDocId }, 'Generated briefing PDF');

  return {
    id: Number(genRes.rows[0]!.id),
    docKind: 'briefing',
    filePath,
    fileSizeBytes: finalSize,
    vaultDocId,
  };
}

// ---------------------------------------------------------------------------
// Generate Capture Plan PDF
// ---------------------------------------------------------------------------

export async function generateCapturePlan(
  pool: Pool,
  captureId: string,
): Promise<GeneratedDoc> {
  const capture = await loadCapture(pool, captureId);

  const briefRes = await pool.query<AnalysisBriefRow>(
    `SELECT brief, sources_revision_hash
     FROM opportunity_analysis_briefs
     WHERE opportunity_id = $1`,
    [capture.opportunity_id],
  );
  const brief = briefRes.rows[0]?.brief ?? {};

  const cacheRes = await pool.query<AnalysisCacheRow>(
    `SELECT pwin, analysis_json
     FROM opportunity_analysis_cache
     WHERE opportunity_id = $1
     ORDER BY generated_at DESC LIMIT 1`,
    [capture.opportunity_id],
  );
  const pwin = cacheRes.rows[0]?.pwin != null ? Number(cacheRes.rows[0].pwin) : null;
  const analysisJson = cacheRes.rows[0]?.analysis_json ?? null;

  const plan = (capture.capture_plan ?? {}) as Record<string, unknown>;

  // 8-section capture plan from cached data
  const agencyIntel = sectionText(brief, 'agency_overview')
    || sectionText(brief, 'customer_knowledge')
    || String(plan.customer_profile ?? 'Agency intelligence pending.');

  const incumbentAnalysis = buildIncumbentText(analysisJson)
    || sectionText(brief, 'incumbent_analysis')
    || 'Incumbent analysis pending.';

  const competitiveLandscape = buildCompetitiveText(analysisJson)
    || sectionText(brief, 'competitive_landscape')
    || 'Competitive analysis pending.';

  const winThemesSection = buildWinThemesText(plan, capture.win_themes);

  const teamingStrategy = String(plan.teaming_plan ?? '')
    || sectionText(brief, 'teaming')
    || 'Teaming strategy to be determined.';

  const captureSchedule = 'Schedule milestones to be determined based on solicitation timeline and color review progression.';

  const riskAssessment = sectionText(brief, 'risks')
    || sectionText(brief, 'risk_assessment')
    || 'Risk assessment pending.';

  const decisionFactors = sectionText(brief, 'recommendation')
    || String(plan.solution_strategy ?? '')
    || 'Decision factors pending analysis.';

  const allCitations = [
    ...extractCitations(brief),
    ...extractAnalysisCitations(analysisJson),
  ];
  const seenUrls = new Set<string>();
  const dedupedCitations = allCitations.filter((c) => {
    if (seenUrls.has(c.url)) return false;
    seenUrls.add(c.url);
    return true;
  });

  const effectiveValue = capture.value_max ?? capture.value_min;
  const generatedAt = nowEastern();
  const filename = `capture-plan-${captureId}-${Date.now()}.pdf`;

  const sections: PdfSection[] = [
    { heading: '1. Agency Intelligence', body: agencyIntel },
    { heading: '2. Incumbent Analysis', body: incumbentAnalysis },
    { heading: '3. Competitive Landscape', body: competitiveLandscape },
    { heading: '4. Win Themes', body: winThemesSection, doctrineRef: DOCTRINE_PRINCIPLES.join(', ') },
    { heading: '5. Teaming Strategy', body: teamingStrategy },
    { heading: '6. Capture Schedule', body: captureSchedule },
    { heading: '7. Risk Assessment', body: riskAssessment },
    { heading: '8. Decision Factors', body: decisionFactors },
  ];

  const pdfOpts: PdfOptions = {
    meta: {
      title: capture.title,
      subtitle: 'Capture Plan',
      fields: [
        { label: 'Agency', value: capture.agency ?? 'N/A' },
        { label: 'Solicitation', value: capture.solicitation_number ?? 'N/A' },
        { label: 'Value', value: formatMoney(effectiveValue) },
        { label: 'Capture Stage', value: capture.color_stage },
        { label: 'Pipeline Stage', value: capture.stage },
        { label: 'PWin', value: pwin != null ? `${pwin}%` : 'N/A' },
      ],
    },
    sections,
    allCitations: dedupedCitations,
    generatedAt,
  };

  const { filePath, sizeBytes } = await renderPdf(filename, pdfOpts);
  const stat = statSync(filePath);
  const finalSize = stat.size || sizeBytes;

  const vaultRes = await pool.query<VaultDocRow>(
    `INSERT INTO vault_documents (filename, doc_type, file_size_bytes, file_path, ai_summary,
       linked_capture_id, uploaded_by, uploaded_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     RETURNING id`,
    [filename, 'other', finalSize, filePath,
     `Capture Plan for ${capture.title}`,
     Number(captureId), 'output-generator'],
  );
  const vaultDocId = vaultRes.rows[0]?.id ?? null;

  const genRes = await pool.query<GeneratedDocRow>(
    `INSERT INTO generated_documents
       (doc_kind, capture_id, opportunity_id, vault_doc_id, file_path, file_size_bytes,
        generation_model, generation_input, citations, doctrine_refs, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    ['capture_plan', Number(captureId), Number(capture.opportunity_id), vaultDocId,
     filePath, finalSize, 'cached-analysis',
     JSON.stringify({ capture_id: captureId }),
     JSON.stringify(dedupedCitations), JSON.stringify(DOCTRINE_PRINCIPLES),
     'output-generator'],
  );

  logger.info({ captureId, docId: genRes.rows[0]!.id, vaultDocId }, 'Generated capture plan PDF');

  return {
    id: Number(genRes.rows[0]!.id),
    docKind: 'capture_plan',
    filePath,
    fileSizeBytes: finalSize,
    vaultDocId,
  };
}

// ---------------------------------------------------------------------------
// Generate Win Themes PDF
// ---------------------------------------------------------------------------

export async function generateWinThemes(
  pool: Pool,
  captureId: string,
): Promise<GeneratedDoc> {
  const capture = await loadCapture(pool, captureId);

  const briefRes = await pool.query<AnalysisBriefRow>(
    `SELECT brief, sources_revision_hash
     FROM opportunity_analysis_briefs
     WHERE opportunity_id = $1`,
    [capture.opportunity_id],
  );
  const brief = briefRes.rows[0]?.brief ?? {};

  const cacheRes = await pool.query<AnalysisCacheRow>(
    `SELECT pwin, analysis_json
     FROM opportunity_analysis_cache
     WHERE opportunity_id = $1
     ORDER BY generated_at DESC LIMIT 1`,
    [capture.opportunity_id],
  );
  const analysisJson = cacheRes.rows[0]?.analysis_json ?? null;

  const plan = (capture.capture_plan ?? {}) as Record<string, unknown>;

  // Build themes from capture plan and analysis
  const themes = buildThemeCards(plan, capture.win_themes, analysisJson);

  const allCitations = [
    ...extractCitations(brief),
    ...extractAnalysisCitations(analysisJson),
  ];
  const seenUrls = new Set<string>();
  const dedupedCitations = allCitations.filter((c) => {
    if (seenUrls.has(c.url)) return false;
    seenUrls.add(c.url);
    return true;
  });

  const effectiveValue = capture.value_max ?? capture.value_min;
  const generatedAt = nowEastern();
  const filename = `win-themes-${captureId}-${Date.now()}.pdf`;

  const sections: PdfSection[] = themes.map((theme, i) => ({
    heading: `Theme ${i + 1}: ${theme.title}`,
    body: theme.body,
    doctrineRef: theme.doctrinePrinciple,
    isDraft: theme.isDraft,
    citations: theme.evidenceUrl ? [{ label: 'Evidence', url: theme.evidenceUrl }] : undefined,
  }));

  const pdfOpts: PdfOptions = {
    meta: {
      title: capture.title,
      subtitle: 'Win Themes',
      fields: [
        { label: 'Agency', value: capture.agency ?? 'N/A' },
        { label: 'Solicitation', value: capture.solicitation_number ?? 'N/A' },
        { label: 'Value', value: formatMoney(effectiveValue) },
        { label: 'Capture Stage', value: capture.color_stage },
      ],
    },
    sections,
    allCitations: dedupedCitations,
    generatedAt,
  };

  const { filePath, sizeBytes } = await renderPdf(filename, pdfOpts);
  const stat = statSync(filePath);
  const finalSize = stat.size || sizeBytes;

  const vaultRes = await pool.query<VaultDocRow>(
    `INSERT INTO vault_documents (filename, doc_type, file_size_bytes, file_path, ai_summary,
       linked_capture_id, uploaded_by, uploaded_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     RETURNING id`,
    [filename, 'other', finalSize, filePath,
     `Win Themes for ${capture.title}`,
     Number(captureId), 'output-generator'],
  );
  const vaultDocId = vaultRes.rows[0]?.id ?? null;

  const genRes = await pool.query<GeneratedDocRow>(
    `INSERT INTO generated_documents
       (doc_kind, capture_id, opportunity_id, vault_doc_id, file_path, file_size_bytes,
        generation_model, generation_input, citations, doctrine_refs, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    ['win_themes', Number(captureId), Number(capture.opportunity_id), vaultDocId,
     filePath, finalSize, 'cached-analysis',
     JSON.stringify({ capture_id: captureId }),
     JSON.stringify(dedupedCitations),
     JSON.stringify(themes.map((t) => t.doctrinePrinciple)),
     'output-generator'],
  );

  logger.info({ captureId, docId: genRes.rows[0]!.id, vaultDocId }, 'Generated win themes PDF');

  return {
    id: Number(genRes.rows[0]!.id),
    docKind: 'win_themes',
    filePath,
    fileSizeBytes: finalSize,
    vaultDocId,
  };
}

// ---------------------------------------------------------------------------
// Shared data loaders
// ---------------------------------------------------------------------------

async function loadCapture(pool: Pool, captureId: string): Promise<CaptureJoinRow> {
  const res = await pool.query<CaptureJoinRow>(
    `SELECT c.id::text, c.pipeline_item_id, c.color_stage,
            c.capture_plan, c.win_themes,
            o.id::text AS opportunity_id, o.title, o.agency,
            o.solicitation_number, o.value_min, o.value_max,
            pi.stage
     FROM captures c
     JOIN pipeline_items pi ON pi.id = c.pipeline_item_id
     JOIN opportunities o ON o.id = pi.opportunity_id AND o.deleted_at IS NULL
     WHERE c.id = $1`,
    [captureId],
  );
  const row = res.rows[0];
  if (!row) throw new Error(`Capture ${captureId} not found`);
  return row;
}

// ---------------------------------------------------------------------------
// Content builders (from cached analysis data)
// ---------------------------------------------------------------------------

function buildDoctrineText(analysisJson: Record<string, unknown> | null): string {
  if (!analysisJson) return '';
  const alignment = analysisJson.doctrine_alignment;
  if (!Array.isArray(alignment)) return '';
  const lines: string[] = [];
  for (const item of alignment) {
    const a = item as Record<string, unknown>;
    lines.push(`${a.principle_name ?? 'Principle'}: ${a.alignment_score ?? 'N/A'} — ${a.reasoning ?? ''}`);
  }
  return lines.join('\n');
}

function buildIncumbentText(analysisJson: Record<string, unknown> | null): string {
  if (!analysisJson) return '';
  const incumbent = analysisJson.incumbent as Record<string, unknown> | null;
  if (!incumbent) return 'No incumbent identified in analysis.';
  const parts: string[] = [];
  if (incumbent.name) parts.push(`Incumbent: ${incumbent.name}`);
  if (incumbent.contract_number) parts.push(`Contract: ${incumbent.contract_number}`);
  if (incumbent.contract_value) parts.push(`Value: ${formatMoney(Number(incumbent.contract_value))}`);
  if (incumbent.expiration_date) parts.push(`Expires: ${formatDate(String(incumbent.expiration_date))}`);
  const signals = incumbent.performance_signals;
  if (Array.isArray(signals) && signals.length > 0) {
    parts.push(`Performance signals: ${signals.join('; ')}`);
  }
  return parts.join('\n');
}

function buildCompetitiveText(analysisJson: Record<string, unknown> | null): string {
  if (!analysisJson) return '';
  const landscape = analysisJson.competitive_landscape;
  if (!Array.isArray(landscape)) return '';
  const lines: string[] = [];
  for (const entry of landscape) {
    const c = entry as Record<string, unknown>;
    lines.push(`${c.name ?? 'Competitor'}: ${c.positioning ?? ''}`);
    if (Array.isArray(c.strengths)) lines.push(`  Strengths: ${(c.strengths as string[]).join(', ')}`);
    if (Array.isArray(c.weaknesses)) lines.push(`  Weaknesses: ${(c.weaknesses as string[]).join(', ')}`);
    if (c.our_differentiator) lines.push(`  Our differentiator: ${c.our_differentiator}`);
  }
  return lines.join('\n');
}

function buildWinThemesText(
  plan: Record<string, unknown>,
  existingThemes: string[] | null,
): string {
  const parts: string[] = [];

  // From capture_plan.win_themes
  const planThemes = plan.win_themes;
  if (Array.isArray(planThemes)) {
    for (const t of planThemes) {
      if (typeof t === 'string') {
        parts.push(t);
      } else if (t && typeof t === 'object') {
        const theme = t as Record<string, unknown>;
        parts.push(`${theme.theme ?? theme.title ?? 'Theme'}: ${theme.customer_hot_button ?? theme.body ?? ''}`);
        if (Array.isArray(theme.evidence) && theme.evidence.length > 0) {
          parts.push(`  Evidence: ${(theme.evidence as string[]).join('; ')}`);
        }
      }
    }
  }

  // From captures.win_themes column
  if (existingThemes && existingThemes.length > 0) {
    for (const t of existingThemes) {
      if (!parts.includes(t)) parts.push(t);
    }
  }

  return parts.length > 0
    ? parts.join('\n\n')
    : 'Win themes pending capture plan development.';
}

interface ThemeCard {
  title: string;
  body: string;
  doctrinePrinciple: string;
  evidenceUrl: string;
  isDraft: boolean;
}

function buildThemeCards(
  plan: Record<string, unknown>,
  existingThemes: string[] | null,
  analysisJson: Record<string, unknown> | null,
): ThemeCard[] {
  const cards: ThemeCard[] = [];

  // From capture_plan.win_themes (structured)
  const planThemes = plan.win_themes;
  if (Array.isArray(planThemes)) {
    for (let i = 0; i < planThemes.length; i++) {
      const t = planThemes[i];
      if (typeof t === 'string') {
        cards.push({
          title: `Theme ${i + 1}`,
          body: t,
          doctrinePrinciple: matchDoctrine(t),
          evidenceUrl: '',
          isDraft: true,
        });
      } else if (t && typeof t === 'object') {
        const theme = t as Record<string, unknown>;
        const hasEvidence = Array.isArray(theme.evidence) && theme.evidence.length > 0;
        cards.push({
          title: String(theme.theme ?? theme.title ?? `Theme ${i + 1}`),
          body: [
            String(theme.customer_hot_button ?? theme.body ?? ''),
            hasEvidence ? `Evidence: ${(theme.evidence as string[]).join('; ')}` : '',
          ].filter(Boolean).join('\n'),
          doctrinePrinciple: matchDoctrine(String(theme.theme ?? '')),
          evidenceUrl: '',
          isDraft: !hasEvidence,
        });
      }
    }
  }

  // From captures.win_themes column (plain strings)
  if (existingThemes) {
    for (let i = 0; i < existingThemes.length; i++) {
      const alreadyIncluded = cards.some((c) => c.body.includes(existingThemes[i]!));
      if (!alreadyIncluded) {
        cards.push({
          title: `Theme ${cards.length + 1}`,
          body: existingThemes[i]!,
          doctrinePrinciple: matchDoctrine(existingThemes[i]!),
          evidenceUrl: '',
          isDraft: true,
        });
      }
    }
  }

  if (cards.length === 0) {
    cards.push({
      title: 'Win Themes Pending',
      body: 'Win themes require capture plan development and analysis data. Complete the opportunity analysis and capture plan to generate themes.',
      doctrinePrinciple: 'Pending doctrine alignment review',
      evidenceUrl: '',
      isDraft: true,
    });
  }

  // Validate doctrine alignment
  for (const card of cards) {
    const hasRef = DOCTRINE_PRINCIPLES.some(
      (p) => card.doctrinePrinciple.toLowerCase().includes(p.toLowerCase()),
    );
    if (!hasRef) {
      card.doctrinePrinciple += ' (needs doctrine alignment review)';
    }
  }

  return cards;
}

function matchDoctrine(text: string): string {
  const lower = text.toLowerCase();
  for (const principle of DOCTRINE_PRINCIPLES) {
    if (lower.includes(principle.toLowerCase())) return principle;
  }
  // Keyword matching fallback
  if (lower.includes('mission') || lower.includes('customer')) return 'Mission Focus';
  if (lower.includes('technical') || lower.includes('engineer')) return 'Technical Excellence';
  if (lower.includes('innovat') || lower.includes('modern')) return 'Innovation';
  if (lower.includes('team') || lower.includes('partner')) return 'Partnership';
  if (lower.includes('agil') || lower.includes('adapt')) return 'Agility';
  if (lower.includes('talent') || lower.includes('staff')) return 'Talent Development';
  if (lower.includes('integri') || lower.includes('trust')) return 'Integrity';
  if (lower.includes('steward') || lower.includes('cost')) return 'Stewardship';
  return 'Pending';
}
