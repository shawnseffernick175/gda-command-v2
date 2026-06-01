import { z } from 'zod';
import { ragSearch } from '../lib/services.js';
import type { ToolRegistryEntry } from './index.js';

const RagInputSchema = z.object({
  query: z.string(),
  top_k: z.number().int().min(1).max(50).optional(),
});

export const gdaQueryRag: ToolRegistryEntry = {
  name: 'gda_query_rag',
  description:
    'Perform semantic search over the GDA knowledge base (past performances, doctrine docs, capture plans, proposals, etc). Returns ranked chunks with source metadata and relevance scores.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Semantic search query against the GDA knowledge base' },
      top_k: { type: 'integer', minimum: 1, maximum: 50, description: 'Number of results to return (default 8)' },
    },
    required: ['query'],
  },
  handler: async (args: Record<string, unknown>) => {
    const input = RagInputSchema.parse(args);
    const results = await ragSearch({ query: input.query, top_k: input.top_k });
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }],
    };
  },
};
