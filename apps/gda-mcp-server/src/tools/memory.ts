import { z } from 'zod';
import { lookupSimilarDecisions, getRecentDecisionsSummary } from '../lib/services.js';
import type { ToolRegistryEntry } from './index.js';

const MemoryInputSchema = z.object({
  query: z.string().optional(),
  kind: z.string().optional(),
  lookback_days: z.number().int().min(1).max(365).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const gdaRecallDecisions: ToolRegistryEntry = {
  name: 'gda_recall_decisions',
  description:
    'Recall past agent decisions with outcomes. Two modes: (1) If `query` is provided, looks up similar decisions filtered by entity_kind (`query`) and decision kind (`kind`). Pass entity_kind values like "opportunity", "capture", "partner" and kind values like "qualify", "pursue", "partner". (2) If `query` is omitted, returns a summary of recent decisions within `lookback_days` (default 7). Useful for understanding decision history and patterns.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Entity kind to look up similar decisions for (e.g. "opportunity", "capture", "partner"). If omitted, returns recent decisions summary instead.',
      },
      kind: {
        type: 'string',
        description: 'Decision kind to filter by (e.g. "qualify", "pursue", "partner"). Used with query for lookupSimilarDecisions. Defaults to same value as query if omitted.',
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
      const kind = input.kind ?? input.query;
      decisions = await lookupSimilarDecisions(input.query, kind, limit);
    } else {
      const days = input.lookback_days ?? 7;
      decisions = await getRecentDecisionsSummary(days, limit);
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(decisions, null, 2) }],
    };
  },
};
