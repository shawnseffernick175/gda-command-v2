/**
 * Typed wrapper functions for the GovTribe MCP tools.
 *
 * Each wrapper maps a GDA-specific query shape to the discovered MCP tool
 * name and parameter schema (from tools.generated.json).
 */

import { mcpCallTool } from './mcp_client.js';
import type { McpToolCallResult } from './mcp_client.js';
import type { GovTribeDetailRecord, GovTribeAwardDetail, GovTribeForecastDetail } from './types.js';

/** All fields we request when fetching opportunity detail by ID. */
const DETAIL_FIELDS: string[] = [
  'govtribe_id',
  'govtribe_url',
  'source_url',
  'solicitation_number',
  'name',
  'opportunity_type',
  'opportunity_state',
  'set_aside_type',
  'posted_date',
  'due_date',
  'award_date',
  'descriptions',
  'federal_agency',
  'naics_category',
  'psc_category',
  'place_of_performance',
  'points_of_contact',
  'govtribe_ai_summary',
];

/* ── Opportunities search ──────────────────────────────────────────── */

export interface SearchOpportunitiesArgs {
  query: string;
  naicsCodes?: string[];
  perPage?: number;
  page?: number;
  setAsideCodes?: string[];
}

export async function searchOpportunities(
  args: SearchOpportunitiesArgs,
  cacheId: string,
): Promise<McpToolCallResult> {
  const mcpArgs: Record<string, unknown> = {
    query: args.query,
    per_page: args.perPage ?? 50,
    page: args.page ?? 1,
  };
  if (args.naicsCodes?.length) {
    mcpArgs['naics_category_ids'] = args.naicsCodes;
  }
  if (args.setAsideCodes?.length) {
    mcpArgs['set_aside_codes'] = args.setAsideCodes;
  }

  return mcpCallTool(
    'Search_Federal_Contract_Opportunities',
    mcpArgs,
    cacheId,
  );
}

/* ── Awards search ─────────────────────────────────────────────────── */

export interface SearchAwardsArgs {
  query: string;
  naicsCodes?: string[];
  perPage?: number;
  page?: number;
}

export async function searchAwards(
  args: SearchAwardsArgs,
  cacheId: string,
): Promise<McpToolCallResult> {
  const mcpArgs: Record<string, unknown> = {
    query: args.query,
    per_page: args.perPage ?? 50,
    page: args.page ?? 1,
  };
  if (args.naicsCodes?.length) {
    mcpArgs['naics_category_ids'] = args.naicsCodes;
  }

  return mcpCallTool(
    'Search_Federal_Contract_Awards',
    mcpArgs,
    cacheId,
  );
}

/* ── Forecasts search ──────────────────────────────────────────────── */

export interface SearchForecastsArgs {
  query: string;
  naicsCodes?: string[];
  perPage?: number;
  page?: number;
}

export async function searchForecasts(
  args: SearchForecastsArgs,
  cacheId: string,
): Promise<McpToolCallResult> {
  const mcpArgs: Record<string, unknown> = {
    query: args.query,
    per_page: args.perPage ?? 50,
    page: args.page ?? 1,
  };
  if (args.naicsCodes?.length) {
    mcpArgs['naics_category_ids'] = args.naicsCodes;
  }

  return mcpCallTool(
    'Search_Federal_Forecasts',
    mcpArgs,
    cacheId,
  );
}

/* ── Contacts search ───────────────────────────────────────────────── */

export interface SearchContactsArgs {
  query: string;
  perPage?: number;
  page?: number;
}

export async function searchContacts(
  args: SearchContactsArgs,
  cacheId: string,
): Promise<McpToolCallResult> {
  return mcpCallTool(
    'Search_Contacts',
    {
      query: args.query,
      per_page: args.perPage ?? 10,
      page: args.page ?? 1,
    },
    cacheId,
  );
}

/* ── Vehicles search ───────────────────────────────────────────────── */

export interface SearchVehiclesArgs {
  query: string;
  perPage?: number;
  page?: number;
}

export async function searchVehicles(
  args: SearchVehiclesArgs,
  cacheId: string,
): Promise<McpToolCallResult> {
  return mcpCallTool(
    'Search_Federal_Contract_Vehicles',
    {
      query: args.query,
      per_page: args.perPage ?? 50,
      page: args.page ?? 1,
    },
    cacheId,
  );
}

/* ── IDVs search ───────────────────────────────────────────────────── */

export interface SearchIdvsArgs {
  query: string;
  perPage?: number;
  page?: number;
}

export async function searchIdvs(
  args: SearchIdvsArgs,
  cacheId: string,
): Promise<McpToolCallResult> {
  return mcpCallTool(
    'Search_Federal_Contract_IDVs',
    {
      query: args.query,
      per_page: args.perPage ?? 50,
      page: args.page ?? 1,
    },
    cacheId,
  );
}

/* ── Vendors search ────────────────────────────────────────────────── */

export interface SearchVendorsArgs {
  query: string;
  perPage?: number;
  page?: number;
}

export async function searchVendors(
  args: SearchVendorsArgs,
  cacheId: string,
): Promise<McpToolCallResult> {
  return mcpCallTool(
    'Search_Vendors',
    {
      query: args.query,
      per_page: args.perPage ?? 50,
      page: args.page ?? 1,
    },
    cacheId,
  );
}

/* ── Opportunity detail fetch by IDs ────────────────────────────────── */

/**
 * Fetch full detail for a batch of opportunity IDs via the same
 * Search_Federal_Contract_Opportunities tool with federal_contract_opportunity_ids
 * filter + fields_to_return. Marks calls as `critical` so they proceed
 * even at >80% budget (these are detail fills for IDs we already paid to discover).
 */
export async function fetchOpportunityDetailBatch(
  govtribeIds: string[],
  cacheId: string,
): Promise<McpToolCallResult<{ results?: GovTribeDetailRecord[] }>> {
  return mcpCallTool<{ results?: GovTribeDetailRecord[] }>(
    'Search_Federal_Contract_Opportunities',
    {
      federal_contract_opportunity_ids: govtribeIds,
      fields_to_return: DETAIL_FIELDS,
      per_page: govtribeIds.length,
      page: 1,
    },
    cacheId,
    true, // critical — detail fill for already-discovered IDs
  );
}

/* ── Award detail fetch by IDs ──────────────────────────────────────── */

const AWARD_DETAIL_FIELDS: string[] = [
  'govtribe_id',
  'govtribe_url',
  'name',
  'contract_number',
  'award_date',
  'completion_date',
  'ultimate_completion_date',
  'ceiling_value',
  'dollars_obligated',
  'contract_type',
  'set_aside_type',
  'extent_competed',
  'descriptions',
  'awardee',
  'parent_of_awardee',
  'contracting_federal_agency',
  'funding_federal_agency',
  'naics_category',
  'psc_category',
  'place_of_performance',
  'originating_federal_contract_opportunity',
  'federal_contract_vehicle',
  'govtribe_ai_summary',
];

export async function fetchAwardDetailBatch(
  govtribeIds: string[],
  cacheId: string,
): Promise<McpToolCallResult<{ results?: GovTribeAwardDetail[] }>> {
  return mcpCallTool<{ results?: GovTribeAwardDetail[] }>(
    'Search_Federal_Contract_Awards',
    {
      federal_contract_award_ids: govtribeIds,
      fields_to_return: AWARD_DETAIL_FIELDS,
      per_page: govtribeIds.length,
      page: 1,
    },
    cacheId,
    true,
  );
}

/* ── Forecast detail fetch by IDs ───────────────────────────────────── */

const FORECAST_DETAIL_FIELDS: string[] = [
  'govtribe_id',
  'govtribe_url',
  'source_url',
  'name',
  'forecast_type',
  'set_aside',
  'estimated_solicitation_release_date',
  'estimated_award_start_date',
  'estimated_award_value',
  'descriptions',
  'federal_agency',
  'place_of_performance',
  'points_of_contact',
  'govtribe_ai_summary',
];

export async function fetchForecastDetailBatch(
  govtribeIds: string[],
  cacheId: string,
): Promise<McpToolCallResult<{ results?: GovTribeForecastDetail[] }>> {
  return mcpCallTool<{ results?: GovTribeForecastDetail[] }>(
    'Search_Federal_Forecasts',
    {
      federal_forecast_ids: govtribeIds,
      fields_to_return: FORECAST_DETAIL_FIELDS,
      per_page: govtribeIds.length,
      page: 1,
    },
    cacheId,
    true,
  );
}

/* ── Generic tool call (for agent-v3 govtribe_search tool) ─────────── */

export async function callToolGeneric(
  toolName: string,
  args: Record<string, unknown>,
  cacheId: string,
  critical = false,
): Promise<McpToolCallResult> {
  return mcpCallTool(toolName, args, cacheId, critical);
}
