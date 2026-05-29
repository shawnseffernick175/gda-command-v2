/**
 * Transform — map V2 rows to V3 schema.
 *
 * For each entity (opportunity, capture, action_item, source, partner),
 * produce a normalized V3 record. Coerce types, fix encoding,
 * normalize timestamps to UTC ISO 8601.
 */

import { v4 as uuidv4 } from 'uuid';
import { SOURCE_KINDS, type SourceKind } from '../lib/sources.js';
import type {
  LegacyOpportunity,
  LegacyCapture,
  LegacyActionItem,
  LegacySource,
  LegacyPartner,
  V3Opportunity,
  V3Capture,
  V3ActionItem,
  V3Source,
  V3Partner,
  AnalysisSourceRef,
  GapEntry,
  PreWarmJob,
} from './types.js';

const SOURCE_KIND_SET = new Set<string>(SOURCE_KINDS);

function toUtcIso(val: string | null | undefined): string | null {
  if (!val) return null;
  try {
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

function coerceNumber(val: number | string | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function normalizeSourceKind(raw: string | null | undefined): SourceKind {
  if (!raw) return 'internal';
  const lower = raw.toLowerCase().trim();
  if (SOURCE_KIND_SET.has(lower)) return lower as SourceKind;
  if (lower.includes('sam') || lower.includes('sam.gov')) return 'sam_gov';
  if (lower.includes('fpds')) return 'fpds';
  if (lower.includes('usaspending')) return 'usaspending';
  if (lower.includes('govwin')) return 'govwin';
  if (lower.includes('govtribe')) return 'govtribe';
  if (lower.includes('n8n') || lower.includes('workflow')) return 'n8n_workflow';
  if (lower.includes('manual')) return 'manual';
  if (lower.includes('news')) return 'news';
  if (lower.includes('doctrine')) return 'doctrine';
  if (lower.includes('partner')) return 'partner_site';
  return 'internal';
}

function inferSourceKindFromUrl(url: string | null | undefined): SourceKind {
  if (!url) return 'internal';
  if (url.includes('sam.gov')) return 'sam_gov';
  if (url.includes('fpds.gov')) return 'fpds';
  if (url.includes('usaspending.gov')) return 'usaspending';
  if (url.includes('govwin')) return 'govwin';
  if (url.includes('govtribe')) return 'govtribe';
  return 'internal';
}

function inferDataSource(legacy: LegacyOpportunity): string {
  if (legacy.data_source) {
    const ds = legacy.data_source.toLowerCase();
    if (ds.includes('sam')) return 'sam_gov';
    if (ds.includes('govtribe')) return 'govtribe';
    if (ds.includes('govwin')) return 'govwin';
    if (ds.includes('n8n')) return 'n8n_workflow';
    if (ds.includes('manual')) return 'manual';
    return legacy.data_source;
  }
  return inferSourceKindFromUrl(legacy.raw_source_url ?? legacy.source_url);
}

function buildSourcesForField(
  fieldValue: unknown,
  sourceUrl: string | null | undefined,
  dataSource: string,
): AnalysisSourceRef[] {
  if (fieldValue === null || fieldValue === undefined) return [];
  if (!sourceUrl) return [];
  return [{
    kind: inferSourceKindFromUrl(sourceUrl) || normalizeSourceKind(dataSource),
    title: `V2 data migration`,
    url: sourceUrl,
    retrieved_at: new Date().toISOString(),
  }];
}

export interface TransformResult {
  opportunities: V3Opportunity[];
  captures: V3Capture[];
  actionItems: V3ActionItem[];
  sources: V3Source[];
  partners: V3Partner[];
  gaps: GapEntry[];
  preWarmJobs: PreWarmJob[];
}

export function transformOpportunities(
  legacy: LegacyOpportunity[],
): { records: V3Opportunity[]; gaps: GapEntry[]; preWarmJobs: PreWarmJob[] } {
  const records: V3Opportunity[] = [];
  const gaps: GapEntry[] = [];
  const preWarmJobs: PreWarmJob[] = [];
  const seen = new Map<string, number>();

  for (const row of legacy) {
    const dedupKey = row.solicitation_number
      ? row.solicitation_number.trim().toLowerCase()
      : `title:${(row.title ?? '').trim().toLowerCase()}`;

    if (seen.has(dedupKey)) {
      gaps.push({
        entity_type: 'opportunity',
        entity_id: String(row.id),
        field: 'id',
        reason: 'DUPLICATE_KEY',
        url: `https://gda.csr-llc.tech/opportunities/${row.id}`,
        detail: `Duplicate solicitation_number/title: "${dedupKey}"`,
      });
      continue;
    }
    seen.set(dedupKey, records.length);

    const id = uuidv4();
    const sourceUrl = row.raw_source_url ?? row.source_url ?? null;
    const dataSource = inferDataSource(row);

    const analysis = row.analysis ?? null;

    if (analysis) {
      const analysisFields = ['pwin', 'incumbent', 'competitors', 'blackhat', 'wargame', 'timeline'] as const;
      for (const f of analysisFields) {
        const val = (analysis as Record<string, unknown>)[f];
        const sourcesKey = `${f}_sources`;
        const hasSources = Array.isArray((analysis as Record<string, unknown>)[sourcesKey])
          && ((analysis as Record<string, unknown>)[sourcesKey] as unknown[]).length > 0;

        if (val !== null && val !== undefined && !hasSources) {
          if (sourceUrl) {
            (analysis as Record<string, unknown>)[sourcesKey] = buildSourcesForField(val, sourceUrl, dataSource);
          } else {
            (analysis as Record<string, unknown>)[sourcesKey] = [];
            gaps.push({
              entity_type: 'opportunity',
              entity_id: id,
              field: f,
              reason: 'MISSING_SOURCES',
              url: `https://gda.csr-llc.tech/opportunities/${row.id}`,
              detail: `V2 has ${f} data but no source URL for provenance`,
            });
          }
        }
      }
    }

    if (!analysis) {
      preWarmJobs.push({
        entityType: 'opportunity',
        entityId: id,
        priority: 'normal',
        trigger: 'pre-warm',
      });
    }

    const now = new Date().toISOString();
    records.push({
      id,
      title: (row.title ?? 'Untitled').trim(),
      agency: row.agency?.trim() ?? null,
      sub_agency: row.sub_agency?.trim() ?? null,
      solicitation_number: row.solicitation_number?.trim() ?? null,
      sam_notice_id: row.notice_id?.trim() ?? null,
      status: row.status?.trim() ?? 'discovery',
      grade: null,
      grade_evidence: null,
      value_min: coerceNumber(row.value_min ?? row.value),
      value_max: coerceNumber(row.value_max),
      naics: row.naics?.trim() ?? null,
      psc: row.psc?.trim() ?? null,
      set_aside: row.set_aside?.trim() ?? null,
      place_of_performance: row.place_of_performance?.trim() ?? null,
      response_due_at: toUtcIso(row.response_deadline),
      posted_at: toUtcIso(row.posted_date),
      incumbent: row.incumbent?.trim() ?? null,
      description: row.description?.trim() ?? null,
      tags: row.tags ?? [],
      data_source: dataSource,
      analysis,
      analysis_version: row.analysis_version ?? null,
      ai_analyzed_at: toUtcIso(row.ai_analyzed_at),
      qualified_at: toUtcIso(row.qualified_at),
      qualified_by: row.qualified_by ?? null,
      source_id: 1,
      legacy_id: String(row.id),
      created_at: toUtcIso(row.created_at) ?? now,
      updated_at: toUtcIso(row.updated_at) ?? now,
    });
  }

  return { records, gaps, preWarmJobs };
}

export function transformCaptures(
  legacy: LegacyCapture[],
  opportunityIdMap: Map<string, string>,
): { records: V3Capture[]; gaps: GapEntry[]; preWarmJobs: PreWarmJob[] } {
  const records: V3Capture[] = [];
  const gaps: GapEntry[] = [];
  const preWarmJobs: PreWarmJob[] = [];

  for (const row of legacy) {
    const id = uuidv4();
    let oppId = row.opportunity_id ? String(row.opportunity_id) : null;

    if (oppId && opportunityIdMap.has(oppId)) {
      oppId = opportunityIdMap.get(oppId)!;
    } else if (oppId) {
      gaps.push({
        entity_type: 'capture',
        entity_id: id,
        field: 'opportunity_id',
        reason: 'ORPHANED_REFERENCE',
        url: `https://gda.csr-llc.tech/captures/${row.id}`,
        detail: `References opportunity ${oppId} which does not exist in V3`,
      });
      oppId = null;
    }

    if (!row.analysis) {
      preWarmJobs.push({
        entityType: 'capture',
        entityId: id,
        priority: 'normal',
        trigger: 'pre-warm',
      });
    }

    const now = new Date().toISOString();
    records.push({
      id,
      opportunity_id: oppId ?? uuidv4(),
      status: row.status?.trim() ?? 'active',
      analysis: row.analysis ?? null,
      analysis_version: row.analysis_version ?? null,
      ai_analyzed_at: toUtcIso(row.ai_analyzed_at),
      legacy_id: String(row.id),
      created_at: toUtcIso(row.created_at) ?? now,
      updated_at: toUtcIso(row.updated_at) ?? now,
    });
  }

  return { records, gaps, preWarmJobs };
}

export function transformActionItems(
  legacy: LegacyActionItem[],
): { records: V3ActionItem[]; gaps: GapEntry[] } {
  const records: V3ActionItem[] = [];
  const gaps: GapEntry[] = [];

  for (const row of legacy) {
    const id = uuidv4();
    const status = normalizeActionItemStatus(row.status);
    const now = new Date().toISOString();

    records.push({
      id,
      title: (row.title ?? 'Untitled').trim(),
      detail: row.detail?.trim() ?? null,
      owner: (row.owner ?? 'Shawn').trim(),
      status,
      due_date: toUtcIso(row.due_date),
      source: row.source ?? 'manual',
      source_id: row.source_id ?? null,
      linked_record_type: row.linked_record_type ?? null,
      linked_record_id: row.linked_record_id ?? null,
      completed_at: toUtcIso(row.completed_at),
      legacy_id: String(row.id),
      created_at: toUtcIso(row.created_at) ?? now,
      updated_at: toUtcIso(row.updated_at) ?? now,
    });
  }

  return { records, gaps };
}

function normalizeActionItemStatus(raw: string | null | undefined): string {
  if (!raw) return 'open';
  const lower = raw.toLowerCase().trim();
  if (lower === 'done' || lower === 'completed' || lower === 'closed') return 'done';
  if (lower === 'in_progress' || lower === 'in progress' || lower === 'active') return 'in_progress';
  return 'open';
}

export function transformSources(
  legacy: LegacySource[],
): { records: V3Source[]; gaps: GapEntry[] } {
  const records: V3Source[] = [];
  const gaps: GapEntry[] = [];

  for (const row of legacy) {
    const id = uuidv4();
    const kind = normalizeSourceKind(row.kind);
    const now = new Date().toISOString();

    records.push({
      id,
      kind,
      url: row.url?.trim() ?? null,
      title: row.title?.trim() ?? null,
      retrieved_at: toUtcIso(row.retrieved_at) ?? now,
      confidence: row.confidence ?? 'high',
      meta: row.meta ?? {},
      legacy_id: String(row.id),
      created_at: toUtcIso(row.created_at) ?? now,
    });
  }

  return { records, gaps };
}

export function transformPartners(
  legacy: LegacyPartner[],
): { records: V3Partner[]; gaps: GapEntry[] } {
  const records: V3Partner[] = [];
  const gaps: GapEntry[] = [];

  for (const row of legacy) {
    const id = uuidv4();
    const now = new Date().toISOString();

    records.push({
      id,
      name: (row.name ?? 'Unknown').trim(),
      display_name: row.display_name?.trim() ?? row.name?.trim() ?? null,
      anchor_company: row.anchor_company?.trim() ?? null,
      uei: row.uei?.trim() ?? null,
      cage: row.cage?.trim() ?? null,
      primary_naics: row.primary_naics?.trim() ?? null,
      capabilities: row.capabilities ?? [],
      certifications: row.certifications ?? [],
      vehicles: row.vehicles ?? [],
      legacy_id: String(row.id),
      created_at: toUtcIso(row.created_at) ?? now,
      updated_at: toUtcIso(row.updated_at) ?? now,
    });
  }

  return { records, gaps };
}

export function transformAll(extracted: {
  opportunities: LegacyOpportunity[];
  captures: LegacyCapture[];
  actionItems: LegacyActionItem[];
  sources: LegacySource[];
  partners: LegacyPartner[];
}): TransformResult {
  const oppResult = transformOpportunities(extracted.opportunities);

  const opportunityIdMap = new Map<string, string>();
  for (let i = 0; i < extracted.opportunities.length; i++) {
    const legacyOpp = extracted.opportunities[i];
    const v3Opp = oppResult.records.find((r) => r.legacy_id === String(legacyOpp?.id));
    if (legacyOpp && v3Opp) {
      opportunityIdMap.set(String(legacyOpp.id), v3Opp.id);
    }
  }

  const capResult = transformCaptures(extracted.captures, opportunityIdMap);
  const aiResult = transformActionItems(extracted.actionItems);
  const srcResult = transformSources(extracted.sources);
  const partnerResult = transformPartners(extracted.partners);

  const allGaps = [
    ...oppResult.gaps,
    ...capResult.gaps,
    ...aiResult.gaps,
    ...srcResult.gaps,
    ...partnerResult.gaps,
  ];

  const allPreWarmJobs = [
    ...oppResult.preWarmJobs,
    ...capResult.preWarmJobs,
  ];

  return {
    opportunities: oppResult.records,
    captures: capResult.records,
    actionItems: aiResult.records,
    sources: srcResult.records,
    partners: partnerResult.records,
    gaps: allGaps,
    preWarmJobs: allPreWarmJobs,
  };
}
