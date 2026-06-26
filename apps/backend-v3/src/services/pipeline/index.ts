import { pool } from '../../lib/db.js';
import { normalizePipelineStage } from '../../lib/pipeline-stage.js';
import type {
  PipelineItem,
  PipelineRow,
  PipelineListFilters,
  PipelineCreateInput,
  PipelineUpdateInput,
  PaginatedResult,
  Milestone,
  SourceRef,
} from './types.js';

function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`).toString('base64url');
}

function decodeCursor(cursor: string): { created_at: string; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf-8');
    const sep = decoded.indexOf('|');
    if (sep === -1) return null;
    const created_at = decoded.slice(0, sep);
    const id = decoded.slice(sep + 1);
    if (!created_at || !id) return null;
    return { created_at, id };
  } catch {
    return null;
  }
}

function parseMilestones(raw: string | null): Milestone[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Milestone[];
  } catch {
    return [];
  }
}

function buildSourceRef(
  kind: string | null,
  title: string | null,
  url: string | null,
  retrievedAt: string | null,
): SourceRef[] {
  if (!kind || !retrievedAt) return [];
  return [{ kind, title, url, retrieved_at: retrievedAt }];
}

function rowToItem(row: PipelineRow): PipelineItem {
  const estVal = row.estimated_value != null ? Number(row.estimated_value) : null;
  const valMax = row.opportunity_value_max != null ? Number(row.opportunity_value_max) : null;
  const valMin = row.opportunity_value_min != null ? Number(row.opportunity_value_min) : null;
  const resolvedValue = estVal ?? valMax ?? valMin ?? 0;

  // pwin_override is stored 0–1; win_probability / pwin_score are 0–100
  const pwinOverride = row.pwin_override != null ? Number(row.pwin_override) * 100 : null;
  const winProb = row.win_probability != null ? Number(row.win_probability) : null;
  const analysisPwin = row.pwin_score != null ? Number(row.pwin_score) : null;
  const resolvedPwin = pwinOverride ?? winProb ?? analysisPwin ?? null;

  const resolvedWeighted = resolvedPwin != null
    ? Math.round(resolvedValue * resolvedPwin / 100)
    : 0;

  return {
    id: String(row.id),
    opportunity_id: String(row.opportunity_id),
    opportunity_title: row.opportunity_title,
    opportunity_title_sources: row.opportunity_title_sources ?? [],
    opportunity_agency: row.opportunity_agency,
    opportunity_agency_sources: row.opportunity_agency_sources ?? [],
    opportunity_naics: row.opportunity_naics,
    opportunity_naics_sources: row.opportunity_naics_sources ?? [],
    opportunity_set_aside: row.opportunity_set_aside,
    opportunity_set_aside_sources: row.opportunity_set_aside_sources ?? [],
    opportunity_due_at: row.opportunity_due_at,
    opportunity_due_at_sources: row.opportunity_due_at_sources ?? [],
    opportunity_value_min: valMin,
    opportunity_value_min_sources: row.opportunity_value_min_sources ?? [],
    opportunity_value_max: valMax,
    opportunity_value_max_sources: row.opportunity_value_max_sources ?? [],
    capture_owner: row.capture_owner,
    capture_owner_sources: buildSourceRef(
      row.pipeline_source_kind,
      row.pipeline_source_title,
      row.pipeline_source_url,
      row.pipeline_source_retrieved_at,
    ),
    win_prob_pct: winProb,
    win_prob_pct_sources: buildSourceRef(
      row.pipeline_source_kind,
      row.pipeline_source_title,
      row.pipeline_source_url,
      row.pipeline_source_retrieved_at,
    ),
    win_prob_evidence: row.win_prob_evidence,
    win_prob_evidence_sources: buildSourceRef(
      row.pipeline_source_kind,
      row.pipeline_source_title,
      row.pipeline_source_url,
      row.pipeline_source_retrieved_at,
    ),
    stage: row.stage,
    milestones: parseMilestones(row.milestone_90day),
    teaming_partners: row.teaming_partners ?? [],
    pwin_score: analysisPwin,
    pwin_band: row.pwin_band,
    solicitation_number: row.solicitation_number,
    resolved_value: resolvedValue,
    resolved_pwin: resolvedPwin,
    resolved_weighted: resolvedWeighted,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const SOURCE_SUBQUERY = (table: string, fk: string): string =>
  `COALESCE(
    (SELECT json_agg(json_build_object(
      'kind', s.kind, 'title', s.title, 'url', s.url,
      'retrieved_at', s.retrieved_at
    )) FROM ${table} js JOIN sources s ON js.source_id = s.id WHERE js.${fk} = o.id),
    '[]'::json
  )`;

const BASE_SELECT = `
  SELECT
    pi.id, pi.opportunity_id, pi.capture_owner,
    pi.win_probability, pi.win_prob_evidence,
    pi.milestone_90day, pi.source_id,
    pi.estimated_value, pi.pwin_override,
    pi.created_at, pi.updated_at,

    o.title           AS opportunity_title,
    o.agency          AS opportunity_agency,
    o.naics           AS opportunity_naics,
    o.set_aside       AS opportunity_set_aside,
    o.response_due_at AS opportunity_due_at,
    o.value_min       AS opportunity_value_min,
    o.value_max       AS opportunity_value_max,
    o.ai_analyzed_at  AS opportunity_ai_analyzed_at,
    o.analysis_version AS opportunity_analysis_version,
    o.solicitation_number AS solicitation_number,

    pi.stage,

    (SELECT ac.pwin FROM opportunity_analysis_cache ac
     WHERE ac.opportunity_id = o.id ORDER BY ac.generated_at DESC LIMIT 1
    ) AS pwin_score,

    (SELECT
       CASE
         WHEN ac.pwin >= 70 THEN 'high'
         WHEN ac.pwin >= 40 THEN 'medium'
         WHEN ac.pwin > 0  THEN 'low'
         ELSE NULL
       END
     FROM opportunity_analysis_cache ac
     WHERE ac.opportunity_id = o.id ORDER BY ac.generated_at DESC LIMIT 1
    ) AS pwin_band,

    ${SOURCE_SUBQUERY('opportunity_title_sources', 'opportunity_id')}         AS opportunity_title_sources,
    ${SOURCE_SUBQUERY('opportunity_agency_sources', 'opportunity_id')}        AS opportunity_agency_sources,
    ${SOURCE_SUBQUERY('opportunity_naics_sources', 'opportunity_id')}         AS opportunity_naics_sources,
    ${SOURCE_SUBQUERY('opportunity_set_aside_sources', 'opportunity_id')}     AS opportunity_set_aside_sources,
    ${SOURCE_SUBQUERY('opportunity_response_due_at_sources', 'opportunity_id')} AS opportunity_due_at_sources,
    ${SOURCE_SUBQUERY('opportunity_value_min_sources', 'opportunity_id')}     AS opportunity_value_min_sources,
    ${SOURCE_SUBQUERY('opportunity_value_max_sources', 'opportunity_id')}     AS opportunity_value_max_sources,
    ps.kind           AS pipeline_source_kind,
    ps.title          AS pipeline_source_title,
    ps.url            AS pipeline_source_url,
    ps.retrieved_at   AS pipeline_source_retrieved_at,

    COALESCE(
      (SELECT json_agg(p.name)
       FROM teaming_attachments ta
       JOIN partners p ON ta.partner_id = p.id
       WHERE ta.opportunity_id = o.id AND ta.role != 'prime'),
      '[]'::json
    ) AS teaming_partners

  FROM pipeline_items pi
  JOIN opportunities o ON pi.opportunity_id = o.id AND o.deleted_at IS NULL
  LEFT JOIN sources ps ON pi.source_id = ps.id
`;

export async function listPipelineItems(
  filters: PipelineListFilters,
): Promise<PaginatedResult<PipelineItem>> {
  const conditions: string[] = [
    "pi.stage NOT IN ('no_bid', 'lost', 'gov_cancelled')",
  ];
  const params: unknown[] = [];
  let paramIdx = 0;

  if (filters.capture_owner) {
    paramIdx++;
    conditions.push(`pi.capture_owner ILIKE $${paramIdx}`);
    params.push(`%${filters.capture_owner}%`);
  }
  if (filters.opportunity_agency) {
    paramIdx++;
    conditions.push(`o.agency ILIKE $${paramIdx}`);
    params.push(`%${filters.opportunity_agency}%`);
  }
  if (filters.opportunity_naics) {
    paramIdx++;
    conditions.push(`o.naics ILIKE $${paramIdx}`);
    params.push(`%${filters.opportunity_naics}%`);
  }
  if (filters.opportunity_set_aside) {
    paramIdx++;
    conditions.push(`o.set_aside ILIKE $${paramIdx}`);
    params.push(`%${filters.opportunity_set_aside}%`);
  }
  if (filters.due_after) {
    paramIdx++;
    conditions.push(`o.response_due_at >= $${paramIdx}`);
    params.push(filters.due_after);
  }
  if (filters.due_before) {
    paramIdx++;
    conditions.push(`o.response_due_at <= $${paramIdx}`);
    params.push(filters.due_before);
  }
  if (filters.stage) {
    const normalized = normalizePipelineStage(filters.stage) ?? filters.stage;
    paramIdx++;
    conditions.push(`pi.stage = $${paramIdx}`);
    params.push(normalized);
  }
  if (filters.q) {
    paramIdx++;
    conditions.push(`(o.title ILIKE $${paramIdx} OR o.agency ILIKE $${paramIdx} OR o.solicitation_number ILIKE $${paramIdx})`);
    params.push(`%${filters.q}%`);
  }

  if (filters.cursor) {
    const cur = decodeCursor(filters.cursor);
    if (cur) {
      paramIdx++;
      const tsIdx = paramIdx;
      paramIdx++;
      const idIdx = paramIdx;
      conditions.push(`(pi.created_at, pi.id) < ($${tsIdx}::timestamptz, $${idIdx}::bigint)`);
      params.push(cur.created_at, cur.id);
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const fetchLimit = filters.limit + 1;
  paramIdx++;
  params.push(fetchLimit);

  const sql = `${BASE_SELECT} ${where} ORDER BY pi.created_at DESC, pi.id DESC LIMIT $${paramIdx}`;
  const res = await pool.query<PipelineRow>(sql, params);

  const hasMore = res.rows.length > filters.limit;
  const rows = hasMore ? res.rows.slice(0, filters.limit) : res.rows;
  const items = rows.map(rowToItem);

  let nextCursor: string | null = null;
  if (hasMore && rows.length > 0) {
    const last = rows[rows.length - 1]!;
    nextCursor = encodeCursor(last.created_at, String(last.id));
  }

  return {
    items,
    pagination: {
      limit: filters.limit,
      cursor: nextCursor,
      hasMore,
    },
  };
}

interface OpportunityCheck {
  id: string;
  status: string;
}

export async function createPipelineItem(
  input: PipelineCreateInput,
  userId: string,
): Promise<{ item: PipelineItem; created: boolean }> {
  const oppRes = await pool.query<OpportunityCheck>(
    'SELECT id, status FROM opportunities WHERE id = $1 AND deleted_at IS NULL',
    [input.opportunity_id],
  );
  const opp = oppRes.rows[0];
  if (!opp) {
    throw Object.assign(new Error('Opportunity not found'), { statusCode: 404 });
  }
  if (opp.status !== 'qualified') {
    throw Object.assign(
      new Error('Opportunity must be qualified before pipeline promotion'),
      { statusCode: 400 },
    );
  }

  const existingRes = await pool.query<{ id: string }>(
    'SELECT id FROM pipeline_items WHERE opportunity_id = $1',
    [input.opportunity_id],
  );
  if (existingRes.rows.length > 0) {
    const existId = existingRes.rows[0]!.id;
    const item = await getPipelineItemById(String(existId));
    if (item) return { item, created: false };
  }

  const srcRes = await pool.query<{ id: string }>(
    `INSERT INTO sources (kind, title, retrieved_at)
     VALUES ('internal', 'Pipeline promotion', NOW()) RETURNING id`,
  );
  const sourceId = srcRes.rows[0]!.id;

  const milestoneJson = input.milestones ? JSON.stringify(input.milestones) : null;
  const numericUserId = /^\d+$/.test(userId) ? userId : null;

  const insertRes = await pool.query<{ id: string }>(
    `INSERT INTO pipeline_items (
       opportunity_id, capture_owner, win_probability, win_prob_evidence,
       milestone_90day, source_id, created_by, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     RETURNING id`,
    [
      input.opportunity_id,
      input.capture_owner,
      input.win_prob_pct ?? null,
      input.win_prob_evidence ?? null,
      milestoneJson,
      sourceId,
      numericUserId,
    ],
  );

  if (input.teaming_partners && input.teaming_partners.length > 0) {
    await syncTeamingPartners(input.opportunity_id, input.teaming_partners, sourceId, numericUserId);
  }

  const item = await getPipelineItemById(String(insertRes.rows[0]!.id));
  if (!item) throw new Error('Failed to read newly created pipeline item');
  return { item, created: true };
}

export async function updatePipelineItem(
  id: string,
  input: PipelineUpdateInput,
): Promise<PipelineItem | null> {
  const existing = await pool.query<{ id: string; opportunity_id: string; source_id: string }>(
    'SELECT id, opportunity_id, source_id FROM pipeline_items WHERE id = $1',
    [id],
  );
  if (existing.rows.length === 0) return null;

  const row = existing.rows[0]!;
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 0;

  if (input.capture_owner !== undefined) {
    idx++;
    sets.push(`capture_owner = $${idx}`);
    params.push(input.capture_owner);
  }
  if (input.win_prob_pct !== undefined) {
    idx++;
    sets.push(`win_probability = $${idx}`);
    params.push(input.win_prob_pct);
  }
  if (input.win_prob_evidence !== undefined) {
    idx++;
    sets.push(`win_prob_evidence = $${idx}`);
    params.push(input.win_prob_evidence);
  }
  if (input.milestones !== undefined) {
    idx++;
    sets.push(`milestone_90day = $${idx}`);
    params.push(JSON.stringify(input.milestones));
  }

  if (sets.length > 0) {
    idx++;
    sets.push(`updated_at = NOW()`);
    params.push(id);
    await pool.query(
      `UPDATE pipeline_items SET ${sets.join(', ')} WHERE id = $${idx}`,
      params,
    );
  }

  if (input.teaming_partners !== undefined) {
    await syncTeamingPartners(row.opportunity_id, input.teaming_partners, row.source_id, null);
  }

  return getPipelineItemById(id);
}

async function getPipelineItemById(id: string): Promise<PipelineItem | null> {
  const sql = `${BASE_SELECT} WHERE pi.id = $1`;
  const res = await pool.query<PipelineRow>(sql, [id]);
  if (res.rows.length === 0) return null;
  return rowToItem(res.rows[0]!);
}

async function syncTeamingPartners(
  opportunityId: string,
  partnerNames: string[],
  sourceId: string,
  userId: string | null,
): Promise<void> {
  if (partnerNames.length === 0) return;

  const placeholders = partnerNames.map((_, i) => `$${i + 1}`).join(', ');
  const partnerRes = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM partners WHERE LOWER(name) IN (${placeholders})`,
    partnerNames.map((n) => n.toLowerCase()),
  );

  for (const partner of partnerRes.rows) {
    await pool.query(
      `INSERT INTO teaming_attachments (opportunity_id, partner_id, reason, role, source_id, created_by)
       VALUES ($1, $2, 'Pipeline teaming partner', 'subcontractor', $3, $4)
       ON CONFLICT (opportunity_id, partner_id) DO NOTHING`,
      [opportunityId, partner.id, sourceId, userId],
    );
  }
}
