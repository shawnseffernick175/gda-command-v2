/**
 * Agent Runner — shared execution framework for all GDA agents.
 *
 * Handles:
 *   - Run lifecycle (start → complete/fail)
 *   - Tracking in agent_runs table
 *   - Updating agent_config.last_run_at
 *   - Creating approval queue items
 *   - Checking if an agent is enabled
 */

import { getPool } from "./db";
import { log } from "./logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentResult {
  items_processed: number;
  items_flagged: number;
  summary: Record<string, unknown>;
}

export interface ApprovalItem {
  type: string;
  title: string;
  summary?: string;
  data?: Record<string, unknown>;
  priority?: "critical" | "high" | "medium" | "low";
  expires_at?: Date;
}

export interface AgentContext {
  runId: string;
  agent: string;
  trigger: string;
  addApproval: (item: ApprovalItem) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Check if agent is enabled
// ---------------------------------------------------------------------------

export async function isAgentEnabled(agent: string): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;
  const result = await pool.query(
    "SELECT enabled FROM agent_config WHERE agent = $1",
    [agent],
  );
  return result.rows[0]?.enabled ?? false;
}

// ---------------------------------------------------------------------------
// Run an agent with lifecycle management
// ---------------------------------------------------------------------------

export async function runAgent(
  agent: string,
  trigger: "cron" | "manual" | "webhook",
  fn: (ctx: AgentContext) => Promise<AgentResult>,
): Promise<AgentResult> {
  const pool = getPool();
  if (!pool) {
    throw new Error("Database not available");
  }

  const enabled = await isAgentEnabled(agent);
  if (!enabled) {
    log.info("agent_skipped", { agent, reason: "disabled" });
    return { items_processed: 0, items_flagged: 0, summary: { skipped: true } };
  }

  // Create run record
  const runResult = await pool.query(
    `INSERT INTO agent_runs (agent, status, trigger, started_at)
     VALUES ($1, 'running', $2, NOW())
     RETURNING id`,
    [agent, trigger],
  );
  const runId = runResult.rows[0].id as string;

  log.info("agent_started", { agent, runId, trigger });

  // Approval helper — inserts into approval_queue linked to this run
  const addApproval = async (item: ApprovalItem): Promise<string> => {
    const r = await pool.query(
      `INSERT INTO approval_queue (type, agent, agent_run_id, title, summary, data, priority, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        item.type,
        agent,
        runId,
        item.title,
        item.summary ?? null,
        item.data ? JSON.stringify(item.data) : null,
        item.priority ?? "medium",
        item.expires_at ?? null,
      ],
    );
    return r.rows[0].id as string;
  };

  const ctx: AgentContext = { runId, agent, trigger, addApproval };
  const startMs = Date.now();

  try {
    const result = await fn(ctx);
    const durationMs = Date.now() - startMs;

    await pool.query(
      `UPDATE agent_runs
       SET status = 'completed', completed_at = NOW(), duration_ms = $2,
           items_processed = $3, items_flagged = $4, results_summary = $5
       WHERE id = $1`,
      [runId, durationMs, result.items_processed, result.items_flagged, JSON.stringify(result.summary)],
    );

    await pool.query(
      "UPDATE agent_config SET last_run_at = NOW(), updated_at = NOW() WHERE agent = $1",
      [agent],
    );

    log.info("agent_completed", { agent, runId, durationMs, ...result });
    return result;
  } catch (e) {
    const durationMs = Date.now() - startMs;
    const errMsg = e instanceof Error ? e.message : String(e);

    await pool.query(
      `UPDATE agent_runs
       SET status = 'failed', completed_at = NOW(), duration_ms = $2, error = $3
       WHERE id = $1`,
      [runId, durationMs, errMsg],
    ).catch(() => {}); // don't throw on logging failure

    log.error("agent_failed", { agent, runId, durationMs, error: errMsg });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export async function getAgentStatus() {
  const pool = getPool();
  if (!pool) return [];
  const result = await pool.query(`
    SELECT ac.agent, ac.display_name, ac.description, ac.enabled, ac.schedule,
           ac.last_run_at, ac.config,
           ar.status AS last_status, ar.duration_ms AS last_duration_ms,
           ar.items_processed AS last_items_processed,
           ar.items_flagged AS last_items_flagged,
           ar.error AS last_error
    FROM agent_config ac
    LEFT JOIN LATERAL (
      SELECT status, duration_ms, items_processed, items_flagged, error
      FROM agent_runs WHERE agent = ac.agent
      ORDER BY started_at DESC LIMIT 1
    ) ar ON true
    ORDER BY ac.agent
  `);
  return result.rows;
}

export async function getAgentRuns(agent: string, limit = 20) {
  const pool = getPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT * FROM agent_runs WHERE agent = $1 ORDER BY started_at DESC LIMIT $2`,
    [agent, limit],
  );
  return result.rows;
}

export async function getPendingApprovals(filters?: { type?: string; agent?: string }) {
  const pool = getPool();
  if (!pool) return [];
  let query = "SELECT * FROM approval_queue WHERE status = 'pending'";
  const params: unknown[] = [];
  if (filters?.type) {
    params.push(filters.type);
    query += ` AND type = $${params.length}`;
  }
  if (filters?.agent) {
    params.push(filters.agent);
    query += ` AND agent = $${params.length}`;
  }
  query += " ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at ASC";
  const result = await pool.query(query, params);
  return result.rows;
}

export async function resolveApproval(
  id: string,
  decision: "approved" | "rejected",
  decidedBy: string,
  note?: string,
) {
  const pool = getPool();
  if (!pool) throw new Error("Database not available");
  await pool.query(
    `UPDATE approval_queue
     SET status = $2, decided_by = $3, decided_at = NOW(), decision_note = $4
     WHERE id = $1 AND status = 'pending'`,
    [id, decision, decidedBy, note ?? null],
  );
}
