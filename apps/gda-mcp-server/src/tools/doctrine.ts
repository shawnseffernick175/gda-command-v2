import { z } from 'zod';
import { runDoctrineCheck } from '../lib/services.js';
import type { ToolRegistryEntry } from './index.js';

const DoctrineInputSchema = z.object({
  internal_id: z.string(),
});

export const gdaScoreDoctrine: ToolRegistryEntry = {
  name: 'gda_score_doctrine',
  description:
    'Run the doctrine alignment check for an opportunity. Returns the alignment total score, per-principle breakdown, exclusion triggers, margin check, and recommendations.',
  inputSchema: {
    type: 'object',
    properties: {
      internal_id: { type: 'string', description: 'Unified opportunity internal_id (UUID) to score' },
    },
    required: ['internal_id'],
  },
  handler: async (args: Record<string, unknown>) => {
    const { internal_id } = DoctrineInputSchema.parse(args);
    const evaluation = await runDoctrineCheck('opportunity', internal_id);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(evaluation, null, 2) }],
    };
  },
};
