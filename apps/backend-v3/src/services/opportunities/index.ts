/**
 * Opportunities service — CRUD + R1 source resolution.
 */

import { pool } from '../../lib/db.js';
import { resolveFieldSources, type SourceRef } from '../../lib/sources.js';
import { evaluateTeamingFlags } from './teaming.js';
import {
  ANALYSIS_AFFECTING_FIELDS,
  type OpportunityRow,
  type OpportunitySummary,
  type OpportunityDetail,
  type OpportunityCreateInput,
  type OpportunityUpdateInput,
  type ListFilters,
  type PaginatedResult,
  type AnalysisBlock,
  type TeamingFlag,
} from './types.js';

export { evaluateTeamingFlags } from './teaming.js';
export { ANALYSIS_AFFECTING_FIELDS } from './types.js';
export type {
  OpportunityRow,
  OpportunitySummary,
  OpportunityDetail,
  OpportunityCreateInput,
  OpportunityUpdateInput,
  ListFilters,
  PaginatedResult,
  AnalysisBlock,
  TeamingFlag,
} from './types.js';

const FIELD_SOURCE_TABLES: Record<string, { table: string; fk: string }> = {
  title: { table: 'opportunity_title_sources', fk: 'opportunity_id' },
  agency: { table: 'opportunity_agency_sources', fk: 'opportunity_id' },
  naics: { table: 'opportunity_naics_sources', fk: 'opportunity_id' },
  set_aside: { table: 'opportunity_set_aside_sources', fk: 'opportunity_id' },
  grade: { table: 'opportunity_grade_sources', fk: 'opportunity_id' },
  response_due_at: { table: 'opportunity_response_due_at_sources', fk: 'opportunity_id' },
  value_min: { table: 'opportunity_value_min_sources', fk: 'opportunity_id' },
  value_max: { table: 'opportunity_value_max_sources', fk: 'opportunity_id' },
  description: { table: 'opportunity_description_sources', fk: 'opportunity_id' },
};

const ANALYSIS_SOURCE_TABLES: Record<string, { table: string; fk: string }> = {
  pwin: { table: 'opportunity_analysis_pwin_sources', fk: 'opportunity_analysis_id' },
  incumbent: { table: 'opportunity_analysis_incumbent_sources', fk: 'opportunity_analysis_id' },
  competitors: { table: 'opportunity_analysis_competitors_sources', fk: 'opportunity_analysis_id' },
  blackhat: { table: 'opportunity_analysis_blackhat_sources', fk: 'opportunity_analysis_id' },
  wargame: { table: 'opportunity_analysis_wargame_sources', fk: 'opportunity_analysis_id' },
  timeline: { table: 'opportunity_analysis_timeline_sources', fk: 'opportunity_analysis_id' },
};

async function resolveOpportunitySources(oppId: string): Promise<Record<string, SourceRef[]>> {
  const result: Record<string, SourceRef[]> = {};
  for (const [field, { table, fk }] of Object.entries(FIELD_SOURCE_TABLES)) {
    try {
      result[`${field}_sources`] = await resolveFieldSources(pool, table, fk, oppId);
    } catch {
      result[`${field}_sources`] = [];
    }
  }
  return result;
}

async function resolveAnalysisSources(analysisId: string): Promise<Record<string, SourceRef[]>> {
  const result: Record<string, SourceRef[]> = {};
  for (const [field, { table, fk }] of Object.entries(ANALYSIS_SOURCE_TABLES)) {
    try {
      result[`${field}_sources`] = await resolveFieldSources(pool, table, fk, analysisId);
    } catch {
      result[`${field}_sources`] = [];
    }
  }
  return result;
}

function parseAnalysis(row: OpportunityRow): AnalysisBlock | null {
  if (!row.analysis) return null;
  const a = row.analysis as unknown as Record<string, unknown>;
  return {
    version: (a.version as string) ?? row.analysis_version ?? '',
    generated_at: (a.generated_at as string) ?? row.ai_analyzed_at ?? '',
    pwin: (a.pwin as number) ?? 0,
    pwin_sources: (a.pwin_sources as SourceRef[]) ?? [],
    incumbent: (a.incumbent as string) ?? null,
    incumbent_sources: (a.incumbent_sources as SourceRef[]) ?? [],
    competitors: (a.competitors as AnalysisBlock['competitors']) ?? [],
    competitors_sources: (a.competitors_sources as SourceRef[]) ?? [],
    blackhat: (a.blackhat as AnalysisBlock['blackhat']) ?? null,
    blackhat_sources: (a.blackhat_sources as SourceRef[]) ?? [],
    wargame: (a.wargame as AnalysisBlock['wargame']) ?? null,
    wargame_sources: (a.wargame_sources as SourceRef[]) ?? [],
    timeline: (a.timeline as AnalysisBlock['timeline']) ?? null,
    timeline_sources: (a.timeline_sources as SourceRef[]) ?? [],
  };
}

export async function rowToSummary(row: OpportunityRow): Promise<OpportunitySummary> {
  const sources = await resolveOpportunitySources(String(row.id));
  const teamingFlags = evaluateTeamingFlags(row);
  return {
    id: String(row.id),
    title: row.title,
    title_sources: sources.title_sources ?? [],
    agency: row.agency,
    agency_sources: sources.agency_sources ?? [],
    naics: row.naics,
    naics_sources: sources.naics_sources ?? [],
    set_aside: row.set_aside,
    set_aside_sources: sources.set_aside_sources ?? [],
    grade: row.grade,
    grade_sources: sources.grade_sources ?? [],
    status: row.status,
    response_due_at: row.response_due_at,
    response_due_at_sources: sources.response_due_at_sources ?? [],
    value_min: row.value_min !== null ? Number(row.value_min) : null,
    value_min_sources: sources.value_min_sources ?? [],
    value_max: row.value_max !== null ? Number(row.value_max) : null,
    value_max_sources: sources.value_max_sources ?? [],
    teaming_flags: teamingFlags,
    ai_analyzed_at: row.ai_analyzed_at,
    analysis_version: row.analysis_version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function rowToDetail(row: OpportunityRow): Promise<OpportunityDetail> {
  const summary = await rowToSummary(row);
  const analysis = parseAnalysis(row);
  const sources = await resolveOpportunitySources(String(row.id));

  let enrichedAnalysis = analysis;
  if (enrichedAnalysis) {
    try {
      const cacheRes = await pool.query<{ id: string }>(
        `SELECT id FROM opportunity_analysis_cache
         WHERE opportunity_id = $1 AND version = $2
         ORDER BY generated_at DESC LIMIT 1`,
        [row.id, enrichedAnalysis.version],
      );
      if (cacheRes.rows[0]) {
        const analysisSources = await resolveAnalysisSources(String(cacheRes.rows[0].id));
        enrichedAnalysis = {
          ...enrichedAnalysis,
          pwin_sources: analysisSources.pwin_sources?.length
            ? analysisSources.pwin_sources
            : enrichedAnalysis.pwin_sources,
          incumbent_sources: analysisSources.incumbent_sources?.length
            ? analysisSources.incumbent_sources
            : enrichedAnalysis.incumbent_sources,
          competitors_sources: analysisSources.competitors_sources?.length
            ? analysisSources.competitors_sources
            : enrichedAnalysis.competitors_sources,
          blackhat_sources: analysisSources.blackhat_sources?.length
            ? analysisSources.blackhat_sources
            : enrichedAnalysis.blackhat_sources,
          wargame_sources: analysisSources.wargame_sources?.length
            ? analysisSources.wargame_sources
            : enrichedAnalysis.wargame_sources,
          timeline_sources: analysisSources.timeline_sources?.length
            ? analysisSources.timeline_sources
            : enrichedAnalysis.timeline_sources,
        };
      }
    } catch {
      // fallback to inline sources
    }
  }

  return {
    ...summary,
    sam_notice_id: row.sam_notice_id,
    sub_agency: row.sub_agency,
    description: row.description,
    description_sources: sources.description_sources ?? [],
    posted_at: row.posted_at,
    qualified_at: row.qualified_at,
    qualified_by: row.qualified_by,
    grade_evidence: row.grade_evidence,
    analysis: enrichedAnalysis!,
  };
}

export async function listOpportunities(
  filters: ListFilters,
): Promise<PaginatedResult<OpportunitySummary>> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const conditions: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (filters.status) {
    conditions.push(`status = $${paramIdx++}`);
    params.push(filters.status);
  }
  if (filters.agency) {
    conditions.push(`agency ILIKE $${paramIdx++}`);
    params.push(`%${filters.agency}%`);
  }
  if (filters.naics) {
    conditions.push(`naics ILIKE $${paramIdx++}`);
    params.push(`%${filters.naics}%`);
  }
  if (filters.grade) {
    conditions.push(`grade = $${paramIdx++}`);
    params.push(filters.grade);
  }
  if (filters.set_aside) {
    conditions.push(`set_aside ILIKE $${paramIdx++}`);
    params.push(`%${filters.set_aside}%`);
  }
  if (filters.due_before) {
    conditions.push(`response_due_at <= $${paramIdx++}`);
    params.push(filters.due_before);
  }
  if (filters.due_after) {
    conditions.push(`response_due_at >= $${paramIdx++}`);
    params.push(filters.due_after);
  }
  if (filters.min_value !== undefined) {
    conditions.push(`value_max >= $${paramIdx++}`);
    params.push(filters.min_value);
  }
  if (filters.max_value !== undefined) {
    conditions.push(`value_min <= $${paramIdx++}`);
    params.push(filters.max_value);
  }
  if (filters.hot === '1') {
    conditions.push(`(grade = 'A')`);
  }

  if (filters.cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(filters.cursor, 'base64').toString('utf-8')) as {
        id: number;
      };
      conditions.push(`id < $${paramIdx++}`);
      params.push(decoded.id);
    } catch {
      // invalid cursor, ignore
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `SELECT * FROM opportunities ${where} ORDER BY id DESC LIMIT $${paramIdx}`;
  params.push(limit + 1);

  const res = await pool.query<OpportunityRow>(sql, params);
  const rows = res.rows;

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  const summaries = await Promise.all(items.map(rowToSummary));

  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const lastItem = items[items.length - 1]!;
    nextCursor = Buffer.from(JSON.stringify({ id: Number(lastItem.id) })).toString('base64');
  }

  return {
    items: summaries,
    pagination: {
      limit,
      cursor: nextCursor,
      hasMore,
    },
  };
}

export async function getOpportunityById(id: string): Promise<OpportunityRow | null> {
  const res = await pool.query<OpportunityRow>(
    'SELECT * FROM opportunities WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  return res.rows[0] ?? null;
}

export async function createOpportunity(input: OpportunityCreateInput): Promise<OpportunityRow> {
  const sourceRes = await pool.query<{ id: string }>(
    `INSERT INTO sources (kind, title, retrieved_at)
     VALUES ($1, $2, NOW()) RETURNING id`,
    [input.source === 'manual' ? 'manual' : 'internal', `${input.source} entry`],
  );
  const sourceId = sourceRes.rows[0]!.id;

  const res = await pool.query<OpportunityRow>(
    `INSERT INTO opportunities (
      title, agency, sub_agency, sam_notice_id, naics, description,
      set_aside, response_due_at, posted_at, value_min, value_max,
      data_source, source_id, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'discovery')
    RETURNING *`,
    [
      input.title,
      input.agency ?? null,
      input.sub_agency ?? null,
      input.sam_notice_id ?? null,
      input.naics ?? null,
      input.description ?? null,
      input.set_aside ?? null,
      input.response_due_at ?? null,
      input.posted_at ?? null,
      input.value_min ?? null,
      input.value_max ?? null,
      input.source,
      sourceId,
    ],
  );

  const opp = res.rows[0]!;

  // Auto-create field source entries for provided fields
  const fieldSourceInserts: Array<{ table: string; field: string; value: unknown }> = [
    { table: 'opportunity_title_sources', field: 'title', value: input.title },
    { table: 'opportunity_agency_sources', field: 'agency', value: input.agency },
    { table: 'opportunity_naics_sources', field: 'naics', value: input.naics },
    { table: 'opportunity_set_aside_sources', field: 'set_aside', value: input.set_aside },
    { table: 'opportunity_description_sources', field: 'description', value: input.description },
    { table: 'opportunity_value_min_sources', field: 'value_min', value: input.value_min },
    { table: 'opportunity_value_max_sources', field: 'value_max', value: input.value_max },
    {
      table: 'opportunity_response_due_at_sources',
      field: 'response_due_at',
      value: input.response_due_at,
    },
  ];

  for (const { table, value } of fieldSourceInserts) {
    if (value !== undefined && value !== null) {
      try {
        await pool.query(
          `INSERT INTO "${table}" (opportunity_id, source_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [opp.id, sourceId],
        );
      } catch {
        // non-critical
      }
    }
  }

  return opp;
}

export async function updateOpportunity(
  id: string,
  input: OpportunityUpdateInput,
): Promise<{ row: OpportunityRow; analysisAffected: boolean }> {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;
  let analysisAffected = false;

  const fields = Object.entries(input).filter(([, v]) => v !== undefined);
  for (const [key, value] of fields) {
    if (key === 'tags') {
      setClauses.push(`tags = $${paramIdx++}`);
      params.push(value);
    } else {
      setClauses.push(`"${key}" = $${paramIdx++}`);
      params.push(value);
    }
    if (ANALYSIS_AFFECTING_FIELDS.has(key)) {
      analysisAffected = true;
    }
  }

  setClauses.push(`updated_at = NOW()`);

  const sql = `UPDATE opportunities SET ${setClauses.join(', ')} WHERE id = $${paramIdx} AND deleted_at IS NULL RETURNING *`;
  params.push(id);

  const res = await pool.query<OpportunityRow>(sql, params);
  return { row: res.rows[0]!, analysisAffected };
}

export async function qualifyOpportunity(
  id: string,
  qualifiedBy: string,
): Promise<{ row: OpportunityRow; teaming_flags: TeamingFlag[] }> {
  const now = new Date().toISOString();
  const res = await pool.query<OpportunityRow>(
    `UPDATE opportunities
     SET qualified_at = $1, qualified_by = $2, status = 'qualified', updated_at = NOW()
     WHERE id = $3 AND deleted_at IS NULL
     RETURNING *`,
    [now, qualifiedBy, id],
  );
  const row = res.rows[0]!;
  const teaming_flags = evaluateTeamingFlags(row);
  return { row, teaming_flags };
}
