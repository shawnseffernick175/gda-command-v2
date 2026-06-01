import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the GovTribe MCP client — mocked MCP responses.
 * Verifies credit-budget enforcement, tool call structure, dry-run mode,
 * and error handling without making live MCP connections.
 */

/* ── Mocks ─────────────────────────────────────────────────────────── */

const mockConnect = vi.fn();
const mockClose = vi.fn();
const mockListTools = vi.fn();
const mockCallTool = vi.fn();

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    close: mockClose,
    listTools: mockListTools,
    callTool: mockCallTool,
  })),
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation(() => ({
    onclose: null,
    onerror: null,
  })),
}));

const mockPoolQuery = vi.fn();
vi.mock('../../src/lib/db.js', () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
}));

vi.mock('../../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

/* ── Setup ─────────────────────────────────────────────────────────── */

beforeEach(() => {
  vi.clearAllMocks();

  // Default: budget at 0% with room to call
  mockPoolQuery.mockImplementation((sql: string) => {
    if (typeof sql === 'string' && sql.includes('govtribe_credit_monthly')) {
      if (sql.includes('INSERT')) {
        return { rows: [{ month: '2026-06', credits_used: 0, credits_budget: 1200, pct: 0, last_call_at: null }] };
      }
      if (sql.includes('SELECT')) {
        return { rows: [{ month: '2026-06', credits_used: 0, credits_budget: 1200, pct: 0, last_call_at: null }] };
      }
      if (sql.includes('UPDATE')) {
        return { rows: [], rowCount: 1 };
      }
    }
    if (typeof sql === 'string' && sql.includes('govtribe_credit_ledger')) {
      return { rows: [], rowCount: 1 };
    }
    if (typeof sql === 'string' && sql.includes('govtribe_cache')) {
      if (sql.includes('SELECT')) {
        return { rows: [] };
      }
      return { rows: [], rowCount: 1 };
    }
    if (typeof sql === 'string' && sql.includes('DELETE')) {
      return { rows: [], rowCount: 0 };
    }
    return { rows: [] };
  });

  // Default MCP responses
  mockConnect.mockResolvedValue(undefined);
  mockClose.mockResolvedValue(undefined);
});

/* ── Import after mocks ────────────────────────────────────────────── */

import {
  listTools,
  mcpCallTool,
  checkGovTribeMcpReachable,
  purgeExpiredCache,
  resetCycleCredits,
} from '../../src/ingest/govtribe/mcp_client.js';

/* ── Tests ─────────────────────────────────────────────────────────── */

describe('GovTribe MCP Client', () => {
  describe('listTools (dry-run mode)', () => {
    it('should return discovered tools from tools/list', async () => {
      mockListTools.mockResolvedValue({
        tools: [
          { name: 'Search_Federal_Contract_Opportunities', description: 'Searches opps' },
          { name: 'Search_Federal_Contract_Awards', description: 'Searches awards' },
          { name: 'Search_Federal_Forecasts', description: 'Searches forecasts' },
          { name: 'Search_Contacts', description: 'Searches contacts' },
          { name: 'Search_Federal_Contract_Vehicles', description: 'Searches vehicles' },
          { name: 'Documentation', description: 'Search docs' },
        ],
      });

      const tools = await listTools();
      expect(tools.length).toBe(6);
      expect(tools[0].name).toBe('Search_Federal_Contract_Opportunities');
      expect(mockCallTool).not.toHaveBeenCalled();
    });

    it('dry-run lists ≥5 tools without burning credits', async () => {
      mockListTools.mockResolvedValue({
        tools: Array.from({ length: 10 }, (_, i) => ({
          name: `Tool_${i}`,
          description: `Tool ${i} description`,
        })),
      });

      const tools = await listTools();
      expect(tools.length).toBeGreaterThanOrEqual(5);

      // No ledger inserts should have been called
      const ledgerCalls = mockPoolQuery.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('govtribe_credit_ledger'),
      );
      expect(ledgerCalls.length).toBe(0);
    });
  });

  describe('mcpCallTool', () => {
    it('should call tool and return parsed data on success', async () => {
      resetCycleCredits();
      mockCallTool.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ data: [{ id: 'opp-1', title: 'Test Opp' }] }) }],
        isError: false,
      });

      const result = await mcpCallTool(
        'Search_Federal_Contract_Opportunities',
        { query: 'test', per_page: 10 },
        'test-cache-001',
      );

      expect(result.decision).toBe('called');
      expect(result.data).toEqual({ data: [{ id: 'opp-1', title: 'Test Opp' }] });
      expect(result.credits_used).toBe(3);
      expect(result.from_cache).toBe(false);
    });

    it('should log ledger row for every call', async () => {
      resetCycleCredits();
      mockCallTool.mockResolvedValue({
        content: [{ type: 'text', text: '{"data":[]}' }],
        isError: false,
      });

      await mcpCallTool('Search_Federal_Contract_Awards', { query: 'test' }, 'test-001');

      const ledgerInserts = mockPoolQuery.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('INSERT INTO govtribe_credit_ledger'),
      );
      expect(ledgerInserts.length).toBe(1);
      expect(ledgerInserts[0][1]).toContain('called');
    });

    it('should skip with skipped_halted when budget ≥ 95%', async () => {
      resetCycleCredits();
      mockPoolQuery.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('govtribe_credit_monthly') && sql.includes('INSERT')) {
          return { rows: [{ month: '2026-06', credits_used: 1140, credits_budget: 1200, pct: 95, last_call_at: null }] };
        }
        if (typeof sql === 'string' && sql.includes('govtribe_credit_ledger')) {
          return { rows: [], rowCount: 1 };
        }
        if (typeof sql === 'string' && sql.includes('govtribe_cache') && sql.includes('SELECT')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      const result = await mcpCallTool(
        'Search_Federal_Contract_Opportunities',
        { query: 'test' },
        'test-002',
      );

      expect(result.decision).toBe('skipped_halted');
      expect(result.credits_used).toBe(0);
      expect(mockCallTool).not.toHaveBeenCalled();
    });

    it('should skip with skipped_low_budget when budget ≥ 80%', async () => {
      resetCycleCredits();
      mockPoolQuery.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('govtribe_credit_monthly') && sql.includes('INSERT')) {
          return { rows: [{ month: '2026-06', credits_used: 960, credits_budget: 1200, pct: 80, last_call_at: null }] };
        }
        if (typeof sql === 'string' && sql.includes('govtribe_credit_ledger')) {
          return { rows: [], rowCount: 1 };
        }
        if (typeof sql === 'string' && sql.includes('govtribe_cache') && sql.includes('SELECT')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      const result = await mcpCallTool(
        'Search_Federal_Contract_Opportunities',
        { query: 'test' },
        'test-003',
      );

      expect(result.decision).toBe('skipped_low_budget');
      expect(result.credits_used).toBe(0);
    });

    it('should handle MCP tool error gracefully', async () => {
      resetCycleCredits();
      mockCallTool.mockResolvedValue({
        content: [{ type: 'text', text: 'Something went wrong' }],
        isError: true,
      });

      const result = await mcpCallTool(
        'Search_Federal_Contract_Opportunities',
        { query: 'test' },
        'test-004',
      );

      // After retries exhausted, should fall back to cached
      expect(result.decision).toBe('cached');
      expect(result.credits_used).toBe(0);
    });
  });

  describe('checkGovTribeMcpReachable', () => {
    it('should return reachable when tools/list succeeds', async () => {
      mockListTools.mockResolvedValue({
        tools: [
          { name: 'Search_Federal_Contract_Opportunities', description: 'Searches opps' },
        ],
      });

      const result = await checkGovTribeMcpReachable();
      expect(result.reachable).toBe(true);
      expect(result.toolCount).toBe(1);
    });

    it('should return not reachable when tools/list fails', async () => {
      mockListTools.mockRejectedValue(new Error('Connection refused'));

      const result = await checkGovTribeMcpReachable();
      expect(result.reachable).toBe(false);
      expect(result.error).toContain('Connection refused');
    });
  });

  describe('purgeExpiredCache', () => {
    it('should delete expired cache entries', async () => {
      mockPoolQuery.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('DELETE FROM govtribe_cache')) {
          return { rowCount: 5 };
        }
        return { rows: [] };
      });

      const deleted = await purgeExpiredCache();
      expect(deleted).toBe(5);
    });
  });
});
