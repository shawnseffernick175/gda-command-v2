import { z } from 'zod';
import { pool } from '../lib/pool.js';
import { getMergedOpportunity } from '../lib/services.js';
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
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(merged, null, 2) }],
    };
  },
};
