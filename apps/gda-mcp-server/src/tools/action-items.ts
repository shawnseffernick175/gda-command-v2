import { z } from 'zod';
import { pool } from '../lib/pool.js';
import { listActionItems, getDraftsByActionItem, toApiShape } from '../lib/services.js';
import type { ToolRegistryEntry } from './index.js';

const ActionItemsInputSchema = z.object({
  opportunity_id: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'done']).optional(),
  assignee: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const gdaListActionItems: ToolRegistryEntry = {
  name: 'gda_list_action_items',
  description:
    'List action items with optional filters for opportunity, status, and assignee. Returns action items in API shape with hydrated draft data per row. Capped at 100 rows.',
  inputSchema: {
    type: 'object',
    properties: {
      opportunity_id: { type: 'string', description: 'Filter by linked opportunity ID' },
      status: {
        type: 'string',
        enum: ['open', 'in_progress', 'done'],
        description: 'Filter by action item status',
      },
      assignee: { type: 'string', description: 'Filter by owner/assignee' },
      limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Max results (default 20)' },
    },
  },
  handler: async (args: Record<string, unknown>) => {
    const input = ActionItemsInputSchema.parse(args);
    const limit = Math.min(input.limit ?? 20, 100);

    const { items } = await listActionItems(pool, {
      status: input.status,
      owner: input.assignee,
      linked_record_type: input.opportunity_id ? 'opportunity' : undefined,
      limit,
    });

    const filtered = input.opportunity_id
      ? items.filter((row) => row.linked_record_id === input.opportunity_id)
      : items;

    const result = await Promise.all(
      filtered.map(async (row) => {
        const drafts = await getDraftsByActionItem(pool, row.id);
        return toApiShape(row, drafts);
      }),
    );

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  },
};
