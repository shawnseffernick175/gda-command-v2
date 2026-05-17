/**
 * Agent Scheduler — cron-based scheduler that reads agent_config schedules
 * and fires agents at their configured intervals.
 *
 * Uses simple setInterval polling (every 60s) to check if an agent is due.
 * Stores last_run_at in agent_config to prevent double-runs.
 */

import { getPool } from "./db";
import { log } from "./logger";
import { isLLMAvailable } from "./llm";

// Agent execution imports (lazy to avoid circular deps)
type AgentRunner = (trigger: "cron" | "manual" | "webhook") => Promise<unknown>;

const agentRunners: Record<string, () => Promise<AgentRunner>> = {
  "opportunity-watch": async () => {
    const { runOpportunityWatch } = await import("../agents/opportunity-watch");
    return runOpportunityWatch;
  },
  "morning-commander": async () => {
    const { executeMorningCommander } = await import("../agents/morning-commander");
    return executeMorningCommander;
  },
  "competitive-intel": async () => {
    const { runCompetitiveIntel } = await import("../agents/competitive-intel");
    return runCompetitiveIntel;
  },
  "fix-runner": async () => {
    const { triggerControlledFix } = await import("../agents/controlled-fix");
    return triggerControlledFix;
  },
};

/**
 * Parse a cron expression and determine if the agent should run now.
 * Supports: "0 6 * * *" (minute hour dom month dow)
 * Checks if current time matches the schedule within a 60-second window.
 */
function shouldRunNow(cronExpr: string, lastRunAt: Date | null): boolean {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 5) return false;

  const now = new Date();
  const [cronMin, cronHour, cronDom, cronMon, cronDow] = parts;

  // Check if we already ran within the last 55 minutes (prevent double-fire)
  if (lastRunAt) {
    const minutesSinceLastRun = (now.getTime() - lastRunAt.getTime()) / 60_000;
    if (minutesSinceLastRun < 55) return false;
  }

  const matchField = (field: string, value: number, divisorField?: boolean): boolean => {
    if (field === "*") return true;
    // */N interval pattern
    if (field.startsWith("*/")) {
      const interval = parseInt(field.slice(2));
      return !isNaN(interval) && interval > 0 && value % interval === 0;
    }
    // Comma-separated values
    if (field.includes(",")) {
      return field.split(",").some((v) => parseInt(v) === value);
    }
    // Range (e.g. 1-5)
    if (field.includes("-")) {
      const [lo, hi] = field.split("-").map(Number);
      return value >= lo && value <= hi;
    }
    return parseInt(field) === value;
  };

  const nowMin = now.getUTCMinutes();
  const nowHour = now.getUTCHours();
  const nowDom = now.getUTCDate();
  const nowMon = now.getUTCMonth() + 1;
  const nowDow = now.getUTCDay();

  return (
    matchField(cronMin, nowMin) &&
    matchField(cronHour, nowHour) &&
    matchField(cronDom, nowDom) &&
    matchField(cronMon, nowMon) &&
    matchField(cronDow, nowDow)
  );
}

async function checkAndRunAgents(): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  if (!isLLMAvailable()) {
    return; // Can't run agents without LLM
  }

  try {
    const result = await pool.query(
      `SELECT agent, schedule, last_run_at, enabled
       FROM agent_config
       WHERE schedule IS NOT NULL AND enabled = true`,
    );

    for (const row of result.rows) {
      const { agent, schedule, last_run_at } = row;

      if (!shouldRunNow(schedule, last_run_at ? new Date(last_run_at) : null)) {
        continue;
      }

      const getRunner = agentRunners[agent];
      if (!getRunner) {
        log.warn("agent_scheduler_no_runner", { agent });
        continue;
      }

      log.info("agent_scheduler_firing", { agent, schedule });

      // Fire and forget — agent-runner handles lifecycle
      (async () => {
        try {
          const runner = await getRunner();
          await runner("cron");
          log.info("agent_scheduler_completed", { agent });
        } catch (e) {
          log.error("agent_scheduler_error", { agent, error: (e as Error).message });
        }
      })();
    }
  } catch (e) {
    log.error("agent_scheduler_check_error", { error: (e as Error).message });
  }
}

// ---------------------------------------------------------------------------
// Start/Stop
// ---------------------------------------------------------------------------

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

export function startAgentScheduler(): void {
  if (schedulerTimer) return;

  log.info("agent_scheduler_started");

  // Check every 60 seconds
  schedulerTimer = setInterval(() => {
    checkAndRunAgents().catch((e) =>
      log.error("agent_scheduler_tick_error", { error: (e as Error).message }),
    );
  }, 60_000);

  // Also run an initial check after 30s (give DB time to be ready)
  setTimeout(() => {
    checkAndRunAgents().catch((e) =>
      log.error("agent_scheduler_initial_error", { error: (e as Error).message }),
    );
  }, 30_000);
}

export function stopAgentScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    log.info("agent_scheduler_stopped");
  }
}
