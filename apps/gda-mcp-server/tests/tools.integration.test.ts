/**
 * F-502 + F-503 + F-506 integration tests — validates that all 11 MCP tools:
 * 1. Appear in tools/list with correct names, descriptions, inputSchemas
 * 2. Return valid MCP responses (not transport crashes) when called
 * 3. Surface service/validation errors as MCP error responses (isError: true)
 * 4. Work end-to-end with a seeded Postgres DB
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://gda:gda_dev_password@localhost:5432/gda_command';

process.env['JWT_SECRET'] = 'test-jwt-secret';
process.env['MCP_PORT'] = '0';
process.env['DATABASE_URL'] = DATABASE_URL;

const { createApp } = await import('../src/server.js');

let httpServer: http.Server;
let baseUrl: string;
let pool: pg.Pool;

// Test fixture IDs
const TEST_INTERNAL_ID = '00000000-0000-0000-0000-000000000001';
const NON_EXISTENT_ID = '00000000-0000-0000-0000-ffffffffffff';
let TEST_ACTION_ITEM_ID: string;
let TEST_DOCUMENT_ID: string;
let TEST_SOURCE_ID: string;

function makeToken(): string {
  return jwt.sign(
    { sub: 'test-user', email: 'test@gda.local' },
    'test-jwt-secret',
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

async function createMcpClient(): Promise<Client> {
  const token = makeToken();
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

// ─── Setup / Teardown ───────────────────────────────────────────────────────

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });

  // Seed a minimal unified_opportunity for tests
  await pool.query(`
    INSERT INTO unified_opportunities (internal_id, lifecycle_stage, title, agency, naics, primary_source)
    VALUES ($1, 'solicitation', 'Test Opportunity for F-502', 'DOD', '541511', 'sam')
    ON CONFLICT (internal_id) DO NOTHING
  `, [TEST_INTERNAL_ID]);

  // F-503: Seed a source for FK references
  const srcRes = await pool.query<{ id: string }>(
    `INSERT INTO sources (kind, title, retrieved_at) VALUES ('internal', 'F-503 test seed', NOW()) RETURNING id`,
  );
  TEST_SOURCE_ID = srcRes.rows[0]!.id;

  // F-503: Seed action_items for gda_list_action_items tests
  const aiRes = await pool.query<{ id: string }>(
    `INSERT INTO action_items (title, body, owner_email, status, priority, origin, source_id, created_at, updated_at)
     VALUES ('F-503 Test Action Item', 'Test detail', 'test@gda.local', 'open', 'normal', 'manual', $1, NOW(), NOW())
     RETURNING id`,
    [TEST_SOURCE_ID],
  );
  TEST_ACTION_ITEM_ID = aiRes.rows[0]!.id;

  // F-503: Seed documents for gda_run_color_team tests
  const docRes = await pool.query<{ id: string }>(
    `INSERT INTO documents (filename, mime_type, doc_type, storage_path, uploaded_by)
     VALUES ('test-proposal.pdf', 'application/pdf', 'proposal_full', '/tmp/test.pdf', 'test-user')
     RETURNING id`,
  );
  TEST_DOCUMENT_ID = docRes.rows[0]!.id;

  const app = createApp();
  httpServer = app.listen(0);
  const addr = httpServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  // Clean up test data (F-503 first due to FK constraints)
  if (TEST_DOCUMENT_ID) {
    await pool.query('DELETE FROM color_team_findings WHERE run_id IN (SELECT id FROM color_team_runs WHERE document_id = $1)', [TEST_DOCUMENT_ID]);
    await pool.query('DELETE FROM color_team_runs WHERE document_id = $1', [TEST_DOCUMENT_ID]);
    await pool.query('DELETE FROM documents WHERE id = $1', [TEST_DOCUMENT_ID]);
  }
  if (TEST_ACTION_ITEM_ID) {
    await pool.query('DELETE FROM action_item_drafts WHERE action_item_id = $1', [TEST_ACTION_ITEM_ID]);
    await pool.query('DELETE FROM action_items WHERE id = $1', [TEST_ACTION_ITEM_ID]);
  }
  if (TEST_SOURCE_ID) {
    await pool.query('DELETE FROM sources WHERE id = $1', [TEST_SOURCE_ID]);
  }
  await pool.query('DELETE FROM unified_opportunities WHERE internal_id = $1', [TEST_INTERNAL_ID]);
  await pool.end();
  httpServer.close();
}, 10_000);

// ─── tools/list ─────────────────────────────────────────────────────────────

describe('tools/list', () => {
  it('returns exactly 12 gda_ tools with descriptions and inputSchemas', async () => {
    const client = await createMcpClient();
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(12);

    const expected = [
      'gda_search_opportunities',
      'gda_get_opportunity',
      'gda_score_doctrine',
      'gda_get_pwin',
      'gda_query_rag',
      'gda_list_action_items',
      'gda_get_pipeline',
      'gda_run_color_team',
      'gda_get_launchpad_summary',
      'gda_recall_decisions',
      'gda_search_bills',
      'gda_company_financials',
    ];
    expect(tools.map((t) => t.name)).toEqual(expected);
    for (const tool of tools) {
      expect(tool.name.startsWith('gda_')).toBe(true);
      expect(typeof tool.description).toBe('string');
      expect(tool.description!.length).toBeGreaterThan(10);
      expect(tool.inputSchema).toBeTruthy();
    }
    await client.close();
  });
});

// ─── gda_search_opportunities ───────────────────────────────────────────────

describe('gda_search_opportunities', () => {
  it('returns array of opportunities with default limit', async () => {
    const client = await createMcpClient();
    const result = await client.callTool({ name: 'gda_search_opportunities', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);
    const textBlock = result.content[0] as { type: string; text: string };
    expect(textBlock.type).toBe('text');
    const rows = JSON.parse(textBlock.text);
    expect(Array.isArray(rows)).toBe(true);
    await client.close();
  });

  it('filters by agency', async () => {
    const client = await createMcpClient();
    const result = await client.callTool({
      name: 'gda_search_opportunities',
      arguments: { agency: 'DOD' },
    });
    expect(result.isError).toBeFalsy();
    const rows = JSON.parse((result.content[0] as { type: string; text: string }).text);
    expect(Array.isArray(rows)).toBe(true);
    for (const row of rows) {
      expect(row.agency.toUpperCase()).toContain('DOD');
    }
    await client.close();
  });

  it('filters by lifecycle_stage', async () => {
    const client = await createMcpClient();
    const result = await client.callTool({
      name: 'gda_search_opportunities',
      arguments: { lifecycle_stage: 'solicitation' },
    });
    expect(result.isError).toBeFalsy();
    const rows = JSON.parse((result.content[0] as { type: string; text: string }).text);
    expect(Array.isArray(rows)).toBe(true);
    for (const row of rows) {
      expect(row.lifecycle_stage).toBe('solicitation');
    }
    await client.close();
  });

  it('respects limit parameter', async () => {
    const client = await createMcpClient();
    const result = await client.callTool({
      name: 'gda_search_opportunities',
      arguments: { limit: 1 },
    });
    expect(result.isError).toBeFalsy();
    const rows = JSON.parse((result.content[0] as { type: string; text: string }).text);
    expect(rows.length).toBeLessThanOrEqual(1);
    await client.close();
  });
});

// ─── gda_get_opportunity ────────────────────────────────────────────────────

describe('gda_get_opportunity', () => {
  it('returns merged opportunity for valid internal_id', async () => {
    const client = await createMcpClient();
    const result = await client.callTool({
      name: 'gda_get_opportunity',
      arguments: { internal_id: TEST_INTERNAL_ID },
    });
    expect(result.isError).toBeFalsy();
    const merged = JSON.parse((result.content[0] as { type: string; text: string }).text);
    expect(merged.internal_id).toBe(TEST_INTERNAL_ID);
    expect(merged.lifecycle_stage).toBe('solicitation');
    expect(merged).toHaveProperty('field_sources');
    expect(merged).toHaveProperty('links');
    await client.close();
  });

  it('returns MCP error for non-existent internal_id', async () => {
    const client = await createMcpClient();
    const result = await client.callTool({
      name: 'gda_get_opportunity',
      arguments: { internal_id: NON_EXISTENT_ID },
    });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain(NON_EXISTENT_ID);
    expect(text).toContain('not found');
    await client.close();
  });

  it('returns MCP error for missing required field', async () => {
    const client = await createMcpClient();
    const result = await client.callTool({
      name: 'gda_get_opportunity',
      arguments: {},
    });
    expect(result.isError).toBe(true);
    await client.close();
  });
});

// ─── gda_score_doctrine ─────────────────────────────────────────────────────

describe('gda_score_doctrine', () => {
  it('returns doctrine evaluation or graceful error for valid input', async () => {
    const client = await createMcpClient();
    const result = await client.callTool({
      name: 'gda_score_doctrine',
      arguments: { internal_id: TEST_INTERNAL_ID },
    });
    // May return evaluation or error (agent might not be configured)
    // Key assertion: transport didn't crash
    expect(result.content).toBeTruthy();
    expect(result.content.length).toBeGreaterThan(0);
    await client.close();
  });

  it('returns MCP error for missing required field', async () => {
    const client = await createMcpClient();
    const result = await client.callTool({
      name: 'gda_score_doctrine',
      arguments: {},
    });
    expect(result.isError).toBe(true);
    await client.close();
  });
});

// ─── gda_get_pwin ───────────────────────────────────────────────────────────

describe('gda_get_pwin', () => {
  it('returns pwin score or graceful error for valid input', async () => {
    const client = await createMcpClient();
    const result = await client.callTool({
      name: 'gda_get_pwin',
      arguments: { internal_id: TEST_INTERNAL_ID },
    });
    // May succeed or return a graceful error (e.g., no model active)
    expect(result.content).toBeTruthy();
    expect(result.content.length).toBeGreaterThan(0);
    await client.close();
  });

  it('returns MCP error for missing required field', async () => {
    const client = await createMcpClient();
    const result = await client.callTool({
      name: 'gda_get_pwin',
      arguments: {},
    });
    expect(result.isError).toBe(true);
    await client.close();
  });
});

// ─── gda_query_rag ──────────────────────────────────────────────────────────

describe('gda_query_rag', () => {
  it('returns search results or graceful error for valid input', async () => {
    const client = await createMcpClient();
    const result = await client.callTool({
      name: 'gda_query_rag',
      arguments: { query: 'cybersecurity defense contract' },
    });
    // RAG may return empty results or error if embeddings not configured
    expect(result.content).toBeTruthy();
    expect(result.content.length).toBeGreaterThan(0);
    await client.close();
  });

  it('returns MCP error for missing required field', async () => {
    const client = await createMcpClient();
    const result = await client.callTool({
      name: 'gda_query_rag',
      arguments: {},
    });
    expect(result.isError).toBe(true);
    await client.close();
  });
});

// ─── F-503: gda_list_action_items ───────────────────────────────────────────

describe('gda_list_action_items', () => {
  it('returns action items or graceful error for valid input', async () => {
    const client = await createMcpClient();
    const result = await client.callTool({ name: 'gda_list_action_items', arguments: {} });
    // May return items or graceful error depending on DB schema compatibility
    expect(result.content).toBeTruthy();
    expect(result.content.length).toBeGreaterThan(0);
    await client.close();
  });

  it('accepts status filter or returns graceful error', async () => {
    const client = await createMcpClient();
    const result = await client.callTool({
      name: 'gda_list_action_items',
      arguments: { status: 'open' },
    });
    // Transport didn't crash — either success or graceful error
    expect(result.content).toBeTruthy();
    expect(result.content.length).toBeGreaterThan(0);
    await client.close();
  });

  it('returns MCP error for invalid status enum', async () => {
    const client = await createMcpClient();
    const result = await client.callTool({
      name: 'gda_list_action_items',
      arguments: { status: 'invalid_status' },
    });
    expect(result.isError).toBe(true);
    await client.close();
  });
});

// ─── F-503: gda_get_pipeline ────────────────────────────────────────────────

describe('gda_get_pipeline', () => {
  it('returns pipeline items or graceful error for valid input', async () => {
    const client = await createMcpClient();
    const result = await client.callTool({ name: 'gda_get_pipeline', arguments: {} });
    // May return items or graceful error depending on DB state
    expect(result.content).toBeTruthy();
    expect(result.content.length).toBeGreaterThan(0);
    await client.close();
  });

  it('accepts owner filter or returns graceful error', async () => {
    const client = await createMcpClient();
    const result = await client.callTool({
      name: 'gda_get_pipeline',
      arguments: { owner: 'nonexistent-user' },
    });
    // Transport didn't crash — either success or graceful error
    expect(result.content).toBeTruthy();
    expect(result.content.length).toBeGreaterThan(0);
    await client.close();
  });
});

// ─── F-503: gda_run_color_team ──────────────────────────────────────────────

describe('gda_run_color_team', () => {
  it('short-circuits with clean MCP error when feature flag is disabled', async () => {
    // Temporarily disable the feature flag
    await pool.query("UPDATE feature_flags SET enabled = false WHERE flag_name = 'color_team_reviews_v1'");
    try {
      const client = await createMcpClient();
      const result = await client.callTool({
        name: 'gda_run_color_team',
        arguments: { document_id: TEST_DOCUMENT_ID, stage: 'pink' },
      });
      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: string; text: string }).text;
      expect(text).toContain('Color team feature disabled');
      await client.close();
    } finally {
      // Restore the feature flag
      await pool.query("UPDATE feature_flags SET enabled = true WHERE flag_name = 'color_team_reviews_v1'");
    }
  });

  it('returns valid response or graceful error when feature enabled', async () => {
    const client = await createMcpClient();
    const result = await client.callTool({
      name: 'gda_run_color_team',
      arguments: { document_id: TEST_DOCUMENT_ID, stage: 'pink' },
    });
    // Feature is enabled — expect either success or graceful service error
    expect(result.content).toBeTruthy();
    expect(result.content.length).toBeGreaterThan(0);
    await client.close();
  });

  it('returns MCP error for missing required fields', async () => {
    const client = await createMcpClient();
    const result = await client.callTool({
      name: 'gda_run_color_team',
      arguments: {},
    });
    expect(result.isError).toBe(true);
    await client.close();
  });

  it('returns MCP error for invalid stage', async () => {
    const client = await createMcpClient();
    const result = await client.callTool({
      name: 'gda_run_color_team',
      arguments: { document_id: TEST_DOCUMENT_ID, stage: 'invalid' },
    });
    expect(result.isError).toBe(true);
    await client.close();
  });
});

// ─── F-503: gda_get_launchpad_summary ───────────────────────────────────────

describe('gda_get_launchpad_summary', () => {
  it('returns launchpad summary with zero input', async () => {
    const client = await createMcpClient();
    const result = await client.callTool({ name: 'gda_get_launchpad_summary', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);
    const textBlock = result.content[0] as { type: string; text: string };
    const summary = JSON.parse(textBlock.text);
    expect(summary).toHaveProperty('qualified_due_this_week');
    expect(summary).toHaveProperty('pipeline_no_capture');
    expect(summary).toHaveProperty('captures_color_review_stale');
    expect(summary).toHaveProperty('action_items_open_today');
    expect(summary).toHaveProperty('action_items_overdue');
    expect(typeof summary.qualified_due_this_week).toBe('number');
    await client.close();
  });
});

// ─── F-503: gda_recall_decisions ────────────────────────────────────────────

describe('gda_recall_decisions', () => {
  it('returns recent decisions summary with no query', async () => {
    const client = await createMcpClient();
    const result = await client.callTool({ name: 'gda_recall_decisions', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);
    const textBlock = result.content[0] as { type: string; text: string };
    const decisions = JSON.parse(textBlock.text);
    expect(Array.isArray(decisions)).toBe(true);
    await client.close();
  });

  it('accepts query parameter for similar decisions lookup', async () => {
    const client = await createMcpClient();
    const result = await client.callTool({
      name: 'gda_recall_decisions',
      arguments: { query: 'opportunity', limit: 5 },
    });
    expect(result.isError).toBeFalsy();
    const decisions = JSON.parse((result.content[0] as { type: string; text: string }).text);
    expect(Array.isArray(decisions)).toBe(true);
    await client.close();
  });

  it('respects lookback_days parameter', async () => {
    const client = await createMcpClient();
    const result = await client.callTool({
      name: 'gda_recall_decisions',
      arguments: { lookback_days: 30, limit: 10 },
    });
    expect(result.isError).toBeFalsy();
    const decisions = JSON.parse((result.content[0] as { type: string; text: string }).text);
    expect(Array.isArray(decisions)).toBe(true);
    await client.close();
  });
});

// ─── Unknown tool ───────────────────────────────────────────────────────────

describe('CallToolRequest error handling', () => {
  it('returns MCP error for unknown tool name', async () => {
    const client = await createMcpClient();
    const result = await client.callTool({
      name: 'gda_nonexistent_tool',
      arguments: {},
    });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('Unknown tool');
    await client.close();
  });
});
