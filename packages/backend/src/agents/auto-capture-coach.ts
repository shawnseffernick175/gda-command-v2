/**
 * Auto Capture Coach — fire-and-forget background trigger.
 *
 * Call `queueCaptureCoachIfNeeded(oppId)` after any opportunity
 * create/update. It checks whether an analysis already exists
 * and only runs the agent when one is missing or stale (>24h).
 *
 * The call is intentionally non-blocking — it logs errors but never
 * rejects, so it cannot break the parent request.
 */

import { getPool } from "../lib/db";
import { isLLMAvailable } from "../lib/llm";
import { isAgentEnabled } from "../lib/agent-runner";
import { triggerCaptureCoach } from "./capture-coach";
import { log } from "../lib/logger";

const STALE_HOURS = 24;

/**
 * Queue a background Capture Coach run for an opportunity if:
 *   1. The agent is enabled
 *   2. An LLM is available
 *   3. No recent analysis exists (< STALE_HOURS old)
 *
 * Returns immediately — the analysis runs in the background.
 */
export function queueCaptureCoachIfNeeded(opportunityId: string): void {
  // Fire-and-forget — wrap in a self-executing async
  void (async () => {
    try {
      if (!isLLMAvailable()) return;
      if (!(await isAgentEnabled("capture-coach"))) return;

      const pool = getPool();
      if (!pool) return;

      // Check for recent analysis
      const existing = await pool.query(
        `SELECT created_at FROM capture_coach_results
         WHERE opportunity_id = $1
           AND created_at > NOW() - INTERVAL '${STALE_HOURS} hours'
         LIMIT 1`,
        [opportunityId],
      );

      if (existing.rows.length > 0) {
        log.debug("auto_capture_coach_skipped", {
          opportunityId,
          reason: "recent_analysis_exists",
        });
        return;
      }

      log.info("auto_capture_coach_triggered", { opportunityId });
      await triggerCaptureCoach(opportunityId, "webhook");
      log.info("auto_capture_coach_completed", { opportunityId });
    } catch (e) {
      // Never throw — this is fire-and-forget
      log.warn("auto_capture_coach_error", {
        opportunityId,
        error: (e as Error).message,
      });
    }
  })();
}
