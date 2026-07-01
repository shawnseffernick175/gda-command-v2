/**
 * F-313: Output Generators service
 *
 * Generates publication-grade HTML documents (briefing, capture plan, win themes)
 * from cached analysis data. Documents are persisted as first-class records.
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { generateBriefingHtml, generateCapturePlanHtml, generateWinThemesHtml } from './templates.js';
import type {
  GeneratedDocumentRow,
  GeneratedDocType,
  BriefingData,
  CapturePlanData,
  WinThemeData,
  Citation,
  DoctrineRef,
  AnalysisSection,
  CompetitorInfo,
  WinTheme,
} from './types.js';

const DOCTRINE_PRINCIPLES = [
  'Alignment',
  'Ethics Always',
  'Teamwork',
  'Data First, Then Debate',
  'Relentless Execution',
  'Relationships',
  'Market, Mission, Brand Focus',
] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildSectionsFromCache(cache: Record<string, unknown>): Array<{ heading: string; content: string; citations?: Array<{ source?: string; url?: string }> }> {
  const sections: Array<{ heading: string; content: string; citations?: Array<{ source?: string; url?: string }> }> = [];

  if (cache.incumbent && typeof cache.incumbent === 'string') {
    sections.push({ heading: 'Incumbent', content: cache.incumbent });
  }

  if (cache.competitors && Array.isArray(cache.competitors)) {
    const names = (cache.competitors as Array<{ name?: string }>).map((c) => c.name ?? 'Unknown').join(', ');
    sections.push({ heading: 'Competitors', content: names || 'No competitors identified' });
  }

  if (cache.blackhat && typeof cache.blackhat === 'object') {
    const bh = cache.blackhat as Record<string, unknown>;
    const summary = typeof bh.summary === 'string' ? bh.summary : JSON.stringify(bh);
    sections.push({ heading: 'Black Hat Analysis', content: summary });
  }

  if (cache.wargame && typeof cache.wargame === 'object') {
    const wg = cache.wargame as Record<string, unknown>;
    const strategy = typeof wg.strategy === 'string' ? wg.strategy : '';
    const themes = Array.isArray(wg.win_themes) ? (wg.win_themes as string[]).join('; ') : '';
    const content = [strategy, themes].filter(Boolean).join(' — ');
    if (content) sections.push({ heading: 'Win Strategy', content });
  }

  if (cache.timeline && typeof cache.timeline === 'object') {
    const tl = cache.timeline as Record<string, unknown>;
    const summary = typeof tl.summary === 'string' ? tl.summary : '';
    if (summary) sections.push({ heading: 'Timeline', content: summary });
  }

  return sections;
}

async function insertGeneratedDoc(
  docType: GeneratedDocType,
  opportunityId: string | null,
  captureId: string | null,
  title: string,
  htmlContent: string,
  citations: Citation[],
  doctrineRefs: DoctrineRef[],
  metadata: Record<string, unknown>,
  createdBy: string | null,
): Promise<GeneratedDocumentRow> {
  const res = await pool.query<GeneratedDocumentRow>(
    `INSERT INTO generated_documents
       (doc_type, opportunity_id, capture_id, title, html_content, citations, doctrine_refs, metadata, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      docType,
      opportunityId ? Number(opportunityId) : null,
      captureId ? Number(captureId) : null,
      title,
      htmlContent,
      JSON.stringify(citations),
      JSON.stringify(doctrineRefs),
      JSON.stringify(metadata),
      createdBy,
    ],
  );
  return res.rows[0]!;
}

export async function getGeneratedDoc(id: string): Promise<GeneratedDocumentRow | null> {
  const res = await pool.query<GeneratedDocumentRow>(
    'SELECT * FROM generated_documents WHERE id = $1',
    [id],
  );
  return res.rows[0] ?? null;
}

export async function listGeneratedDocs(filters: {
  opportunity_id?: string;
  capture_id?: string;
  doc_type?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: GeneratedDocumentRow[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.opportunity_id) {
    conditions.push(`opportunity_id = $${idx++}`);
    params.push(Number(filters.opportunity_id));
  }
  if (filters.capture_id) {
    conditions.push(`capture_id = $${idx++}`);
    params.push(Number(filters.capture_id));
  }
  if (filters.doc_type) {
    conditions.push(`doc_type = $${idx++}`);
    params.push(filters.doc_type);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const countRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM generated_documents ${where}`,
    params,
  );
  const total = parseInt(countRes.rows[0]?.count ?? '0', 10);

  params.push(limit);
  params.push(offset);
  const res = await pool.query<GeneratedDocumentRow>(
    `SELECT * FROM generated_documents ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
    params,
  );

  return { items: res.rows, total };
}

// ─── Briefing Generator ─────────────────────────────────────────────────────

function extractDoctrineRefsFromAnalysis(analysisJson: Record<string, unknown> | null): DoctrineRef[] {
  if (!analysisJson) return [];
  const refs: DoctrineRef[] = [];

  const sections = analysisJson.sections as Array<{ heading?: string; content?: string }> | undefined;
  if (Array.isArray(sections)) {
    for (const section of sections) {
      const content = section.content ?? '';
      for (const principle of DOCTRINE_PRINCIPLES) {
        if (content.toLowerCase().includes(principle.toLowerCase())) {
          refs.push({ principle, relevance: `Referenced in ${section.heading ?? 'analysis'}` });
        }
      }
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return refs.filter((r) => {
    if (seen.has(r.principle)) return false;
    seen.add(r.principle);
    return true;
  });
}

function extractCitationsFromAnalysis(analysisJson: Record<string, unknown> | null): Citation[] {
  if (!analysisJson) return [];
  const citations: Citation[] = [];
  let idx = 1;

  const sections = analysisJson.sections as Array<{ heading?: string; citations?: Array<{ source?: string; url?: string }> }> | undefined;
  if (Array.isArray(sections)) {
    for (const section of sections) {
      if (Array.isArray(section.citations)) {
        for (const cite of section.citations) {
          if (cite.url) {
            citations.push({
              index: idx++,
              source: cite.source ?? 'Source',
              url: cite.url,
              retrieved_at: new Date().toISOString(),
            });
          }
        }
      }
    }
  }

  return citations;
}

function extractAnalysisSections(analysisJson: Record<string, unknown> | null): AnalysisSection[] {
  if (!analysisJson) return [];
  const sections = analysisJson.sections as Array<{
    heading?: string;
    content?: string;
    citations?: Array<{ source?: string; url?: string }>;
  }> | undefined;

  if (!Array.isArray(sections)) return [];

  return sections
    .filter((s) => s.heading && s.content)
    .map((s) => ({
      heading: s.heading!,
      content: s.content!,
      citations: (s.citations ?? [])
        .filter((c) => c.url)
        .map((c, i) => ({
          index: i + 1,
          source: c.source ?? 'Source',
          url: c.url!,
          retrieved_at: new Date().toISOString(),
        })),
    }));
}

export async function generateBriefing(
  opportunityId: string,
  createdBy: string | null,
): Promise<GeneratedDocumentRow> {
  const oppRes = await pool.query<{
    id: string;
    title: string;
    agency: string | null;
    department: string | null;
    naics: string | null;
    set_aside: string | null;
    value_min: number | null;
    value_max: number | null;
    description: string | null;
    response_due_at: string | null;
    posted_at: string | null;
    source_uri: string | null;
    solicitation_number: string | null;
    place_of_performance: string | null;
    incumbent: string | null;
  }>(
    `SELECT id, title, agency, department, naics, set_aside,
            value_min, value_max, description, response_due_at,
            posted_at, source_uri, solicitation_number, place_of_performance,
            incumbent
     FROM opportunities WHERE id = $1 AND deleted_at IS NULL`,
    [opportunityId],
  );
  const opp = oppRes.rows[0];
  if (!opp) throw new Error(`Opportunity ${opportunityId} not found`);

  // Fetch cached analysis (R2: auto-populate, no re-running)
  const analysisRes = await pool.query<{
    pwin: number | null;
    incumbent: string | null;
    competitors: unknown;
    blackhat: unknown;
    wargame: unknown;
    timeline: unknown;
  }>(
    `SELECT pwin, incumbent, competitors, blackhat, wargame, timeline
     FROM opportunity_analysis_cache
     WHERE opportunity_id = $1 ORDER BY generated_at DESC LIMIT 1`,
    [opportunityId],
  );
  const analysisCache = analysisRes.rows[0] ?? null;
  const analysisJson = analysisCache
    ? {
        sections: buildSectionsFromCache(analysisCache),
        incumbent: analysisCache.incumbent,
        competitors: analysisCache.competitors,
        wargame: analysisCache.wargame,
      }
    : null;

  const pwin = analysisCache?.pwin ?? null;

  const analysisSections = extractAnalysisSections(analysisJson);
  const doctrineRefs = extractDoctrineRefsFromAnalysis(analysisJson);
  const citations = extractCitationsFromAnalysis(analysisJson);

  // Extract risks from analysis
  const risks: string[] = [];
  if (analysisJson) {
    const riskSection = analysisSections.find(
      (s) => s.heading.toLowerCase().includes('risk') || s.heading.toLowerCase().includes('threat'),
    );
    if (riskSection) {
      risks.push(riskSection.content);
    }
  }

  const briefingData: BriefingData = {
    opportunity_id: String(opp.id),
    title: opp.title,
    agency: opp.agency,
    department: opp.department,
    naics: opp.naics,
    set_aside: opp.set_aside,
    value_min: opp.value_min != null ? Number(opp.value_min) : null,
    value_max: opp.value_max != null ? Number(opp.value_max) : null,
    pwin,
    description: opp.description,
    response_due_at: opp.response_due_at,
    posted_at: opp.posted_at,
    source_uri: opp.source_uri,
    solicitation_number: opp.solicitation_number,
    place_of_performance: opp.place_of_performance,
    analysis_summary: null,
    analysis_sections: analysisSections,
    doctrine_alignment: doctrineRefs,
    risks,
    recommended_action: null,
  };

  const html = generateBriefingHtml(briefingData);

  return insertGeneratedDoc(
    'briefing',
    opportunityId,
    null,
    `Opportunity Briefing — ${opp.title}`,
    html,
    citations,
    doctrineRefs,
    { opportunity_title: opp.title, agency: opp.agency, pwin },
    createdBy,
  );
}

// ─── Capture Plan Generator ────────────────────────────────────────────────

export async function generateCapturePlan(
  captureId: string,
  createdBy: string | null,
): Promise<GeneratedDocumentRow> {
  // Fetch capture + pipeline_item + opportunity
  const captureRes = await pool.query<{
    id: string;
    pipeline_item_id: string;
    capture_plan: Record<string, unknown> | null;
    win_themes: string[] | null;
    ghost_team: Record<string, unknown> | null;
    color_stage: string;
  }>(
    'SELECT id, pipeline_item_id, capture_plan, win_themes, ghost_team, color_stage FROM captures WHERE id = $1',
    [captureId],
  );
  const capture = captureRes.rows[0];
  if (!capture) throw new Error(`Capture ${captureId} not found`);

  const piRes = await pool.query<{
    opportunity_id: string;
    stage: string;
    capture_owner: string | null;
  }>(
    'SELECT opportunity_id, stage, capture_owner FROM pipeline_items WHERE id = $1',
    [capture.pipeline_item_id],
  );
  const pi = piRes.rows[0];
  if (!pi) throw new Error(`Pipeline item for capture ${captureId} not found`);

  const oppRes = await pool.query<{
    id: string;
    title: string;
    agency: string | null;
    value_max: number | null;
    value_min: number | null;
    incumbent: string | null;
    description: string | null;
  }>(
    'SELECT id, title, agency, value_max, value_min, incumbent, description FROM opportunities WHERE id = $1 AND deleted_at IS NULL',
    [pi.opportunity_id],
  );
  const opp = oppRes.rows[0];
  if (!opp) throw new Error(`Opportunity for capture ${captureId} not found`);

  // Fetch pwin
  let pwin: number | null = null;
  const pwinRes = await pool.query<{ pwin: number }>(
    'SELECT pwin FROM capture_analysis_cache WHERE capture_id = $1 ORDER BY generated_at DESC LIMIT 1',
    [captureId],
  );
  pwin = pwinRes.rows[0]?.pwin ?? null;

  if (pwin === null) {
    const oppPwinRes = await pool.query<{ pwin: number }>(
      'SELECT pwin FROM opportunity_analysis_cache WHERE opportunity_id = $1 ORDER BY generated_at DESC LIMIT 1',
      [pi.opportunity_id],
    );
    pwin = oppPwinRes.rows[0]?.pwin ?? null;
  }

  // Fetch cached analysis
  const analysisRes = await pool.query<{
    incumbent: string | null;
    competitors: unknown;
    blackhat: unknown;
    wargame: unknown;
    timeline: unknown;
  }>(
    'SELECT incumbent, competitors, blackhat, wargame, timeline FROM opportunity_analysis_cache WHERE opportunity_id = $1 ORDER BY generated_at DESC LIMIT 1',
    [pi.opportunity_id],
  );
  const cacheRow = analysisRes.rows[0] ?? null;
  const analysisJson = cacheRow
    ? {
        sections: buildSectionsFromCache(cacheRow),
        incumbent: cacheRow.incumbent,
        competitors: cacheRow.competitors,
        wargame: cacheRow.wargame,
      }
    : null;
  const analysisSections = extractAnalysisSections(analysisJson);
  const doctrineRefs = extractDoctrineRefsFromAnalysis(analysisJson);
  const citations = extractCitationsFromAnalysis(analysisJson);

  // Extract plan data
  const plan = (capture.capture_plan ?? {}) as Record<string, unknown>;
  const winStrategy = typeof plan.win_strategy === 'string'
    ? plan.win_strategy
    : typeof plan.solution_strategy === 'string'
      ? plan.solution_strategy
      : null;
  const discriminators = Array.isArray(plan.discriminators)
    ? (plan.discriminators as unknown[]).filter((d): d is string => typeof d === 'string')
    : [];

  // Competitors
  const competitors: CompetitorInfo[] = [];
  try {
    const compRes = await pool.query<{ name: string; strengths: string[] | null; weaknesses: string[] | null }>(
      'SELECT name, strengths, weaknesses FROM competitors WHERE opportunity_id = $1',
      [pi.opportunity_id],
    );
    for (const c of compRes.rows) {
      competitors.push({
        name: c.name,
        strengths: c.strengths ?? [],
        weaknesses: c.weaknesses ?? [],
      });
    }
  } catch {
    logger.warn({ captureId }, 'Could not fetch competitors');
  }

  // Risks
  const risks: string[] = [];
  try {
    const riskRes = await pool.query<{ title: string; description: string | null }>(
      `SELECT title, description FROM risks WHERE opportunity_id = $1`,
      [pi.opportunity_id],
    );
    for (const r of riskRes.rows) {
      risks.push(r.description ? `${r.title}: ${r.description}` : r.title);
    }
  } catch {
    logger.warn({ captureId }, 'Could not fetch risks');
  }

  const capturePlanData: CapturePlanData = {
    capture_id: String(capture.id),
    opportunity_id: String(opp.id),
    title: opp.title,
    agency: opp.agency,
    value: opp.value_max != null ? Number(opp.value_max) : (opp.value_min != null ? Number(opp.value_min) : null),
    pwin,
    stage: pi.stage,
    win_strategy: winStrategy,
    discriminators,
    capture_plan: capture.capture_plan,
    incumbent: opp.incumbent,
    competitors,
    win_themes: capture.win_themes ?? [],
    teaming_partners: [],
    risks,
    schedule_milestones: [],
    decision_factors: [],
    doctrine_alignment: doctrineRefs,
    analysis_sections: analysisSections,
  };

  const html = generateCapturePlanHtml(capturePlanData);

  return insertGeneratedDoc(
    'capture_plan',
    String(opp.id),
    captureId,
    `Capture Plan — ${opp.title}`,
    html,
    citations,
    doctrineRefs,
    { capture_stage: capture.color_stage, pwin },
    createdBy,
  );
}

// ─── Win Themes Generator ──────────────────────────────────────────────────

export async function generateWinThemesPdf(
  captureId: string,
  createdBy: string | null,
): Promise<GeneratedDocumentRow> {
  const captureRes = await pool.query<{
    id: string;
    pipeline_item_id: string;
    win_themes: string[] | null;
    capture_plan: Record<string, unknown> | null;
  }>(
    'SELECT id, pipeline_item_id, win_themes, capture_plan FROM captures WHERE id = $1',
    [captureId],
  );
  const capture = captureRes.rows[0];
  if (!capture) throw new Error(`Capture ${captureId} not found`);

  const piRes = await pool.query<{ opportunity_id: string }>(
    'SELECT opportunity_id FROM pipeline_items WHERE id = $1',
    [capture.pipeline_item_id],
  );
  const pi = piRes.rows[0];
  if (!pi) throw new Error(`Pipeline item for capture ${captureId} not found`);

  const oppRes = await pool.query<{ id: string; title: string; agency: string | null }>(
    'SELECT id, title, agency FROM opportunities WHERE id = $1 AND deleted_at IS NULL',
    [pi.opportunity_id],
  );
  const opp = oppRes.rows[0];
  if (!opp) throw new Error(`Opportunity for capture ${captureId} not found`);

  // Fetch analysis for doctrine refs
  const winAnalysisRes = await pool.query<{
    wargame: unknown;
    competitors: unknown;
  }>(
    'SELECT wargame, competitors FROM opportunity_analysis_cache WHERE opportunity_id = $1 ORDER BY generated_at DESC LIMIT 1',
    [pi.opportunity_id],
  );
  const winCacheRow = winAnalysisRes.rows[0] ?? null;
  const analysisJson = winCacheRow
    ? {
        sections: buildSectionsFromCache(winCacheRow as Record<string, unknown>),
        wargame: winCacheRow.wargame,
      }
    : null;
  const doctrineRefs = extractDoctrineRefsFromAnalysis(analysisJson);

  // Build themes from capture data
  const rawThemes = capture.win_themes ?? [];
  const plan = (capture.capture_plan ?? {}) as Record<string, unknown>;
  const planDiscriminators = Array.isArray(plan.discriminators)
    ? (plan.discriminators as unknown[]).filter((d): d is string => typeof d === 'string')
    : [];

  // Build at least 3 themes from available data
  const themes: WinTheme[] = rawThemes.map((themeText, idx) => {
    // Try to match a doctrine principle
    let matchedPrinciple: string | null = null;
    for (const principle of DOCTRINE_PRINCIPLES) {
      if (themeText.toLowerCase().includes(principle.toLowerCase())) {
        matchedPrinciple = principle;
        break;
      }
    }

    return {
      theme_title: `Theme ${idx + 1}`,
      narrative: themeText,
      evidence: [],
      doctrine_principle: matchedPrinciple,
      has_evidence: false,
    };
  });

  // If no themes from capture, derive from discriminators
  if (themes.length === 0 && planDiscriminators.length > 0) {
    for (const disc of planDiscriminators.slice(0, 5)) {
      themes.push({
        theme_title: disc,
        narrative: `Envision differentiates through ${disc.toLowerCase()}, directly addressing the customer's mission needs.`,
        evidence: [],
        doctrine_principle: null,
        has_evidence: false,
      });
    }
  }

  const winThemeData: WinThemeData = {
    capture_id: String(capture.id),
    opportunity_id: String(opp.id),
    title: opp.title,
    agency: opp.agency,
    themes,
    doctrine_alignment: doctrineRefs,
  };

  const html = generateWinThemesHtml(winThemeData);

  return insertGeneratedDoc(
    'win_themes',
    String(opp.id),
    captureId,
    `Win Themes — ${opp.title}`,
    html,
    [],
    doctrineRefs,
    { theme_count: themes.length, has_evidence: themes.some((t) => t.has_evidence) },
    createdBy,
  );
}
