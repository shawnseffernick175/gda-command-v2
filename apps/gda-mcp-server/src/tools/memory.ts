import { z } from 'zod';
import { lookupSimilarDecisions, getRecentDecisionsSummary } from '../lib/services.js';
import type { ToolRegistryEntry } from './index.js';

const MemoryInputSchema = z.object({
  query: z.string().optional(),
  lookback_days: z.number().int().min(1).max(365).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const gdaRecallDecisions: ToolRegistryEntry = {
  name: 'gda_recall_decisions',
  description:
    'Recall past agent decisions with outcomes. Two modes: (1) If `query` is provided, looks up similar decisions by entity_kind (query value) — pass a value like "opportunity" or "capture". (2) If `query` is omitted, returns a summary of recent decisions within `lookback_days` (default 7). Useful for understanding decision history and patterns.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Entity kind to look up similar decisions for (e.g. "opportunity", "capture", "partner"). If omitted, returns recent decisions summary instead.',
      },
      lookback_days: {
        type: 'integer',
        minimum: 1,
        maximum: 365,
        description: 'Number of days to look back for recent decisions (default 7, used when query is omitted)',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        description: 'Max results (default 10)',
      },
    },
  },
  handler: async (args: Record<string, unknown>) => {
    const input = MemoryInputSchema.parse(args);
    const limit = input.limit ?? 10;

    let decisions;
    if (input.query) {
      decisions = await lookupSimilarDecisions(input.query, limit);
    } else {
      const days = input.lookback_days ?? 7;
      decisions = await getRecentDecisionsSummary(days, limit);
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(decisions, null, 2) }],
    };
  },
};
