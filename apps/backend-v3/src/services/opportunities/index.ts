/**
 * Opportunities service — CRUD + R1 source resolution.
 */

import { pool } from '../../lib/db.js';
import { resolveFieldSources, type SourceRef } from '../../lib/sources.js';
import { evaluateTeamingFlags } from './teaming.js';
import { mapAgencyToDepartment } from '../../lib/departmentMap.js';
import {
  ANALYSIS_AFFECTING_FIELDS,
  type OpportunityRow,
  type OpportunitySummary,
  type OpportunityDetail,
  type OpportunityCreateInput,
  type OpportunityUpdateInput,
  type ListFilters,
  type PaginatedResult,
  type PagedResult,
  type OpportunityMeta,
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
  PagedResult,
  OpportunityMeta,
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
    pwin: typeof a.pwin === 'object' && a.pwin !== null
      ? ((a.pwin as { score?: number | null }).score ?? 0) / 100
      : ((a.pwin as number) ?? 0),
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

function computeDeadlineWarning(row: OpportunityRow, hasPipelineStage?: boolean): boolean {
  if (hasPipelineStage) return false;
  if (!row.response_due_at) return false;
  const due = new Date(row.response_due_at);
  const now = new Date();
  const daysRemaining = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return daysRemaining >= 0 && daysRemaining <= 30;
}

function buildSummaryFromSources(
  row: OpportunityRow,
  sources: Record<string, SourceRef[]>,
  hasPipelineStage?: boolean,
): OpportunitySummary {
  const teamingFlags = evaluateTeamingFlags(row);
  return {
    id: String(row.id),
    title: row.title,
    title_sources: sources.title_sources ?? [],
    agency: row.agency,
    agency_sources: sources.agency_sources ?? [],
    department: row.department ?? mapAgencyToDepartment(row.agency),
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
    deadline_warning: computeDeadlineWarning(row, hasPipelineStage),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function rowToSummary(row: OpportunityRow): Promise<OpportunitySummary> {
  const sources = await resolveOpportunitySources(String(row.id));
  return buildSummaryFromSources(row, sources);
}

export async function rowToDetail(row: OpportunityRow): Promise<OpportunityDetail> {
  const sources = await resolveOpportunitySources(String(row.id));
  const summary = buildSummaryFromSources(row, sources);
  const analysis = parseAnalysis(row);

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

  // Extract llm_analysis from the raw analysis JSONB (F-453)
  const rawAnalysis = row.analysis as unknown as Record<string, unknown> | null;
  const llmAnalysis = rawAnalysis?.llm_analysis ?? null;
  const llmQualityFlag = (rawAnalysis?.llm_quality_flag as string | null) ?? null;

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
    llm_analysis: llmAnalysis,
    llm_quality_flag: llmQualityFlag,
  };
}

export async function listOpportunities(
  filters: ListFilters,
): Promise<PaginatedResult<OpportunitySummary>> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const conditions: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (filters.q) {
    conditions.push(`(title ILIKE $${paramIdx} OR agency ILIKE $${paramIdx})`);
    params.push(`%${filters.q}%`);
    paramIdx++;
  }
  if (filters.status) {
    conditions.push(`status = $${paramIdx++}`);
    params.push(filters.status);
  }
  if (filters.agency) {
    conditions.push(`agency ILIKE $${paramIdx++}`);
    params.push(`%${filters.agency}%`);
  }
  if (filters.department) {
    conditions.push(`department = $${paramIdx++}`);
    params.push(filters.department);
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

  const sql = `SELECT *, (EXISTS(SELECT 1 FROM pipeline_items pi WHERE pi.opportunity_id = opportunities.id)) AS has_pipeline_stage FROM opportunities ${where} ORDER BY id DESC LIMIT $${paramIdx}`;
  params.push(limit + 1);

  const res = await pool.query<OpportunityRow & { has_pipeline_stage: boolean }>(sql, params);
  const rows = res.rows;

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  const summaries = await Promise.all(
    items.map(async (row) => {
      const sources = await resolveOpportunitySources(String(row.id));
      return buildSummaryFromSources(row, sources, row.has_pipeline_stage);
    }),
  );

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

function buildFilterConditions(
  filters: ListFilters,
): { conditions: string[]; params: unknown[]; paramIdx: number } {
  const conditions: string[] = ['o.deleted_at IS NULL'];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (filters.q) {
    conditions.push(
      `(o.title ILIKE $${paramIdx} OR o.agency ILIKE $${paramIdx} OR o.solicitation_number ILIKE $${paramIdx} OR o.description ILIKE $${paramIdx})`,
    );
    params.push(`%${filters.q}%`);
    paramIdx++;
  }
  if (filters.status) {
    conditions.push(`o.status = $${paramIdx++}`);
    params.push(filters.status);
  }
  if (filters.agency) {
    conditions.push(`o.agency ILIKE $${paramIdx++}`);
    params.push(`%${filters.agency}%`);
  }
  if (filters.department) {
    conditions.push(`o.department = $${paramIdx++}`);
    params.push(filters.department);
  }
  if (filters.naics) {
    conditions.push(`o.naics ILIKE $${paramIdx++}`);
    params.push(`%${filters.naics}%`);
  }
  if (filters.grade) {
    conditions.push(`o.grade = $${paramIdx++}`);
    params.push(filters.grade);
  }
  if (filters.grades && filters.grades.length > 0) {
    const hasUnscored = filters.grades.includes('Unscored');
    const letterGrades = filters.grades.filter((g) => g !== 'Unscored');
    const parts: string[] = [];
    if (letterGrades.length > 0) {
      parts.push(`o.grade = ANY($${paramIdx++})`);
      params.push(letterGrades);
    }
    if (hasUnscored) {
      parts.push(`o.grade IS NULL`);
    }
    if (parts.length > 0) {
      conditions.push(`(${parts.join(' OR ')})`);
    }
  }
  if (filters.set_aside) {
    conditions.push(`o.set_aside ILIKE $${paramIdx++}`);
    params.push(`%${filters.set_aside}%`);
  }
  if (filters.set_asides && filters.set_asides.length > 0) {
    const setAsideParts: string[] = [];
    for (const sa of filters.set_asides) {
      const idx = paramIdx++;
      params.push(`%${sa}%`);
      setAsideParts.push(`o.set_aside ILIKE $${idx}`);
    }
    conditions.push(`(${setAsideParts.join(' OR ')})`);
  }
  if (filters.due_before) {
    conditions.push(`o.response_due_at <= $${paramIdx++}`);
    params.push(filters.due_before);
  }
  if (filters.due_after) {
    conditions.push(`o.response_due_at >= $${paramIdx++}`);
    params.push(filters.due_after);
  }
  if (filters.due) {
    const now = new Date();
    switch (filters.due) {
      case 'this_week': {
        const weekEnd = new Date(now.getTime() + 7 * 86400_000);
        conditions.push(`o.response_due_at >= $${paramIdx++}`);
        params.push(now.toISOString());
        conditions.push(`o.response_due_at <= $${paramIdx++}`);
        params.push(weekEnd.toISOString());
        break;
      }
      case 'this_month': {
        const monthEnd = new Date(now.getTime() + 30 * 86400_000);
        conditions.push(`o.response_due_at >= $${paramIdx++}`);
        params.push(now.toISOString());
        conditions.push(`o.response_due_at <= $${paramIdx++}`);
        params.push(monthEnd.toISOString());
        break;
      }
      case 'next_90': {
        const ninetyEnd = new Date(now.getTime() + 90 * 86400_000);
        conditions.push(`o.response_due_at >= $${paramIdx++}`);
        params.push(now.toISOString());
        conditions.push(`o.response_due_at <= $${paramIdx++}`);
        params.push(ninetyEnd.toISOString());
        break;
      }
      case 'past_due': {
        conditions.push(`o.response_due_at < $${paramIdx++}`);
        params.push(now.toISOString());
        conditions.push(`o.status != 'awarded'`);
        break;
      }
      default:
        break;
    }
  }
  if (filters.min_value !== undefined) {
    conditions.push(`o.value_max >= $${paramIdx++}`);
    params.push(filters.min_value);
  }
  if (filters.max_value !== undefined) {
    conditions.push(`o.value_min <= $${paramIdx++}`);
    params.push(filters.max_value);
  }
  if (filters.hot === '1') {
    conditions.push(`(o.grade = 'A')`);
  }
  if (filters.sources && filters.sources.length > 0) {
    conditions.push(`o.data_source = ANY($${paramIdx++})`);
    params.push(filters.sources);
  }
  if (filters.stage === 'active') {
    conditions.push(
      `EXISTS(SELECT 1 FROM pipeline_items pi2 WHERE pi2.opportunity_id = o.id AND pi2.stage NOT IN ('won','lost'))`,
    );
  } else if (filters.stage) {
    conditions.push(
      `EXISTS(SELECT 1 FROM pipeline_items pi2 WHERE pi2.opportunity_id = o.id AND pi2.stage = $${paramIdx++})`,
    );
    params.push(filters.stage);
  }

  return { conditions, params, paramIdx };
}

export async function listOpportunitiesPaged(
  filters: ListFilters,
): Promise<PagedResult<OpportunitySummary>> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const page = Math.max(filters.page ?? 1, 1);
  const offset = (page - 1) * limit;

  const { conditions, params, paramIdx } = buildFilterConditions(filters);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Build a second WHERE without stage filter for stage tab counts
  const filtersWithoutStage = { ...filters, stage: undefined };
  const { conditions: baseConditions, params: baseParams } = buildFilterConditions(filtersWithoutStage);
  const baseWhere = baseConditions.length > 0 ? `WHERE ${baseConditions.join(' AND ')}` : '';

  const metaSql = `
    SELECT
      COUNT(*)::int AS total_count,
      COUNT(*) FILTER (WHERE o.response_due_at IS NOT NULL AND o.response_due_at >= NOW() AND o.response_due_at <= NOW() + INTERVAL '7 days')::int AS due_this_week,
      COUNT(*) FILTER (WHERE o.grade IS NULL)::int AS unscored_count,
      COALESCE(SUM(COALESCE(o.value_max, o.value_min, 0)), 0)::bigint AS total_value,
      COUNT(*) FILTER (WHERE o.grade = 'A')::int AS grade_a_count
    FROM opportunities o ${where}
  `;
  const metaRes = await pool.query<{
    total_count: number;
    due_this_week: number;
    unscored_count: number;
    total_value: string;
    grade_a_count: number;
  }>(metaSql, params);
  const metaRow = metaRes.rows[0];
  const total = metaRow?.total_count ?? 0;
  const totalPages = Math.max(Math.ceil(total / limit), 1);

  // Stage counts use base filters (without stage) so all tab counts stay accurate
  const stageCountsSql = `
    SELECT pi.stage, COUNT(DISTINCT pi.opportunity_id)::int AS cnt
    FROM pipeline_items pi
    INNER JOIN opportunities o ON o.id = pi.opportunity_id
    ${baseWhere}
    GROUP BY pi.stage
  `;
  const stageRes = await pool.query<{ stage: string; cnt: number }>(stageCountsSql, baseParams);
  const stageCounts: Record<string, number> = {};
  for (const row of stageRes.rows) {
    stageCounts[row.stage] = row.cnt;
  }

  let dataParamIdx = paramIdx;
  const dataSql = `
    SELECT o.*,
      (EXISTS(SELECT 1 FROM pipeline_items pi WHERE pi.opportunity_id = o.id)) AS has_pipeline_stage,
      (SELECT pi.stage FROM pipeline_items pi WHERE pi.opportunity_id = o.id ORDER BY pi.id DESC LIMIT 1) AS pipeline_stage
    FROM opportunities o ${where}
    ORDER BY o.id DESC
    LIMIT $${dataParamIdx} OFFSET $${dataParamIdx + 1}
  `;
  const dataParams = [...params, limit, offset];
  const res = await pool.query<OpportunityRow & { has_pipeline_stage: boolean; pipeline_stage: string | null }>(dataSql, dataParams);

  const summaries = await Promise.all(
    res.rows.map(async (row) => {
      const sources = await resolveOpportunitySources(String(row.id));
      const summary = buildSummaryFromSources(row, sources, row.has_pipeline_stage);
      return {
        ...summary,
        data_source: row.data_source,
        solicitation_number: row.solicitation_number,
        pipeline_stage: row.pipeline_stage,
      };
    }),
  );

  const meta: OpportunityMeta = {
    total_count: metaRow?.total_count ?? 0,
    due_this_week: metaRow?.due_this_week ?? 0,
    unscored_count: metaRow?.unscored_count ?? 0,
    total_value: Number(metaRow?.total_value ?? 0),
    grade_a_count: metaRow?.grade_a_count ?? 0,
    stage_counts: stageCounts,
  };

  return { items: summaries, total, page, totalPages, meta };
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

  const department = mapAgencyToDepartment(input.agency);

  const res = await pool.query<OpportunityRow>(
    `INSERT INTO opportunities (
      title, agency, sub_agency, sam_notice_id, naics, description,
      set_aside, response_due_at, posted_at, value_min, value_max,
      data_source, source_id, status, department
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'discovery', $14)
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
      department,
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
  let agencyValue: string | undefined;
  for (const [key, value] of fields) {
    if (key === 'tags') {
      setClauses.push(`tags = $${paramIdx++}`);
      params.push(value);
    } else {
      setClauses.push(`"${key}" = $${paramIdx++}`);
      params.push(value);
    }
    if (key === 'agency') {
      agencyValue = value as string;
    }
    if (ANALYSIS_AFFECTING_FIELDS.has(key)) {
      analysisAffected = true;
    }
  }

  // Re-map department when agency changes
  if (agencyValue !== undefined) {
    setClauses.push(`department = $${paramIdx++}`);
    params.push(mapAgencyToDepartment(agencyValue));
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
