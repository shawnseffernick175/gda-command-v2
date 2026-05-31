/**
 * GovTribe API client — credit-budget-aware HTTP layer.
 *
 * Every call:
 * 1. Pre-checks monthly credit budget
 * 2. Makes the API request (or returns cached data if budget exceeded)
 * 3. Logs to govtribe_credit_ledger
 * 4. Caches raw response in govtribe_cache
 *
 * Auth: Authorization: Bearer {GOVTRIBE_API_KEY}
 * Base: configurable, defaults to https://api.govtribe.com/v1
 */

import { request } from 'undici';
import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';

const BASE_URL = process.env['GOVTRIBE_API_BASE'] ?? 'https://api.govtribe.com/v1';
const API_KEY = process.env['GOVTRIBE_API_KEY'] ?? '';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1_000;

const ENDPOINT_CREDITS: Record<string, number> = {
  'opportunities': 1,
  'opportunities_detail': 1,
  'agencies_contacts': 2,
  'vehicles': 1,
};

export type BudgetDecision = 'called' | 'skipped_low_budget' | 'skipped_halted' | 'cached';

export interface CreditBudgetStatus {
  month: string;
  credits_used: number;
  credits_budget: number;
  pct: number;
  last_call_at: string | null;
}

export interface GovTribeFetchResult<T = unknown> {
  data: T | null;
  decision: BudgetDecision;
  from_cache: boolean;
  credits_used: number;
  budget_status: CreditBudgetStatus;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export async function getCreditBudgetStatus(): Promise<CreditBudgetStatus> {
  const month = currentMonth();
  const { rows } = await pool.query(
    `INSERT INTO govtribe_credit_monthly (month, credits_used, credits_budget)
     VALUES ($1, 0, 5000)
     ON CONFLICT (month) DO NOTHING
     RETURNING month, credits_used, credits_budget, last_call_at::text`,
    [month],
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

  return { month, credits_used: 0, credits_budget: 5000, pct: 0, last_call_at: null };
}

async function logCreditUsage(
  endpoint: string,
  costCredits: number,
  decision: BudgetDecision,
  responseStatus?: number,
  errorText?: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO govtribe_credit_ledger
       (endpoint, cost_credits, decision, response_status, error_text)
     VALUES ($1, $2, $3, $4, $5)`,
    [endpoint, costCredits, decision, responseStatus ?? null, errorText ?? null],
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

async function getCachedResponse(endpoint: string, entityId: string): Promise<unknown | null> {
  const { rows } = await pool.query(
    `SELECT response_body FROM govtribe_cache
     WHERE endpoint = $1 AND entity_id = $2
       AND expires_at > NOW()
     LIMIT 1`,
    [endpoint, entityId],
  );
  return rows.length > 0 ? rows[0].response_body : null;
}

async function setCachedResponse(
  endpoint: string,
  entityId: string,
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
    [endpoint, entityId, JSON.stringify(body)],
  );
}

async function setLastError(endpoint: string, entityId: string, error: string): Promise<void> {
  await pool.query(
    `INSERT INTO govtribe_cache (endpoint, entity_id, response_body, last_error)
     VALUES ($1, $2, '{}', $3)
     ON CONFLICT (endpoint, entity_id) DO UPDATE SET
       last_error = $3`,
    [endpoint, entityId, error],
  );
}

async function fetchWithRetry(
  url: string,
  endpointKey: string,
): Promise<{ statusCode: number; body: unknown }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      logger.warn({ attempt, delay, source: 'govtribe' }, 'govtribe_retry');
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const { statusCode, body: respBody } = await request(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (statusCode === 429 || statusCode >= 500) {
        const text = await respBody.text().catch(() => '');
        lastError = new Error(`GovTribe API ${statusCode}: ${text.slice(0, 300)}`);
        continue;
      }

      if (statusCode === 401 || statusCode === 403) {
        const text = await respBody.text().catch(() => '');
        throw new Error(`GovTribe auth error ${statusCode}: ${text.slice(0, 300)}`);
      }

      const data = await respBody.json();
      return { statusCode, body: data };
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('auth error 401') || err.message.includes('auth error 403'))
      ) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error(`GovTribe API: max retries exhausted for ${endpointKey}`);
}

/**
 * Credit-aware GovTribe API fetch.
 *
 * @param endpointKey - Key in ENDPOINT_CREDITS (e.g., 'opportunities')
 * @param path - URL path appended to BASE_URL (e.g., '/opportunities?limit=50')
 * @param cacheId - Cache key entity_id (e.g., 'list_page_1' or an opp id)
 * @param critical - If true, allowed even at >95% budget (on-demand detail)
 */
export async function govtribeFetch<T = unknown>(
  endpointKey: string,
  path: string,
  cacheId: string,
  critical = false,
): Promise<GovTribeFetchResult<T>> {
  const budgetStatus = await getCreditBudgetStatus();
  const costCredits = ENDPOINT_CREDITS[endpointKey] ?? 1;

  if (budgetStatus.pct >= 95 && !critical) {
    await logCreditUsage(endpointKey, costCredits, 'skipped_halted');
    const cached = await getCachedResponse(endpointKey, cacheId);
    return {
      data: (cached as T) ?? null,
      decision: 'skipped_halted',
      from_cache: cached !== null,
      credits_used: 0,
      budget_status: budgetStatus,
    };
  }

  if (budgetStatus.pct >= 80 && !critical) {
    await logCreditUsage(endpointKey, costCredits, 'skipped_low_budget');
    const cached = await getCachedResponse(endpointKey, cacheId);
    return {
      data: (cached as T) ?? null,
      decision: 'skipped_low_budget',
      from_cache: cached !== null,
      credits_used: 0,
      budget_status: budgetStatus,
    };
  }

  if (!API_KEY) {
    logger.warn({ source: 'govtribe' }, 'govtribe_no_api_key');
    return {
      data: null,
      decision: 'skipped_halted',
      from_cache: false,
      credits_used: 0,
      budget_status: budgetStatus,
    };
  }

  const url = `${BASE_URL}${path}`;

  try {
    const { statusCode, body } = await fetchWithRetry(url, endpointKey);
    await logCreditUsage(endpointKey, costCredits, 'called', statusCode);
    await setCachedResponse(endpointKey, cacheId, body);

    const updatedBudget = await getCreditBudgetStatus();
    return {
      data: body as T,
      decision: 'called',
      from_cache: false,
      credits_used: costCredits,
      budget_status: updatedBudget,
    };
  } catch (err) {
    const errorText = err instanceof Error ? err.message : String(err);
    await logCreditUsage(endpointKey, 0, 'skipped_halted', undefined, errorText);
    await setLastError(endpointKey, cacheId, errorText);

    logger.error({ source: 'govtribe', endpoint: endpointKey, error: errorText }, 'govtribe_fetch_error');

    const cached = await getCachedResponse(endpointKey, cacheId);
    return {
      data: (cached as T) ?? null,
      decision: 'cached',
      from_cache: cached !== null,
      credits_used: 0,
      budget_status: budgetStatus,
    };
  }
}

/**
 * Check if GovTribe API is reachable (used by health endpoint).
 */
export async function checkGovTribeReachable(): Promise<{
  reachable: boolean;
  error?: string;
}> {
  if (!API_KEY) {
    return { reachable: false, error: 'GOVTRIBE_API_KEY not set' };
  }

  try {
    const { statusCode } = await request(`${BASE_URL}/opportunities?limit=1`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (statusCode === 200) return { reachable: true };
    if (statusCode === 401 || statusCode === 403) {
      return { reachable: false, error: `Auth failed (${statusCode}) — credentials may have rotated` };
    }
    return { reachable: false, error: `HTTP ${statusCode}` };
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
