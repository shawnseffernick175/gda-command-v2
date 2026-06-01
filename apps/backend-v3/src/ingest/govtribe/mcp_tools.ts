/**
 * Typed wrapper functions for the GovTribe MCP tools used by GDA Command.
 *
 * Each wrapper maps a GDA-specific query shape to the discovered MCP tool
 * name and parameter schema (from tools.generated.json).
 */

import { mcpCallTool } from './mcp_client.js';
import type { McpToolCallResult } from './mcp_client.js';

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
    mcpArgs['naics_category_codes'] = args.naicsCodes;
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
    mcpArgs['naics_category_codes'] = args.naicsCodes;
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
    mcpArgs['naics_category_codes'] = args.naicsCodes;
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

/* ── Generic tool call (for agent-v3 govtribe_search tool) ─────────── */

export async function callToolGeneric(
  toolName: string,
  args: Record<string, unknown>,
  cacheId: string,
  critical = false,
): Promise<McpToolCallResult> {
  return mcpCallTool(toolName, args, cacheId, critical);
}
