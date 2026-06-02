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
import { gdaListActionItems } from './action-items.js';
import { gdaGetPipeline } from './pipeline.js';
import { gdaRunColorTeam } from './color-teams.js';
import { gdaGetLaunchpadSummary } from './launchpad.js';
import { gdaRecallDecisions } from './memory.js';
import { gdaSearchBills } from './legislation.js';

export const toolRegistry: ToolRegistryEntry[] = [
  // F-502 tools
  gdaSearchOpportunities,
  gdaGetOpportunity,
  gdaScoreDoctrine,
  gdaGetPwin,
  gdaQueryRag,
  // F-503 tools
  gdaListActionItems,
  gdaGetPipeline,
  gdaRunColorTeam,
  gdaGetLaunchpadSummary,
  gdaRecallDecisions,
  // F-506 tools
  gdaSearchBills,
];
