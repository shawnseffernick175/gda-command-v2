import { z } from 'zod';
import { listPipelineItems } from '../lib/services.js';
import type { ToolRegistryEntry } from './index.js';

const PipelineInputSchema = z.object({
  stage: z.string().optional(),
  owner: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const gdaGetPipeline: ToolRegistryEntry = {
  name: 'gda_get_pipeline',
  description:
    'List pipeline items with optional filters for capture owner. Returns pipeline items with opportunity details, win probability, milestones, and teaming partners.',
  inputSchema: {
    type: 'object',
    properties: {
      stage: { type: 'string', description: 'Filter by pipeline stage (not currently supported — reserved for future use)' },
      owner: { type: 'string', description: 'Filter by capture owner (case-insensitive substring match)' },
      limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Max results (default 20)' },
    },
  },
  handler: async (args: Record<string, unknown>) => {
    const input = PipelineInputSchema.parse(args);
    const limit = input.limit ?? 20;

    const result = await listPipelineItems({
      capture_owner: input.owner,
      limit,
    });

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  },
};
