import { z } from 'zod';
import { pool } from '../lib/pool.js';
import { getMergedOpportunity, computeDoctrineBadge } from '../lib/services.js';
import type { Competitor } from '../lib/service-types.js';
import type { ToolRegistryEntry } from './index.js';

// ─── gda_search_opportunities ───────────────────────────────────────────────

const SearchInputSchema = z.object({
  query: z.string().optional(),
  agency: z.string().optional(),
  naics: z.string().optional(),
  lifecycle_stage: z
    .enum(['signal', 'forecast', 'pre_sol', 'solicitation', 'awarded', 'post_award', 'closed'])
    .optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

type SearchInput = z.infer<typeof SearchInputSchema>;

async function handleSearchOpportunities(input: SearchInput) {
  const limit = input.limit ?? 20;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (input.query) {
    conditions.push(`title ILIKE $${idx}`);
    params.push(`%${input.query}%`);
    idx++;
  }
  if (input.agency) {
    conditions.push(`agency ILIKE $${idx}`);
    params.push(`%${input.agency}%`);
    idx++;
  }
  if (input.naics) {
    conditions.push(`naics ILIKE $${idx}`);
    params.push(`%${input.naics}%`);
    idx++;
  }
  if (input.lifecycle_stage) {
    conditions.push(`lifecycle_stage = $${idx}`);
    params.push(input.lifecycle_stage);
    idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT internal_id, lifecycle_stage, primary_source, title, agency, naics, psc,
                      set_aside, estimated_value_cents, response_due_at, pwin, doctrine_status,
                      created_at, updated_at
               FROM unified_opportunities ${where}
               ORDER BY updated_at DESC
               LIMIT $${idx}`;
  params.push(limit);

  const result = await pool.query(sql, params);
  return result.rows;
}

export const gdaSearchOpportunities: ToolRegistryEntry = {
  name: 'gda_search_opportunities',
  description:
    'Search unified opportunities with optional filters for query text, agency, NAICS code, and lifecycle stage.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Free-text search against opportunity title' },
      agency: { type: 'string', description: 'Filter by agency (case-insensitive substring)' },
      naics: { type: 'string', description: 'Filter by NAICS code (case-insensitive substring)' },
      lifecycle_stage: {
        type: 'string',
        enum: ['signal', 'forecast', 'pre_sol', 'solicitation', 'awarded', 'post_award', 'closed'],
        description: 'Filter by lifecycle stage',
      },
      limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Max results (default 20)' },
    },
  },
  handler: async (args: Record<string, unknown>) => {
    const input = SearchInputSchema.parse(args);
    const rows = await handleSearchOpportunities(input);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(rows, null, 2) }],
    };
  },
};

// ─── gda_get_opportunity ────────────────────────────────────────────────────

const GetInputSchema = z.object({
  internal_id: z.string(),
});

/**
 * Resolve doctrine badge, candidate_partners, and competitors from existing
 * tables for a merged opportunity (F-437). Wrapped in try/catch so
 * enrichment failures never crash the MCP tool handler.
 *
 * doctrine_evaluations.entity_id is uuid while opportunities.id is bigint,
 * so that query is omitted; matchedPrincipleIds stays empty.
 */
async function enrichWithDoctrineBadge(internalId: string) {
  const noneBadge = await computeDoctrineBadge({});
  const defaults = { doctrine_badge: noneBadge, candidate_partners: [] as string[], competitors: [] as Competitor[] };

  try {
    const oppIdRes = await pool.query<{ id: string }>(
      `SELECT o.id FROM opportunities o
       JOIN unified_opportunity_links l ON (
         (l.source = 'sam'      AND o.sam_notice_id = l.source_native_id AND o.data_source = 'sam_gov')
         OR (l.source = 'govwin'   AND o.sam_notice_id = 'govwin-' || l.source_native_id)
         OR (l.source = 'govtribe' AND o.govtribe_id  = l.source_native_id)
       )
       WHERE l.internal_id = $1 AND o.deleted_at IS NULL
       LIMIT 1`,
      [internalId],
    );
    const oppId = oppIdRes.rows[0]?.id;
    if (!oppId) return defaults;

    const [featRes, analysisRes] = await Promise.all([
      pool.query<{ features: Record<string, unknown> }>(
        `SELECT features FROM pwin_features WHERE opportunity_id = $1 ORDER BY computed_at DESC LIMIT 1`,
        [oppId],
      ),
      pool.query<{ analysis: Record<string, unknown> | null }>(
        `SELECT analysis FROM opportunities WHERE id = $1 AND deleted_at IS NULL`,
        [oppId],
      ),
    ]);

    const features = featRes.rows[0]?.features;
    const doctrineAlignmentScore = (features?.doctrine_alignment_score as number | undefined) ?? null;
    const candidatePartners = (features?.candidate_partners as string[] | undefined) ?? [];

    const analysis = analysisRes.rows[0]?.analysis;
    const rawCompetitors = (analysis?.competitors ?? []) as Array<Record<string, unknown>>;
    const competitors: Competitor[] = rawCompetitors
      .filter((c) => typeof c.name === 'string')
      .map((c) => ({ name: c.name as string, threat_level: (c.threat_level as string) ?? 'medium' }));

    const badge = await computeDoctrineBadge({ doctrineAlignmentScore });
    return { doctrine_badge: badge, candidate_partners: candidatePartners, competitors };
  } catch {
    return defaults;
  }
}

export const gdaGetOpportunity: ToolRegistryEntry = {
  name: 'gda_get_opportunity',
  description:
    'Get the merged opportunity view for a given internal_id, combining all linked source records via the F-405 precedence stack.',
  inputSchema: {
    type: 'object',
    properties: {
      internal_id: { type: 'string', description: 'Unified opportunity internal_id (UUID)' },
    },
    required: ['internal_id'],
  },
  handler: async (args: Record<string, unknown>) => {
    const { internal_id } = GetInputSchema.parse(args);
    const merged = await getMergedOpportunity(pool, internal_id);
    if (!merged) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `Opportunity ${internal_id} not found` }],
      };
    }
    const enrichment = await enrichWithDoctrineBadge(internal_id);
    const payload = { ...merged, ...enrichment };
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    };
  },
};
