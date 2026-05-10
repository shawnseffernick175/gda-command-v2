import { Router } from "express";
import { successEnvelope } from "../middleware/envelope";
import { getHealthStatus, getLatestFailures } from "../data/qa-mock";

const router = Router();

/**
 * GET /api/qa/health
 * Returns platform health status with individual check results.
 * Workflow naming follows v1 convention: GDA.gateway.qa-health
 */
router.get("/health", (_req, res) => {
  const health = getHealthStatus();
  const summary = {
    total: health.checks.length,
    passed: health.checks.filter((c) => c.status === "pass").length,
    failed: health.checks.filter((c) => c.status === "fail").length,
    warned: health.checks.filter((c) => c.status === "warn").length,
  };
  res.json(
    successEnvelope(
      "GDA.gateway.qa-health",
      "health",
      {
        overall: health.status,
        summary,
        rows: health.checks,
        nextAction:
          summary.failed > 0
            ? `${summary.failed} check(s) failing. Investigate the failed endpoints.`
            : summary.warned > 0
              ? `${summary.warned} check(s) with warnings. Review when possible.`
              : "All checks passed.",
      },
      { checkCount: health.checks.length }
    )
  );
});

/**
 * GET /api/qa/latest-failures
 * Returns the most recent workflow failures for the QA Center dashboard.
 * Workflow naming follows v1 convention: GDA.gateway.failures-latest
 */
router.get("/latest-failures", (_req, res) => {
  const failures = getLatestFailures();
  res.json(
    successEnvelope(
      "GDA.gateway.failures-latest",
      "list",
      { rows: failures },
      {
        count: failures.length,
        unresolvedCount: failures.filter((f) => !f.resolved).length,
      }
    )
  );
});

export default router;
