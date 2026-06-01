export interface ToolRegistryEntry {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<{
    isError?: boolean;
    content: Array<{ type: 'text'; text: string }>;
  }>;
}

import { gdaSearchOpportunities, gdaGetOpportunity } from './opportunities.js';
import { gdaScoreDoctrine } from './doctrine.js';
import { gdaGetPwin } from './pwin.js';
import { gdaQueryRag } from './rag.js';

export const toolRegistry: ToolRegistryEntry[] = [
  gdaSearchOpportunities,
  gdaGetOpportunity,
  gdaScoreDoctrine,
  gdaGetPwin,
  gdaQueryRag,
];
