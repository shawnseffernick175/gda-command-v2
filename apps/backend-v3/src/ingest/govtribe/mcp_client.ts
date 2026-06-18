/**
 * GovTribe MCP client — Streamable HTTP transport, credit-budget-aware.
 *
 * Replaces the deprecated REST client (api.govtribe.com).
 * Auth: Authorization: Bearer ${GOVTRIBE_API_KEY} (JWT, scope mcp:use).
 * Endpoint: https://govtribe.com/mcp (Streamable HTTP / MCP protocol).
 *
 * Every tool call:
 * 1. Pre-checks monthly + cycle credit budget
 * 2. Calls the MCP tool (or returns cached data if budget exceeded)
 * 3. Logs to govtribe_credit_ledger
 * 4. Caches raw response in govtribe_cache
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';

const MCP_ENDPOINT = process.env['GOVTRIBE_MCP_URL'] || 'https://govtribe.com/mcp';
const API_KEY = process.env['GOVTRIBE_API_KEY'] ?? '';
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1_000;

/** Per-cycle credit cap — stops mid-cycle if exceeded. Default 150. */
const CYCLE_CREDIT_CAP = parseInt(process.env['GOVTRIBE_CYCLE_CREDIT_CAP'] ?? '150', 10);

/** Monthly credit budget for new months. 1200 = Shawn's personal plan ($1.2k/yr). */
const MONTHLY_CREDIT_BUDGET = parseInt(process.env['GOVTRIBE_MONTHLY_CREDIT_CAP'] ?? '1200', 10);

/**
 * Per-10-results credit rate from docs/canonical/govtribe_credit_table_v1.md.
 * GovTribe bills per 10 results returned, NOT per call.
 * Actual cost = ceil(resultCount / 10) × rate. Any tool not listed defaults to 1.
 */
const TOOL_CREDIT_PER_10: Record<string, number> = {
  'Search_Federal_Contract_Opportunities': 3,
  'Search_Federal_Contract_Awards': 4,
  'Search_Federal_Forecasts': 3,
  'Search_Federal_Contract_IDVs': 3,
  'Search_Federal_Contract_Vehicles': 3,
  'Search_Federal_Contract_Vehicle_Opportunities': 3,
  'Search_FCV_Subcategories': 3,
  'Search_Contacts': 4,
  'Search_Federal_Agencies': 1,
  'Search_Vendors': 4,
  'Search_GovTribe': 4,
  'Search_Pipelines': 1,
  'Search_Pursuits': 1,
  'Search_Saved_Searches': 2,
  'Documentation': 0,
};

export type BudgetDecision = 'called' | 'skipped_low_budget' | 'skipped_halted' | 'skipped_cycle_cap' | 'cached';

export interface CreditBudgetStatus {
  month: string;
  credits_used: number;
  credits_budget: number;
  pct: number;
  last_call_at: string | null;
}

export interface DailyBudgetStatus {
  remainingCredits: number;
  daysRemaining: number;
  dailyAllowance: number;
  todaySpent: number;
  todayAvailable: number;
}

export interface McpToolCallResult<T = unknown> {
  data: T | null;
  decision: BudgetDecision;
  from_cache: boolean;
  credits_used: number;
  budget_status: CreditBudgetStatus;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/* ── Credit budget helpers ─────────────────────────────────────────── */

export async function getCreditBudgetStatus(): Promise<CreditBudgetStatus> {
  const month = currentMonth();
  const { rows } = await pool.query(
    `INSERT INTO govtribe_credit_monthly (month, credits_used, credits_budget)
     VALUES ($1, 0, $2)
     ON CONFLICT (month) DO NOTHING
     RETURNING month, credits_used, credits_budget, last_call_at::text`,
    [month, MONTHLY_CREDIT_BUDGET],
  );

  if (rows.length > 0) {
    const row = rows[0];
    return {
      month: row.month,
      credits_used: row.credits_used,
      credits_budget: row.credits_budget,
      pct: row.credits_budget > 0 ? Math.round((row.credits_used / row.credits_budget) * 100) : 0,
      last_call_at: row.last_call_at,
    };
  }

  const { rows: existing } = await pool.query(
    `SELECT month, credits_used, credits_budget, last_call_at::text
     FROM govtribe_credit_monthly WHERE month = $1`,
    [month],
  );

  if (existing.length > 0) {
    const row = existing[0];
    return {
      month: row.month,
      credits_used: row.credits_used,
      credits_budget: row.credits_budget,
      pct: row.credits_budget > 0 ? Math.round((row.credits_used / row.credits_budget) * 100) : 0,
      last_call_at: row.last_call_at,
    };
  }

  return { month, credits_used: 0, credits_budget: MONTHLY_CREDIT_BUDGET, pct: 0, last_call_at: null };
}

/** Cycle-level credit tracking for the current poll cycle. */
let cycleCreditsUsed = 0;

export function resetCycleCredits(): void {
  cycleCreditsUsed = 0;
}

export function getCycleCreditsUsed(): number {
  return cycleCreditsUsed;
}

export function getCycleCreditCap(): number {
  return CYCLE_CREDIT_CAP;
}

export function isCycleCapExceeded(): boolean {
  return cycleCreditsUsed >= CYCLE_CREDIT_CAP;
}

/* ── Daily-pace budget helpers ──────────────────────────────────────── */

/**
 * Pure computation of daily budget pacing. Exported for unit testing.
 * All date math uses UTC.
 */
export function computeDailyBudget(
  budget: number,
  creditsUsed: number,
  todaySpent: number,
  now: Date = new Date(),
): DailyBudgetStatus {
  const remainingCredits = budget - creditsUsed;
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const daysRemaining = daysInMonth - dayOfMonth + 1;
  const dailyAllowance = daysRemaining > 0 ? Math.max(0, Math.floor(remainingCredits / daysRemaining)) : 0;
  const todayAvailable = Math.max(0, dailyAllowance - todaySpent);

  return { remainingCredits, daysRemaining, dailyAllowance, todaySpent, todayAvailable };
}

export async function getDailyBudgetStatus(budgetStatus: CreditBudgetStatus): Promise<DailyBudgetStatus> {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(cost_credits), 0) AS spent_today
     FROM govtribe_credit_ledger
     WHERE created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
       AND decision = 'called'`,
  );
  const todaySpent = Number(rows[0].spent_today);
  return computeDailyBudget(budgetStatus.credits_budget, budgetStatus.credits_used, todaySpent);
}

/* ── Ledger + cache ────────────────────────────────────────────────── */

async function logCreditUsage(
  toolName: string,
  costCredits: number,
  decision: BudgetDecision,
  responseStatus?: number,
  errorText?: string,
  caller?: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO govtribe_credit_ledger
       (endpoint, cost_credits, decision, response_status, error_text, caller)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [toolName, costCredits, decision, responseStatus ?? null, errorText ?? null, caller ?? null],
  );

  if (decision === 'called') {
    const month = currentMonth();
    await pool.query(
      `UPDATE govtribe_credit_monthly
       SET credits_used = credits_used + $1,
           last_call_at = NOW(),
           updated_at = NOW()
       WHERE month = $2`,
      [costCredits, month],
    );
  }
}

async function getCachedResponse(toolName: string, cacheId: string): Promise<unknown | null> {
  const { rows } = await pool.query(
    `SELECT response_body FROM govtribe_cache
     WHERE endpoint = $1 AND entity_id = $2
       AND expires_at > NOW()
     LIMIT 1`,
    [toolName, cacheId],
  );
  return rows.length > 0 ? rows[0].response_body : null;
}

async function setCachedResponse(
  toolName: string,
  cacheId: string,
  body: unknown,
): Promise<void> {
  await pool.query(
    `INSERT INTO govtribe_cache (endpoint, entity_id, response_body, fetched_at, expires_at)
     VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '30 days')
     ON CONFLICT (endpoint, entity_id) DO UPDATE SET
       response_body = EXCLUDED.response_body,
       fetched_at = NOW(),
       expires_at = NOW() + INTERVAL '30 days',
       last_error = NULL`,
    [toolName, cacheId, JSON.stringify(body)],
  );
}

/* ── MCP connection management ─────────────────────────────────────── */

let mcpClient: Client | null = null;
let mcpTransport: StreamableHTTPClientTransport | null = null;

async function getOrCreateClient(): Promise<Client> {
  if (mcpClient) return mcpClient;

  const transport = new StreamableHTTPClientTransport(new URL(MCP_ENDPOINT), {
    requestInit: {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
      },
    },
  });

  const client = new Client({ name: 'gda-govtribe', version: '1.0.0' });

  transport.onclose = () => {
    mcpClient = null;
    mcpTransport = null;
    logger.info({ source: 'govtribe' }, 'govtribe_mcp_connection_closed');
  };

  transport.onerror = (err) => {
    logger.error({ source: 'govtribe', error: err.message }, 'govtribe_mcp_transport_error');
  };

  await client.connect(transport);
  mcpClient = client;
  mcpTransport = transport;
  return client;
}

export async function closeMcpClient(): Promise<void> {
  if (mcpClient) {
    await mcpClient.close();
    mcpClient = null;
    mcpTransport = null;
  }
}

/* ── Discovery (tools/list) ────────────────────────────────────────── */

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * List all available MCP tools. No credits burned.
 * This is the "dry-run" mode — only calls tools/list.
 */
export async function listTools(): Promise<McpToolInfo[]> {
  if (!API_KEY) {
    logger.warn({ source: 'govtribe' }, 'govtribe_mcp_no_api_key');
    return [];
  }

  const client = await getOrCreateClient();
  const { tools } = await client.listTools();
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema as Record<string, unknown> | undefined,
  }));
}

/* ── Tool invocation with credit budget ────────────────────────────── */

/**
 * Compute actual credit cost based on returned result count.
 * GovTribe charges per 10 results: ceil(resultCount / 10) × per-10 rate.
 * Minimum 1 credit for any successful call (except Documentation = 0).
 */
export function getToolCreditCost(toolName: string, resultCount = 10): number {
  const per10Rate = TOOL_CREDIT_PER_10[toolName] ?? 1;
  if (per10Rate === 0) return 0;
  const pages = Math.ceil(Math.max(resultCount, 1) / 10);
  return pages * per10Rate;
}

/**
 * Count result rows in an MCP response for accurate credit accounting.
 * Handles { results: [...] }, { data: [...] }, { rows: [...] }, or bare arrays.
 */
function countResultRows(data: unknown): number {
  if (!data) return 0;
  if (Array.isArray(data)) return data.length;
  const obj = data as Record<string, unknown>;
  for (const key of ['results', 'data', 'rows']) {
    if (Array.isArray(obj[key])) return (obj[key] as unknown[]).length;
  }
  return 1;
}

/**
 * Credit-aware MCP tool call.
 *
 * @param toolName - MCP tool name (e.g. 'Search_Federal_Contract_Opportunities')
 * @param args - Tool arguments (JSON-serializable object)
 * @param cacheId - Cache key entity_id (e.g. 'saved_search_gda-opps-core')
 * @param critical - If true, allowed even at >95% budget (on-demand detail)
 * @param caller - Identifies the calling service for credit attribution (e.g. 'agent-v3')
 */
export async function mcpCallTool<T = unknown>(
  toolName: string,
  args: Record<string, unknown>,
  cacheId: string,
  critical = false,
  caller?: string,
): Promise<McpToolCallResult<T>> {
  const budgetStatus = await getCreditBudgetStatus();
  // Pre-estimate cost using per_page arg (or 10 default) for budget checks;
  // actual cost is recalculated after response using real row count.
  const estimatedRows = (args['per_page'] as number | undefined) ?? 10;
  const estimatedCost = getToolCreditCost(toolName, estimatedRows);

  // Cycle cap check
  if (isCycleCapExceeded() && !critical) {
    logger.warn(
      { source: 'govtribe', cycleUsed: cycleCreditsUsed, cycleCap: CYCLE_CREDIT_CAP },
      'govtribe_mcp_cycle_cap_exceeded',
    );
    await logCreditUsage(toolName, estimatedCost, 'skipped_cycle_cap', undefined, undefined, caller);
    const cached = await getCachedResponse(toolName, cacheId);
    return {
      data: (cached as T) ?? null,
      decision: 'skipped_cycle_cap',
      from_cache: cached !== null,
      credits_used: 0,
      budget_status: budgetStatus,
    };
  }

  // Daily-pace-aware budget gate (replaces static pct thresholds)
  const dailyStatus = await getDailyBudgetStatus(budgetStatus);
  logger.info(
    {
      source: 'govtribe',
      tool: toolName,
      dailyAllowance: dailyStatus.dailyAllowance,
      todaySpent: dailyStatus.todaySpent,
      todayAvailable: dailyStatus.todayAvailable,
      daysRemaining: dailyStatus.daysRemaining,
      remainingCredits: dailyStatus.remainingCredits,
      estimatedCost,
      critical,
    },
    'govtribe_mcp_daily_budget_check',
  );

  // Hard stop: no credits left (even critical calls stop here)
  if (dailyStatus.remainingCredits <= 0) {
    await logCreditUsage(toolName, estimatedCost, 'skipped_halted', undefined, undefined, caller);
    const cached = await getCachedResponse(toolName, cacheId);
    return {
      data: (cached as T) ?? null,
      decision: 'skipped_halted',
      from_cache: cached !== null,
      credits_used: 0,
      budget_status: budgetStatus,
    };
  }

  // Daily pace gate: today's allowance exhausted (non-critical only)
  if (dailyStatus.todayAvailable < estimatedCost && !critical) {
    await logCreditUsage(toolName, estimatedCost, 'skipped_halted', undefined, undefined, caller);
    const cached = await getCachedResponse(toolName, cacheId);
    return {
      data: (cached as T) ?? null,
      decision: 'skipped_halted',
      from_cache: cached !== null,
      credits_used: 0,
      budget_status: budgetStatus,
    };
  }

  if (!API_KEY) {
    logger.warn({ source: 'govtribe' }, 'govtribe_mcp_no_api_key');
    return {
      data: null,
      decision: 'skipped_halted',
      from_cache: false,
      credits_used: 0,
      budget_status: budgetStatus,
    };
  }

  // Retry loop for transient failures
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      logger.warn({ attempt, delay, source: 'govtribe' }, 'govtribe_mcp_retry');
      await new Promise((r) => setTimeout(r, delay));
      // Reset connection on retry
      await closeMcpClient();
    }

    try {
      const client = await getOrCreateClient();

      const result = await client.callTool({ name: toolName, arguments: args });

      // MCP callTool returns { content: [...], isError?: boolean }
      if (result.isError) {
        const errText = (result.content as Array<{ text?: string }>)
          .map((c) => c.text ?? '')
          .join(' ')
          .slice(0, 500);
        throw new Error(`MCP tool error: ${errText}`);
      }

      // Extract the text content (MCP returns content array)
      const contentItems = result.content as Array<{ type: string; text?: string }>;
      let data: unknown = null;
      for (const item of contentItems) {
        if (item.type === 'text' && item.text) {
          try {
            data = JSON.parse(item.text);
          } catch {
            data = item.text;
          }
          break;
        }
      }

      // Calculate actual credit cost from real result count
      const actualRows = countResultRows(data);
      const actualCost = getToolCreditCost(toolName, actualRows);

      await logCreditUsage(toolName, actualCost, 'called', 200, undefined, caller);
      await setCachedResponse(toolName, cacheId, data);
      cycleCreditsUsed += actualCost;

      const updatedBudget = await getCreditBudgetStatus();
      return {
        data: data as T,
        decision: 'called',
        from_cache: false,
        credits_used: actualCost,
        budget_status: updatedBudget,
      };
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('401') || err.message.includes('403') || err.message.includes('Unauthorized'))
      ) {
        // Auth errors — don't retry
        const errorText = err.message;
        await logCreditUsage(toolName, 0, 'skipped_halted', undefined, errorText, caller);
        logger.error({ source: 'govtribe', tool: toolName, error: errorText }, 'govtribe_mcp_auth_error');
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  // All retries exhausted — log and fall back to cache
  const errorText = lastError?.message ?? 'max retries exhausted';
  await logCreditUsage(toolName, 0, 'skipped_halted', undefined, errorText, caller);
  logger.error({ source: 'govtribe', tool: toolName, error: errorText }, 'govtribe_mcp_fetch_error');

  const cached = await getCachedResponse(toolName, cacheId);
  return {
    data: (cached as T) ?? null,
    decision: 'cached',
    from_cache: cached !== null,
    credits_used: 0,
    budget_status: budgetStatus,
  };
}

/**
 * Check if GovTribe MCP is reachable by running tools/list.
 * No credits burned.
 */
export async function checkGovTribeMcpReachable(): Promise<{
  reachable: boolean;
  toolCount?: number;
  error?: string;
}> {
  if (!API_KEY) {
    return { reachable: false, error: 'GOVTRIBE_API_KEY not set' };
  }

  try {
    const tools = await listTools();
    return { reachable: true, toolCount: tools.length };
  } catch (err) {
    return { reachable: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Clean up expired cache entries (older than 30 days).
 */
export async function purgeExpiredCache(): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM govtribe_cache WHERE expires_at < NOW()`,
  );
  return rowCount ?? 0;
}
