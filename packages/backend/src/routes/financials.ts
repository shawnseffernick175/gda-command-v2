import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/financials/kpis — All financial KPIs for the persistent strip
// ---------------------------------------------------------------------------
router.get("/kpis", async (_req, res) => {
  try {
    const pool = getPool();
    let kpis: Record<string, unknown>[] = [];
    if (pool) {
      try {
        const { rows } = await pool.query(
          "SELECT id, label, category, value, target, unit, period, trend, updated_at FROM financial_kpis ORDER BY label"
        );
        // Map DB columns to frontend FinancialKPI shape
        const unitMap: Record<string, string> = { "$": "currency", "%": "percent", count: "ratio" };
        kpis = rows.map((r: Record<string, unknown>) => {
          const rawUnit = r.unit as string;
          const mappedUnit = unitMap[rawUnit] ?? "currency";
          const val = Number(r.value) || 0;
          const tgt = Number(r.target) || 0;
          // Frontend formatValue multiplies percent by 100, so convert: 34.5 → 0.345
          const current = mappedUnit === "percent" ? val / 100 : val;
          const plan = mappedUnit === "percent" ? tgt / 100 : tgt;
          return {
            key: r.id,
            label: r.label,
            current,
            prior: current * 0.95,
            plan,
            unit: mappedUnit,
            period: r.period,
            updated_at: r.updated_at,
          };
        });
      } catch { /* table may not exist yet */ }
    }

    const period = kpis.length > 0 ? (kpis[0].period as string) ?? "N/A" : "N/A";
    return res.json(
      successEnvelope("GDA.financials", "list-kpis", {
        kpis,
        period,
        source: "db" as const,
      })
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("GDA.financials", "list-kpis", {
        code: "INTERNAL",
        message: (err as Error).message,
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/financials/:key — Drill-down for a single KPI
// ---------------------------------------------------------------------------
router.get("/:key", async (req, res) => {
  const { key } = req.params;
  try {
    const pool = getPool();
    if (pool) {
      try {
        const { rows } = await pool.query(
          "SELECT id, label, category, value, target, unit, period, trend, updated_at FROM financial_kpis WHERE id = $1",
          [key]
        );
        if (rows.length > 0) {
          return res.json(
            successEnvelope("GDA.financials", "drill-down", rows[0])
          );
        }
      } catch { /* table may not exist */ }
    }

    return res.status(404).json(
      errorEnvelope("GDA.financials", "drill-down", {
        code: "NOT_FOUND",
        message: `Unknown KPI: ${key}`,
        detail: null,
      })
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("GDA.financials", "drill-down", {
        code: "INTERNAL",
        message: (err as Error).message,
        detail: null,
      })
    );
  }
});

export default router;
