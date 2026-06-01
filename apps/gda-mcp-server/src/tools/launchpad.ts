import { z } from 'zod';
import { computeLaunchpadSummary } from '../lib/services.js';
import type { ToolRegistryEntry } from './index.js';

const LaunchpadInputSchema = z.object({});

export const gdaGetLaunchpadSummary: ToolRegistryEntry = {
  name: 'gda_get_launchpad_summary',
  description:
    'Get the launchpad summary — a single-screen state-of-the-pipeline snapshot. Returns counts for qualified opportunities due this week, pipeline items missing captures, stale color reviews, open action items due today, and overdue action items. Zero-input "say something" tool for quick situational awareness.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (args: Record<string, unknown>) => {
    LaunchpadInputSchema.parse(args);
    const summary = await computeLaunchpadSummary();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }],
    };
  },
};
