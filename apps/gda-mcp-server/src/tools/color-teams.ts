import { z } from 'zod';
import { pool } from '../lib/pool.js';
import { isColorTeamEnabled, createColorTeamRun, executeColorTeamRun } from '../lib/services.js';
import type { ToolRegistryEntry } from './index.js';

const ColorTeamInputSchema = z.object({
  document_id: z.string(),
  stage: z.enum(['pink', 'red', 'gold', 'submitted']),
});

const STAGE_TO_COLORS: Record<string, string[]> = {
  pink: ['pink'],
  red: ['red'],
  gold: ['green'],
  submitted: ['white'],
};

export const gdaRunColorTeam: ToolRegistryEntry = {
  name: 'gda_run_color_team',
  description:
    'Execute a color team review on a document at a specific Shipley stage. Stages: pink (initial compliance), red (final pre-submission), gold (executive/green review), submitted (post-submission white glove). Returns the run ID, status, and findings count. Short-circuits with an error if the color team feature is disabled.',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: { type: 'string', description: 'Document ID to review' },
      stage: {
        type: 'string',
        enum: ['pink', 'red', 'gold', 'submitted'],
        description: 'Color review stage (pink, red, gold, submitted)',
      },
    },
    required: ['document_id', 'stage'],
  },
  handler: async (args: Record<string, unknown>) => {
    const input = ColorTeamInputSchema.parse(args);

    const enabled = await isColorTeamEnabled(pool);
    if (!enabled) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: 'Color team feature disabled' }],
      };
    }

    const colors = STAGE_TO_COLORS[input.stage] ?? [input.stage];
    const run = await createColorTeamRun(pool, {
      document_id: input.document_id,
      colors,
      triggered_by: 'mcp-tool',
    });

    await executeColorTeamRun(pool, run.id);

    const updatedRun = await getRunAfterExecution(run.id);

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          run_id: updatedRun.id,
          status: updatedRun.status,
          findings_count: updatedRun.findings_count,
        }, null, 2),
      }],
    };
  },
};

async function getRunAfterExecution(runId: string): Promise<{
  id: string;
  status: string;
  findings_count: number;
}> {
  const runRes = await pool.query<{ id: string; status: string }>(
    'SELECT id, status FROM color_team_runs WHERE id = $1',
    [runId],
  );
  const run = runRes.rows[0];

  const countRes = await pool.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM color_team_findings WHERE run_id = $1',
    [runId],
  );

  return {
    id: run?.id ?? runId,
    status: run?.status ?? 'unknown',
    findings_count: parseInt(countRes.rows[0]?.count ?? '0', 10),
  };
}
