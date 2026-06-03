import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for GovTribe MCP typed wrappers (mcp_tools.ts).
 * Verifies that each wrapper calls the correct MCP tool with correct args.
 */

const mockMcpCallTool = vi.fn();

vi.mock('../../src/ingest/govtribe/mcp_client.js', () => ({
  mcpCallTool: (...args: unknown[]) => mockMcpCallTool(...args),
}));

import {
  searchOpportunities,
  searchAwards,
  searchForecasts,
  searchContacts,
  searchVehicles,
  searchIdvs,
  searchVendors,
  callToolGeneric,
} from '../../src/ingest/govtribe/mcp_tools.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockMcpCallTool.mockResolvedValue({
    data: { data: [] },
    decision: 'called',
    from_cache: false,
    credits_used: 1,
    budget_status: { month: '2026-06', credits_used: 10, credits_budget: 1200, pct: 1, last_call_at: null },
  });
});

describe('MCP Tool Wrappers', () => {
  it('searchOpportunities calls Search_Federal_Contract_Opportunities', async () => {
    await searchOpportunities(
      { query: 'SETA', naicsCodes: ['541511'], perPage: 50 },
      'test-opps',
    );

    expect(mockMcpCallTool).toHaveBeenCalledWith(
      'Search_Federal_Contract_Opportunities',
      expect.objectContaining({
        query: 'SETA',
        per_page: 50,
        naics_category_ids: ['541511'],
      }),
      'test-opps',
    );
  });

  it('searchAwards calls Search_Federal_Contract_Awards', async () => {
    await searchAwards(
      { query: 'cybersecurity', naicsCodes: ['541512'] },
      'test-awards',
    );

    expect(mockMcpCallTool).toHaveBeenCalledWith(
      'Search_Federal_Contract_Awards',
      expect.objectContaining({ query: 'cybersecurity' }),
      'test-awards',
    );
  });

  it('searchForecasts calls Search_Federal_Forecasts', async () => {
    await searchForecasts(
      { query: 'AI/ML' },
      'test-forecasts',
    );

    expect(mockMcpCallTool).toHaveBeenCalledWith(
      'Search_Federal_Forecasts',
      expect.objectContaining({ query: 'AI/ML' }),
      'test-forecasts',
    );
  });

  it('searchContacts calls Search_Contacts', async () => {
    await searchContacts(
      { query: 'Department of Defense', perPage: 10 },
      'test-contacts',
    );

    expect(mockMcpCallTool).toHaveBeenCalledWith(
      'Search_Contacts',
      expect.objectContaining({ query: 'Department of Defense', per_page: 10 }),
      'test-contacts',
    );
  });

  it('searchVehicles calls Search_Federal_Contract_Vehicles', async () => {
    await searchVehicles(
      { query: '' },
      'test-vehicles',
    );

    expect(mockMcpCallTool).toHaveBeenCalledWith(
      'Search_Federal_Contract_Vehicles',
      expect.objectContaining({ query: '' }),
      'test-vehicles',
    );
  });

  it('searchIdvs calls Search_Federal_Contract_IDVs', async () => {
    await searchIdvs(
      { query: 'OASIS' },
      'test-idvs',
    );

    expect(mockMcpCallTool).toHaveBeenCalledWith(
      'Search_Federal_Contract_IDVs',
      expect.objectContaining({ query: 'OASIS' }),
      'test-idvs',
    );
  });

  it('searchVendors calls Search_Vendors', async () => {
    await searchVendors(
      { query: 'Envision' },
      'test-vendors',
    );

    expect(mockMcpCallTool).toHaveBeenCalledWith(
      'Search_Vendors',
      expect.objectContaining({ query: 'Envision' }),
      'test-vendors',
    );
  });

  it('callToolGeneric passes through tool name and args', async () => {
    await callToolGeneric(
      'Search_GovTribe',
      { query: 'defense logistics', max_num_results: 5 },
      'test-generic',
      true,
    );

    expect(mockMcpCallTool).toHaveBeenCalledWith(
      'Search_GovTribe',
      { query: 'defense logistics', max_num_results: 5 },
      'test-generic',
      true,
    );
  });
});
