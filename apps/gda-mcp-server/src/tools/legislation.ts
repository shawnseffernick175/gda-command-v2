import { z } from 'zod';
import { searchBills, LegiScanError } from '../lib/legiscan-client.js';
import type { ToolRegistryEntry } from './index.js';

const LegislationInputSchema = z.object({
  query: z.string(),
  state: z.string().optional(),
  year: z.number().int().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const gdaSearchBills: ToolRegistryEntry = {
  name: 'gda_search_bills',
  description:
    'Search federal + state legislation via LegiScan. Returns bills matching query with status, sponsors, latest action, and a link to the bill text. Use state="US" for federal only, a two-letter code for a specific state, or "ALL" for federal + all states.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query (e.g. "defense appropriations", "cybersecurity")' },
      state: {
        type: 'string',
        description:
          'US state code — "US" for federal only, two-letter state code (e.g. "CA"), or "ALL" for federal + all states (default "US")',
      },
      year: {
        type: 'integer',
        description: 'Legislation year (default current year)',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 50,
        description: 'Max results (1-50, default 20)',
      },
    },
    required: ['query'],
  },
  handler: async (args: Record<string, unknown>) => {
    try {
      const input = LegislationInputSchema.parse(args);
      const bills = await searchBills({
        query: input.query,
        state: input.state ?? 'US',
        year: input.year ?? new Date().getFullYear(),
        limit: input.limit ?? 20,
      });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(bills, null, 2) }],
      };
    } catch (err) {
      if (err instanceof LegiScanError) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: err.message }],
        };
      }
      if (err instanceof z.ZodError) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Validation error: ${(err as z.ZodError).message}` }],
        };
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `LegiScan request failed: ${message}` }],
      };
    }
  },
};
