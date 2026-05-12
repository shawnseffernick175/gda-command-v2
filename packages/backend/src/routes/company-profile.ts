import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
const router = Router();

// GET /api/company-profile — current company profile
router.get("/", async (_req, res) => {
  const pool = getPool();
  if (pool) {
    try {
      const result = await pool.query(
        "SELECT * FROM company_profile ORDER BY created_at LIMIT 1",
      );
      if (result.rows.length > 0) {
        const row = result.rows[0];
        return res.json(
          successEnvelope("gda-company-profile", "get", {
            ...row,
            revenue: row.revenue ? parseFloat(row.revenue) : null,
            source: "database",
          }),
        );
      }
    } catch { /* fall through */ }
  }

  res.json(
    successEnvelope("gda-company-profile", "get", {
      id: null,
      name: "Not configured",
      source: "empty",
    }),
  );
});

// GET /api/company-profile/:id
router.get("/:id", async (req, res) => {
  const pool = getPool();
  if (pool) {
    try {
      const result = await pool.query(
        "SELECT * FROM company_profile WHERE id = $1",
        [req.params.id],
      );
      if (result.rows.length > 0) {
        const row = result.rows[0];
        return res.json(
          successEnvelope("gda-company-profile", "detail", {
            ...row,
            revenue: row.revenue ? parseFloat(row.revenue) : null,
            source: "database",
          }),
        );
      }
    } catch { /* fall through */ }
  }
  return res
    .status(404)
    .json(
      errorEnvelope("gda-company-profile", "detail", {
        code: "NOT_FOUND",
        message: `Company profile ${req.params.id} not found`,
        detail: null,
      }),
    );
});

export default router;
