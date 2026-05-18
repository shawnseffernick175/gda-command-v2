/**
 * Controlled Fix Agent
 *
 * Autonomous failure-detection and repair-proposal agent:
 *   1. OBSERVE — fetch failed executions from n8n (or from internal error logs)
 *   2. ORIENT — GPT-4o diagnoses root cause, classifies severity, proposes fix
 *   3. DECIDE — triage: critical → immediate alert, high → approval queue, low → log
 *   4. ACT — store fix proposals, queue critical/high for human approval
 *
 * Trigger: cron (every 4 hours) or manual via POST /api/agents/fix-runner/trigger
 */

import { runAgent, type AgentContext, type AgentResult } from "../lib/agent-runner";
import { chatCompletion, isLLMAvailable, type ChatMessage } from "../lib/llm";
import { getPool } from "../lib/db";
import { log } from "../lib/logger";
import { listFailedExecutions, apiConfig } from "../lib/n8n-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FailedExecution {
  id: string | null;
  workflowName: string;
  workflowId: string | null;
  failedNode: string | null;
  errorMessage: string;
  failedAt: string | null;
}

interface AIDiagnosis {
  root_cause: string;
  severity: "critical" | "high" | "medium" | "low";
  suggested_fix: string;
  fix_type: "auto" | "manual" | "restart" | "config_change";
  risk_assessment: string;
  safety_lane: "read-only" | "dry-run" | "approval" | "unknown";
  auto_fixable: boolean;
}

interface FixProposal {
  execution: FailedExecution;
  diagnosis: AIDiagnosis;
}

// ---------------------------------------------------------------------------
// Data gathering — OBSERVE
// ---------------------------------------------------------------------------

async function fetchFailures(): Promise<FailedExecution[]> {
  const cfg = apiConfig();
  if (cfg.missing.length > 0) {
    log.info("fix_runner_no_n8n", { reason: "N8N_API_BASE or N8N_API_KEY not configured" });
    return fetchInternalFailures();
  }

  try {
    const result = await listFailedExecutions(25);
    if (!result.configured || result.error) {
      log.warn("fix_runner_n8n_error", { error: result.error });
      return fetchInternalFailures();
    }

    return result.executions.map((exec) => {
      const e = exec as Record<string, unknown>;
      const wd = e.workflowData as Record<string, unknown> | undefined;
      const wf = e.workflow as Record<string, unknown> | undefined;
      const rd = (e.data as Record<string, unknown>)?.resultData as Record<string, unknown> | undefined;
      const errObj = rd?.error as Record<string, unknown> | undefined;
      const execErr = e.error as Record<string, unknown> | undefined;

      return {
        id: (e.id as string) ?? null,
        workflowName: String(wd?.name ?? e.workflowName ?? wf?.name ?? e.workflowId ?? "unknown"),
        workflowId: String(e.workflowId ?? wd?.id ?? ""),
        failedNode: String(rd?.lastNodeExecuted ?? e.lastNodeExecuted ?? ""),
        errorMessage: String(
          errObj?.message ?? execErr?.message ?? e.message ?? "No error message"
        ).slice(0, 500),
        failedAt: String(e.stoppedAt ?? e.finishedAt ?? e.startedAt ?? ""),
      };
    });
  } catch (err) {
    log.warn("fix_runner_fetch_error", { error: (err as Error).message });
    return fetchInternalFailures();
  }
}

async function fetchInternalFailures(): Promise<FailedExecution[]> {
  const pool = getPool();
  if (!pool) return [];

  const result = await pool.query(
    `SELECT id, agent, error, started_at
     FROM agent_runs
     WHERE status = 'failed' AND error IS NOT NULL
     ORDER BY started_at DESC LIMIT 25`,
  );

  return result.rows.map((row) => ({
    id: row.id,
    workflowName: `GDA.agent.${row.agent}`,
    workflowId: null,
    failedNode: null,
    errorMessage: String(row.error).slice(0, 500),
    failedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
  }));
}

// ---------------------------------------------------------------------------
// Dedup — skip already-diagnosed failures
// ---------------------------------------------------------------------------

async function filterNewFailures(failures: FailedExecution[]): Promise<FailedExecution[]> {
  const pool = getPool();
  if (!pool || failures.length === 0) return failures;

  const existingResult = await pool.query(
    `SELECT execution_id, error_message, workflow_name
     FROM fix_proposals
     WHERE created_at > NOW() - INTERVAL '7 days'`,
  );

  const seen = new Set(
    existingResult.rows.map((r) =>
      r.execution_id ? `exec:${r.execution_id}` : `msg:${r.workflow_name}:${r.error_message}`
    ),
  );

  return failures.filter((f) => {
    const key = f.id ? `exec:${f.id}` : `msg:${f.workflowName}:${f.errorMessage}`;
    return !seen.has(key);
  });
}

// ---------------------------------------------------------------------------
// AI Diagnosis — ORIENT
// ---------------------------------------------------------------------------

async function diagnoseFailures(failures: FailedExecution[]): Promise<FixProposal[]> {
  if (failures.length === 0) return [];

  const failureSummaries = failures
    .map(
      (f, i) =>
        `Failure ${i + 1}:\n  Workflow: ${f.workflowName}\n  Node: ${f.failedNode ?? "N/A"}\n  Error: ${f.errorMessage}\n  Time: ${f.failedAt ?? "unknown"}`,
    )
    .join("\n\n");

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You are a GDA platform engineer specializing in n8n workflow automation and Express API backends.

Given a batch of workflow/agent failures, diagnose each one and provide a structured fix proposal.

For EACH failure, provide:
1. root_cause: 1-2 sentence root cause assessment
2. severity: "critical" | "high" | "medium" | "low"
   - critical: data loss, security breach, or complete system outage
   - high: key feature broken, user-facing errors
   - medium: degraded functionality, non-critical workflow broken
   - low: cosmetic, logging, or non-user-facing
3. suggested_fix: exact steps to fix (be specific)
4. fix_type: "restart" (just retry), "config_change" (env var or config), "auto" (code can fix), "manual" (human intervention needed)
5. risk_assessment: what could go wrong if the fix is applied
6. safety_lane: "read-only" (no state change), "dry-run" (test only), "approval" (needs human OK), "unknown"
7. auto_fixable: true if a simple restart or config change can resolve it without code changes

Respond with valid JSON: { "diagnoses": [ { ... }, ... ] } — one per failure, in order.`,
    },
    {
      role: "user",
      content: `Diagnose these ${failures.length} failures:\n\n${failureSummaries}`,
    },
  ];

  const response = await chatCompletion(messages, { tier: "fast", temperature: 0.2 });
  if (!response) throw new Error("LLM returned empty diagnosis");

  const jsonMatch = response.content.match(/\{[\s\S]*"diagnoses"[\s\S]*\}/);
  if (!jsonMatch) throw new Error("LLM response did not contain valid JSON");

  const parsed = JSON.parse(jsonMatch[0]) as { diagnoses: AIDiagnosis[] };
  if (!Array.isArray(parsed.diagnoses)) throw new Error("Invalid diagnoses array");

  return failures.map((execution, i) => ({
    execution,
    diagnosis: parsed.diagnoses[i] ?? {
      root_cause: "Unable to diagnose — AI response incomplete",
      severity: "medium" as const,
      suggested_fix: "Manual investigation required",
      fix_type: "manual" as const,
      risk_assessment: "Unknown",
      safety_lane: "unknown" as const,
      auto_fixable: false,
    },
  }));
}

// ---------------------------------------------------------------------------
// Store + queue — DECIDE & ACT
// ---------------------------------------------------------------------------

async function storeAndQueueProposals(
  proposals: FixProposal[],
  ctx: AgentContext,
): Promise<{ stored: number; queued: number }> {
  const pool = getPool();
  if (!pool) throw new Error("Database not available");

  let stored = 0;
  let queued = 0;

  for (const { execution, diagnosis } of proposals) {
    const insertResult = await pool.query(
      `INSERT INTO fix_proposals (
        agent_run_id, execution_id, workflow_name, workflow_id, failed_node,
        error_message, failed_at, root_cause, severity, suggested_fix,
        fix_type, risk_assessment, safety_lane, auto_fixable, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id`,
      [
        ctx.runId,
        execution.id,
        execution.workflowName,
        execution.workflowId,
        execution.failedNode,
        execution.errorMessage,
        execution.failedAt ? new Date(execution.failedAt) : null,
        diagnosis.root_cause,
        diagnosis.severity,
        diagnosis.suggested_fix,
        diagnosis.fix_type,
        diagnosis.risk_assessment,
        diagnosis.safety_lane,
        diagnosis.auto_fixable,
        "proposed",
      ],
    );
    stored++;

    if (diagnosis.severity === "critical" || diagnosis.severity === "high") {
      await ctx.addApproval({
        type: "workflow_fix",
        title: `Fix: ${execution.workflowName} — ${execution.errorMessage.slice(0, 80)}`,
        summary: diagnosis.root_cause,
        data: {
          fix_proposal_id: insertResult.rows[0].id,
          workflow_name: execution.workflowName,
          severity: diagnosis.severity,
          suggested_fix: diagnosis.suggested_fix,
          fix_type: diagnosis.fix_type,
          risk_assessment: diagnosis.risk_assessment,
          safety_lane: diagnosis.safety_lane,
          auto_fixable: diagnosis.auto_fixable,
        },
        priority: diagnosis.severity as "critical" | "high",
      });
      queued++;
    }
  }

  return { stored, queued };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function triggerControlledFix(
  trigger: "cron" | "manual" | "webhook" = "manual",
): Promise<AgentResult> {
  return runAgent("fix-runner", trigger, async (ctx) => {
    // 1. OBSERVE — fetch failures
    const allFailures = await fetchFailures();

    // 2. Dedup — skip already-diagnosed
    const newFailures = await filterNewFailures(allFailures);

    if (newFailures.length === 0) {
      return {
        items_processed: allFailures.length,
        items_flagged: 0,
        summary: {
          total_failures: allFailures.length,
          new_failures: 0,
          proposals_created: 0,
          approvals_queued: 0,
          message: "No new failures to diagnose",
        },
      };
    }

    // 3. ORIENT — AI diagnosis
    let proposals: FixProposal[];
    if (isLLMAvailable()) {
      proposals = await diagnoseFailures(newFailures);
    } else {
      proposals = newFailures.map((execution) => ({
        execution,
        diagnosis: {
          root_cause: "LLM not available — manual diagnosis required",
          severity: "medium" as const,
          suggested_fix: "Review the error logs manually and apply appropriate fix",
          fix_type: "manual" as const,
          risk_assessment: "Cannot assess without AI diagnosis",
          safety_lane: "unknown" as const,
          auto_fixable: false,
        },
      }));
    }

    // 4. DECIDE & ACT — store + queue
    const { stored, queued } = await storeAndQueueProposals(proposals, ctx);

    const severityCounts = proposals.reduce(
      (acc, p) => {
        acc[p.diagnosis.severity] = (acc[p.diagnosis.severity] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      items_processed: newFailures.length,
      items_flagged: queued,
      summary: {
        total_failures: allFailures.length,
        new_failures: newFailures.length,
        proposals_created: stored,
        approvals_queued: queued,
        severity_breakdown: severityCounts,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Query helpers for the route layer
// ---------------------------------------------------------------------------

export async function fetchPendingFixes(): Promise<unknown[]> {
  const pool = getPool();
  if (!pool) return [];

  const result = await pool.query(
    `SELECT id, execution_id, workflow_name, workflow_id, failed_node,
            error_message, failed_at, root_cause, severity, suggested_fix,
            fix_type, risk_assessment, safety_lane, auto_fixable, status,
            decided_by, decided_at, decision_note, created_at
     FROM fix_proposals
     WHERE status = 'proposed'
     ORDER BY
       CASE severity
         WHEN 'critical' THEN 1
         WHEN 'high' THEN 2
         WHEN 'medium' THEN 3
         WHEN 'low' THEN 4
       END,
       created_at DESC`,
  );

  return result.rows;
}

export async function fetchAllProposals(limit = 50): Promise<unknown[]> {
  const pool = getPool();
  if (!pool) return [];

  const result = await pool.query(
    `SELECT id, execution_id, workflow_name, workflow_id, failed_node,
            error_message, failed_at, root_cause, severity, suggested_fix,
            fix_type, risk_assessment, safety_lane, auto_fixable, status,
            decided_by, decided_at, decision_note, applied_at, verified_at,
            verification_result, created_at
     FROM fix_proposals
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );

  return result.rows;
}

export async function resolveFixProposal(
  id: string,
  action: "approve" | "reject",
  decidedBy: string,
  note?: string,
): Promise<unknown> {
  const pool = getPool();
  if (!pool) throw new Error("Database not available");

  const newStatus = action === "approve" ? "approved" : "rejected";
  const result = await pool.query(
    `UPDATE fix_proposals
     SET status = $2, decided_by = $3, decided_at = NOW(), decision_note = $4, updated_at = NOW()
     WHERE id = $1 AND status = 'proposed'
     RETURNING *`,
    [id, newStatus, decidedBy, note ?? null],
  );

  if (result.rows.length === 0) {
    throw new Error(`Fix proposal ${id} not found or already resolved`);
  }

  const proposal = result.rows[0];

  // On approval, attempt to apply the fix automatically
  if (action === "approve" && proposal.auto_fixable && proposal.safety_lane === "read_only") {
    try {
      await applyApprovedFix(pool, proposal);
    } catch (e) {
      log.warn(`Auto-apply failed for fix ${id}: ${(e as Error).message}`);
    }
  }

  return proposal;
}

async function applyApprovedFix(
  pool: ReturnType<typeof getPool>,
  proposal: Record<string, unknown>,
): Promise<void> {
  if (!pool) return;
  const fixType = proposal.fix_type as string;
  const suggestedFix = proposal.suggested_fix as string;

  // Only apply safe, deterministic fixes
  if (fixType === "config_change" || fixType === "data_fix") {
    // Mark as applied
    await pool.query(
      `UPDATE fix_proposals SET status = 'applied', applied_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [proposal.id],
    );
    log.info(`Fix ${proposal.id} (${fixType}) marked as applied: ${suggestedFix}`);
  } else {
    // For workflow/code fixes, just mark as approved — requires manual intervention
    log.info(`Fix ${proposal.id} approved but requires manual application (type: ${fixType})`);
  }
}
