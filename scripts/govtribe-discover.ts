#!/usr/bin/env tsx
/**
 * GovTribe MCP tool discovery — connects to https://govtribe.com/mcp,
 * runs tools/list, and writes the result to
 * apps/backend-v3/src/ingest/govtribe/tools.generated.json
 *
 * Usage:
 *   GOVTRIBE_API_KEY=<jwt> pnpm tsx scripts/govtribe-discover.ts
 *
 * No credits are burned — this only calls the MCP tools/list method.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MCP_ENDPOINT = process.env['GOVTRIBE_MCP_URL'] ?? 'https://govtribe.com/mcp';
const API_KEY = process.env['GOVTRIBE_API_KEY'] ?? '';

if (!API_KEY) {
  console.error('ERROR: GOVTRIBE_API_KEY env var is required');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(
  __dirname,
  '../apps/backend-v3/src/ingest/govtribe/tools.generated.json',
);

async function main(): Promise<void> {
  console.log(`Connecting to GovTribe MCP at ${MCP_ENDPOINT} …`);

  const transport = new StreamableHTTPClientTransport(new URL(MCP_ENDPOINT), {
    requestInit: {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
      },
    },
  });

  const client = new Client({ name: 'gda-govtribe-discover', version: '1.0.0' });

  try {
    await client.connect(transport);
    console.log('Connected. Fetching tools/list …');

    const { tools } = await client.listTools();

    console.log(`Discovered ${tools.length} tool(s):\n`);
    for (const tool of tools) {
      const cost = (tool as Record<string, unknown>)['creditCost'] ?? (tool as Record<string, unknown>)['cost'] ?? '?';
      console.log(`  • ${tool.name} (cost: ${cost})`);
      if (tool.description) {
        console.log(`    ${tool.description.slice(0, 120)}`);
      }
    }

    writeFileSync(OUTPUT_PATH, JSON.stringify(tools, null, 2) + '\n', 'utf-8');
    console.log(`\nWritten to ${OUTPUT_PATH}`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Discovery failed:', err);
  process.exit(1);
});
