import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getMockFinancialKPIs, getMockFinancialDrillDown } from "../data/financials-mock";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/financials/kpis — All 7 financial KPIs for the persistent strip
// ---------------------------------------------------------------------------
router.get("/kpis", (_req, res) => {
  const kpis = getMockFinancialKPIs();

  return res.json(
    successEnvelope("GDA.financials", "list-kpis", {
      kpis,
      period: kpis[0]?.period ?? "N/A",
      source: "mock" as const,
    })
  );
});

// ---------------------------------------------------------------------------
// GET /api/financials/:key — Drill-down for a single KPI (Financial Bible)
// ---------------------------------------------------------------------------
router.get("/:key", (req, res) => {
  const { key } = req.params;

  const drillDown = getMockFinancialDrillDown(key);

  if (!drillDown) {
    return res.status(404).json(
      errorEnvelope("GDA.financials", "drill-down", {
        code: "NOT_FOUND",
        message: `Unknown KPI: ${key}`,
        detail: null,
      })
    );
  }

  return res.json(
    successEnvelope("GDA.financials", "drill-down", {
      ...drillDown,
      source: "mock" as const,
    })
  );
});

export default router;
