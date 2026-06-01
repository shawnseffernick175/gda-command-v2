import { z } from 'zod';
import { scoreOpportunity } from '../lib/services.js';
import type { ToolRegistryEntry } from './index.js';

const PwinInputSchema = z.object({
  internal_id: z.string(),
});

export const gdaGetPwin: ToolRegistryEntry = {
  name: 'gda_get_pwin',
  description:
    'Compute the Probability of Win (PWin) for an opportunity. Returns the pwin score, model version, feature weight breakdown, top drivers, and confidence.',
  inputSchema: {
    type: 'object',
    properties: {
      internal_id: { type: 'string', description: 'Unified opportunity internal_id (UUID) to score' },
    },
    required: ['internal_id'],
  },
  handler: async (args: Record<string, unknown>) => {
    const { internal_id } = PwinInputSchema.parse(args);
    const result = await scoreOpportunity(internal_id);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  },
};
