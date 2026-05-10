import { Router } from "express";
import { successEnvelope } from "../middleware/envelope";
import { getHealthStatus, getLatestFailures } from "../data/qa-mock";

const router = Router();

/**
 * GET /api/qa/health
 * Returns platform health status with individual check results.
 */
router.get("/health", (_req, res) => {
  const health = getHealthStatus();
  res.json(
    successEnvelope("gda-qa", "health-check", health, {
      checkCount: health.checks.length,
    })
  );
});

/**
 * GET /api/qa/latest-failures
 * Returns the most recent workflow failures for the QA Center dashboard.
 */
router.get("/latest-failures", (_req, res) => {
  const failures = getLatestFailures();
  res.json(
    successEnvelope("gda-qa", "latest-failures", { failures }, {
      count: failures.length,
      unresolvedCount: failures.filter((f) => !f.resolved).length,
    })
  );
});

export default router;
