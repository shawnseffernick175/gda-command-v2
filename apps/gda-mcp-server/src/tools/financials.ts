import { z } from 'zod';
import { getCompanyFilings, EdgarError } from '../lib/edgar-client.js';
import type { ToolRegistryEntry } from './index.js';

const FinancialsInputSchema = z.object({
  query: z.string(),
  form_type: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const gdaCompanyFinancials: ToolRegistryEntry = {
  name: 'gda_company_financials',
  description:
    'Look up a public company on SEC EDGAR and return its profile plus recent filings (10-K, 10-Q, 8-K, etc.) with direct links to each document. Accepts a ticker (e.g. "LMT"), a company name (e.g. "Lockheed Martin"), or a CIK number. Use form_type to filter to a specific filing type. Useful for competitor and prime-contractor financial intelligence.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Ticker symbol, company name, or CIK number (e.g. "LMT", "Lockheed Martin", "936468")',
      },
      form_type: {
        type: 'string',
        description: 'Optional SEC form filter (e.g. "10-K", "10-Q", "8-K", "DEF 14A"). Omit for all forms.',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 50,
        description: 'Max filings to return (1-50, default 15)',
      },
    },
    required: ['query'],
  },
  handler: async (args: Record<string, unknown>) => {
    try {
      const input = FinancialsInputSchema.parse(args);
      const company = await getCompanyFilings({
        query: input.query,
        formType: input.form_type,
        limit: input.limit ?? 15,
      });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(company, null, 2) }],
      };
    } catch (err) {
      if (err instanceof EdgarError) {
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
        content: [{ type: 'text' as const, text: `SEC EDGAR request failed: ${message}` }],
      };
    }
  },
};
