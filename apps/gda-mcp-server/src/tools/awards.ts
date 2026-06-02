import { z } from 'zod';
import { getCompanyAwards, UsaSpendingError } from '../lib/usaspending-client.js';
import type { ToolRegistryEntry } from './index.js';

const AwardsInputSchema = z.object({
  company: z.string(),
  dod_only: z.boolean().optional(),
  years: z.number().int().min(1).max(20).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const gdaCompanyAwards: ToolRegistryEntry = {
  name: 'gda_company_awards',
  description:
    'Look up a company\'s recent U.S. federal contract awards via USAspending.gov — free, no key. Returns awards (largest first) with amount, awarding agency/sub-agency, NAICS/PSC codes, period of performance, and a link to each award. Use dod_only=true (default) to focus on Department of Defense awards. Ideal for competitor and prime/teaming intelligence on emerging defense opportunities.',
  inputSchema: {
    type: 'object',
    properties: {
      company: {
        type: 'string',
        description: 'Company / recipient name to search (e.g. "Lockheed Martin", "Anduril", "Palantir")',
      },
      dod_only: {
        type: 'boolean',
        description: 'Restrict to Department of Defense awards (default true). Set false for all federal agencies.',
      },
      years: {
        type: 'integer',
        minimum: 1,
        maximum: 20,
        description: 'How many years back to search (1-20, default 5)',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        description: 'Max awards to return (1-100, default 25)',
      },
    },
    required: ['company'],
  },
  handler: async (args: Record<string, unknown>) => {
    try {
      const input = AwardsInputSchema.parse(args);
      const result = await getCompanyAwards({
        company: input.company,
        dodOnly: input.dod_only ?? true,
        years: input.years ?? 5,
        limit: input.limit ?? 25,
      });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      if (err instanceof UsaSpendingError) {
        return { isError: true, content: [{ type: 'text' as const, text: err.message }] };
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
        content: [{ type: 'text' as const, text: `USAspending request failed: ${message}` }],
      };
    }
  },
};
