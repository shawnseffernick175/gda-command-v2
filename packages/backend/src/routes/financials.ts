import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";


const router = Router();

// ---------------------------------------------------------------------------
// GET /api/financials/kpis — All 7 financial KPIs for the persistent strip
// ---------------------------------------------------------------------------
router.get("/kpis", (_req, res) => {
  return res.json(
    successEnvelope("GDA.financials", "list-kpis", {
      kpis: [],
      period: "N/A",
      source: "db" as const,
    })
  );
});

// ---------------------------------------------------------------------------
// GET /api/financials/:key — Drill-down for a single KPI (Financial Bible)
// ---------------------------------------------------------------------------
router.get("/:key", (req, res) => {
  const { key } = req.params;

  return res.status(404).json(
    errorEnvelope("GDA.financials", "drill-down", {
      code: "NOT_FOUND",
      message: `Unknown KPI: ${key}`,
      detail: null,
    })
  );
});

export default router;
