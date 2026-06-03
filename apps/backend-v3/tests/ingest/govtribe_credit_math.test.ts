import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * F-331: Unit tests for per-10-results credit accounting.
 * Verifies getToolCreditCost computes ceil(rows/10) × per-10 rate.
 */

/* ── Mocks (required before importing mcp_client) ──────────────── */

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

beforeEach(() => {
  vi.clearAllMocks();
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
});

/* ── Import after mocks ────────────────────────────────────────── */

import { getToolCreditCost } from '../../src/ingest/govtribe/mcp_client.js';

describe('getToolCreditCost (F-331 per-10-results billing)', () => {
  it('returns 0 for Documentation tool', () => {
    expect(getToolCreditCost('Documentation', 50)).toBe(0);
    expect(getToolCreditCost('Documentation', 0)).toBe(0);
  });

  it('charges 3 credits for 1-10 opp results', () => {
    expect(getToolCreditCost('Search_Federal_Contract_Opportunities', 1)).toBe(3);
    expect(getToolCreditCost('Search_Federal_Contract_Opportunities', 10)).toBe(3);
  });

  it('charges 6 credits for 11-20 opp results', () => {
    expect(getToolCreditCost('Search_Federal_Contract_Opportunities', 11)).toBe(6);
    expect(getToolCreditCost('Search_Federal_Contract_Opportunities', 20)).toBe(6);
  });

  it('charges 15 credits for 50 opp results (perPage=50)', () => {
    expect(getToolCreditCost('Search_Federal_Contract_Opportunities', 50)).toBe(15);
  });

  it('charges 30 credits for 100 opp results', () => {
    expect(getToolCreditCost('Search_Federal_Contract_Opportunities', 100)).toBe(30);
  });

  it('charges 4 credits per 10 for awards', () => {
    expect(getToolCreditCost('Search_Federal_Contract_Awards', 10)).toBe(4);
    expect(getToolCreditCost('Search_Federal_Contract_Awards', 50)).toBe(20);
  });

  it('charges 3 credits per 10 for forecasts', () => {
    expect(getToolCreditCost('Search_Federal_Forecasts', 10)).toBe(3);
    expect(getToolCreditCost('Search_Federal_Forecasts', 50)).toBe(15);
  });

  it('defaults to 1 credit per 10 for unknown tools', () => {
    expect(getToolCreditCost('Unknown_Tool', 10)).toBe(1);
    expect(getToolCreditCost('Unknown_Tool', 50)).toBe(5);
  });

  it('minimum 1 page for resultCount=0 (treats as 1)', () => {
    expect(getToolCreditCost('Search_Federal_Contract_Opportunities', 0)).toBe(3);
  });

  it('defaults to 10 results if no count provided', () => {
    expect(getToolCreditCost('Search_Federal_Contract_Opportunities')).toBe(3);
  });
});
