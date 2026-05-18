import { Router } from "express";
import type { VehicleType, ProcurementVehicle, VehicleSummary } from "@gda/shared";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { recordVersion } from "../lib/versioning";

const router = Router();

// ---------------------------------------------------------------------------
// Vehicle type classification logic
// ---------------------------------------------------------------------------

const VEHICLE_KEYWORDS: Record<VehicleType, string[]> = {
  idiq: ["idiq", "indefinite delivery", "indefinite quantity", "id/iq"],
  bpa: ["bpa", "blanket purchase", "blanket agreement"],
  gsa_schedule: ["gsa schedule", "gsa mas", "federal supply schedule", "multiple award schedule"],
  gwac: ["gwac", "government-wide", "alliant", "cio-sp", "vets 2", "8a stars"],
  full_and_open: ["full and open", "full & open", "unrestricted"],
  set_aside_sb: ["small business set-aside", "sb set-aside", "total small business"],
  set_aside_8a: ["8(a)", "8a", "sba 8"],
  set_aside_hubzone: ["hubzone"],
  set_aside_sdvosb: ["sdvosb", "service-disabled veteran"],
  set_aside_wosb: ["wosb", "women-owned", "woman-owned", "edwosb"],
  sole_source: ["sole source", "sole-source", "non-competitive"],
  task_order: ["task order", "delivery order", "to/do"],
  other: [],
};

export function classifyVehicle(
  eligibleVehicles: string | null | undefined,
  setAside: string | null | undefined,
  procurementType: string | null | undefined
): VehicleType | null {
  const combined = [eligibleVehicles, setAside, procurementType]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!combined) return null;

  for (const [vehicle, keywords] of Object.entries(VEHICLE_KEYWORDS)) {
    if (vehicle === "other") continue;
    for (const kw of keywords) {
      if (combined.includes(kw)) return vehicle as VehicleType;
    }
  }

  return combined.length > 0 ? "other" : null;
}

// ---------------------------------------------------------------------------
// GET /api/vehicles — list all procurement vehicle types with opp counts
// ---------------------------------------------------------------------------
router.get("/", async (_req, res) => {
  try {
    const pool = getPool();

    if (pool) {
      try {
        const vehiclesResult = await pool.query(
          "SELECT key, label, description, category, sort_order FROM procurement_vehicles ORDER BY sort_order"
        );
        const summaryResult = await pool.query(`
          SELECT
            COALESCE(o.vehicle_type, 'unclassified') as vehicle_type,
            COUNT(*)::int as count,
            COALESCE(SUM(o.value_estimated), 0)::bigint as total_value,
            COALESCE(AVG(o.score), 0)::numeric(5,1) as avg_score
          FROM opportunities o
          WHERE o.deleted_at IS NULL
          GROUP BY o.vehicle_type
          ORDER BY count DESC
        `);

        const vehicles: ProcurementVehicle[] = vehiclesResult.rows;
        const summaries: VehicleSummary[] = summaryResult.rows.map((r) => {
          const vehicle = vehicles.find((v) => v.key === r.vehicle_type);
          return {
            vehicle_type: r.vehicle_type as VehicleType,
            label: vehicle?.label ?? (r.vehicle_type === "unclassified" ? "Unclassified" : r.vehicle_type),
            category: vehicle?.category ?? "other",
            count: Number(r.count),
            total_value: Number(r.total_value),
            avg_score: Number(r.avg_score),
          };
        });

        return res.json(
          successEnvelope("vehicles", "list", {
            vehicles,
            summary: summaries,
            total_opportunities: summaries.reduce((s, v) => s + v.count, 0),
          })
        );
      } catch (e) {
        // table may not exist yet — fall through to fallback
      }
    }

    // Fallback: return static vehicle list with zero counts
    const fallbackVehicles: ProcurementVehicle[] = Object.entries(VEHICLE_KEYWORDS)
      .filter(([k]) => k !== "other")
      .map(([key], idx) => ({
        key: key as VehicleType,
        label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        description: null,
        category: "other" as const,
        sort_order: idx + 1,
      }));

    res.json(
      successEnvelope("vehicles", "list", {
        vehicles: fallbackVehicles,
        summary: [],
        total_opportunities: 0,
      })
    );
  } catch (err) {
    res.status(500).json(
      errorEnvelope("vehicles", "list", {
        code: "INTERNAL",
        message: String(err),
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/vehicles/:type/opportunities — opportunities for a specific vehicle
// ---------------------------------------------------------------------------
router.get("/:type/opportunities", async (req, res) => {
  try {
    const vehicleType = req.params.type as VehicleType;
    const pool = getPool();

    if (!pool) {
      return res.json(
        successEnvelope("vehicles", "opportunities", {
          vehicle_type: vehicleType,
          opportunities: [],
          total: 0,
        })
      );
    }

    const result = await pool.query(
      `SELECT id, title, agency, department, status, score, value_estimated,
              probability_of_win, naics, due_date, vehicle_type, set_aside, capture_stage
       FROM opportunities
       WHERE vehicle_type = $1 AND deleted_at IS NULL
       ORDER BY score DESC
       LIMIT 200`,
      [vehicleType]
    );

    res.json(
      successEnvelope("vehicles", "opportunities", {
        vehicle_type: vehicleType,
        opportunities: result.rows,
        total: result.rows.length,
      })
    );
  } catch (err) {
    res.status(500).json(
      errorEnvelope("vehicles", "opportunities", {
        code: "INTERNAL",
        message: String(err),
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/vehicles/classify — classify/reclassify opportunities
// ---------------------------------------------------------------------------
router.post("/classify", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json(
        errorEnvelope("vehicles", "classify", {
          code: "DB_UNAVAILABLE",
          message: "Database not configured",
          detail: null,
        })
      );
    }

    const { opportunity_ids } = req.body as { opportunity_ids?: string[] };

    let query = `SELECT id, set_aside, description, tags, vehicle_type FROM opportunities WHERE deleted_at IS NULL`;
    const params: string[] = [];

    if (opportunity_ids && opportunity_ids.length > 0) {
      query += ` AND id = ANY($1)`;
      params.push(opportunity_ids as unknown as string);
    }

    const opps = await pool.query(query, params.length > 0 ? [opportunity_ids] : []);
    let classified = 0;

    for (const opp of opps.rows) {
      const vehicleType = classifyVehicle(
        opp.tags?.join(" "),
        opp.set_aside,
        null
      );

      if (vehicleType && vehicleType !== opp.vehicle_type) {
        await pool.query(
          "UPDATE opportunities SET vehicle_type = $1, updated_at = NOW() WHERE id = $2",
          [vehicleType, opp.id]
        );
        await recordVersion("opportunities", opp.id, { vehicle_type: vehicleType }, "system", "update");
        classified++;
      }
    }

    res.json(
      successEnvelope("vehicles", "classify", {
        processed: opps.rows.length,
        classified,
      })
    );
  } catch (err) {
    res.status(500).json(
      errorEnvelope("vehicles", "classify", {
        code: "INTERNAL",
        message: String(err),
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// PUT /api/vehicles/:oppId — manually set vehicle type for an opportunity
// ---------------------------------------------------------------------------
router.put("/:oppId", async (req, res) => {
  try {
    const { oppId } = req.params;
    const { vehicle_type } = req.body as { vehicle_type: VehicleType };
    const pool = getPool();

    if (!pool) {
      return res.status(503).json(
        errorEnvelope("vehicles", "set", {
          code: "DB_UNAVAILABLE",
          message: "Database not configured",
          detail: null,
        })
      );
    }

    const result = await pool.query(
      "UPDATE opportunities SET vehicle_type = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING id, vehicle_type",
      [vehicle_type, oppId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(
        errorEnvelope("vehicles", "set", {
          code: "NOT_FOUND",
          message: "Opportunity not found",
          detail: null,
        })
      );
    }

    const userId = req.user?.userId ?? "unknown";
    await recordVersion("opportunities", oppId, { vehicle_type }, userId, "update");

    res.json(successEnvelope("vehicles", "set", result.rows[0]));
  } catch (err) {
    res.status(500).json(
      errorEnvelope("vehicles", "set", {
        code: "INTERNAL",
        message: String(err),
        detail: null,
      })
    );
  }
});

export default router;
