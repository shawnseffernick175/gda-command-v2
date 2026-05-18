/**
 * Company entity routes — W4 merger context.
 * CRUD for company_entity records (Envision, PD Systems, Riverstone, NewCo).
 * Admin-only. Integrates with W3 versioning + soft-delete.
 */

import { Router, Request, Response } from "express";
import { requireRole } from "../lib/auth";
import { getPool } from "../lib/db";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { log } from "../lib/logger";
import { recordVersion, softDelete } from "../lib/versioning";
import type { CompanyEntity, EntityStatus } from "@gda/shared";

const router = Router();

const VALID_STATUSES: EntityStatus[] = ["legacy", "merging", "newco", "subsidiary", "partner"];

// GET /api/admin/companies — list all company entities (non-deleted)
router.get("/", async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.status(503).json(errorEnvelope("company-entities", "list", { code: "DB_UNAVAILABLE", message: "Database not configured", detail: null }));
    return;
  }

  try {
    const { rows } = await pool.query(
      `SELECT * FROM company_entity WHERE deleted_at IS NULL ORDER BY legal_name`
    );
    res.json(successEnvelope("company-entities", "list", { entities: rows, total: rows.length }));
  } catch (err) {
    log.error("company_entity_list_error", { error: (err as Error).message });
    res.status(500).json(errorEnvelope("company-entities", "list", { code: "QUERY_ERROR", message: "Failed to list company entities", detail: null }));
  }
});

// GET /api/admin/companies/:entityId — get single entity
router.get("/:entityId", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.status(503).json(errorEnvelope("company-entities", "detail", { code: "DB_UNAVAILABLE", message: "Database not configured", detail: null }));
    return;
  }

  try {
    const { rows } = await pool.query(
      `SELECT * FROM company_entity WHERE entity_id = $1 AND deleted_at IS NULL`,
      [req.params.entityId]
    );
    if (rows.length === 0) {
      res.status(404).json(errorEnvelope("company-entities", "detail", { code: "NOT_FOUND", message: "Entity not found", detail: null }));
      return;
    }
    res.json(successEnvelope("company-entities", "detail", rows[0]));
  } catch (err) {
    log.error("company_entity_detail_error", { error: (err as Error).message });
    res.status(500).json(errorEnvelope("company-entities", "detail", { code: "QUERY_ERROR", message: "Failed to fetch entity", detail: null }));
  }
});

// POST /api/admin/companies — create new entity
router.post("/", requireRole("admin"), async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.status(503).json(errorEnvelope("company-entities", "create", { code: "DB_UNAVAILABLE", message: "Database not configured", detail: null }));
    return;
  }

  const {
    entity_id, legal_name, status, dba_names, cage_code, uei, duns,
    primary_naics, naics_codes, psc_codes, set_aside_status, certifications,
    contract_vehicles, capabilities, bu_codes, differentiators, headquarters,
    employee_count, revenue_band, primary_customers, description,
  } = req.body;

  if (!entity_id || !legal_name || !status) {
    res.status(400).json(errorEnvelope("company-entities", "create", { code: "VALIDATION", message: "entity_id, legal_name, and status are required", detail: null }));
    return;
  }

  if (!VALID_STATUSES.includes(status)) {
    res.status(400).json(errorEnvelope("company-entities", "create", { code: "VALIDATION", message: `status must be one of: ${VALID_STATUSES.join(", ")}`, detail: null }));
    return;
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO company_entity (
        entity_id, legal_name, status, dba_names, cage_code, uei, duns,
        primary_naics, naics_codes, psc_codes, set_aside_status, certifications,
        contract_vehicles, capabilities, bu_codes, differentiators, headquarters,
        employee_count, revenue_band, primary_customers, description
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
      RETURNING *`,
      [
        entity_id, legal_name, status,
        dba_names ?? [], cage_code ?? null, uei ?? null, duns ?? null,
        primary_naics ?? null, naics_codes ?? [], psc_codes ?? [], set_aside_status ?? [],
        JSON.stringify(certifications ?? []), JSON.stringify(contract_vehicles ?? []),
        capabilities ?? [], JSON.stringify(bu_codes ?? []),
        differentiators ?? null, headquarters ?? null,
        employee_count ?? null, revenue_band ?? null,
        primary_customers ?? [], description ?? null,
      ]
    );

    const userId = (req as unknown as { user?: { id?: string } }).user?.id ?? "system";
    await recordVersion("company_entity", entity_id, rows[0], userId, "create");

    res.status(201).json(successEnvelope("company-entities", "create", rows[0]));
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("duplicate key")) {
      res.status(409).json(errorEnvelope("company-entities", "create", { code: "DUPLICATE", message: `Entity '${entity_id}' already exists`, detail: null }));
      return;
    }
    log.error("company_entity_create_error", { error: msg });
    res.status(500).json(errorEnvelope("company-entities", "create", { code: "QUERY_ERROR", message: "Failed to create entity", detail: null }));
  }
});

// PUT /api/admin/companies/:entityId — update entity
router.put("/:entityId", requireRole("admin"), async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.status(503).json(errorEnvelope("company-entities", "update", { code: "DB_UNAVAILABLE", message: "Database not configured", detail: null }));
    return;
  }

  const entityId = req.params.entityId;

  try {
    // Fetch current state for versioning diff
    const { rows: current } = await pool.query(
      `SELECT * FROM company_entity WHERE entity_id = $1 AND deleted_at IS NULL`,
      [entityId]
    );
    if (current.length === 0) {
      res.status(404).json(errorEnvelope("company-entities", "update", { code: "NOT_FOUND", message: "Entity not found", detail: null }));
      return;
    }

    const {
      legal_name, status, dba_names, cage_code, uei, duns,
      primary_naics, naics_codes, psc_codes, set_aside_status, certifications,
      contract_vehicles, capabilities, bu_codes, differentiators, headquarters,
      employee_count, revenue_band, primary_customers, description,
    } = req.body;

    if (status && !VALID_STATUSES.includes(status)) {
      res.status(400).json(errorEnvelope("company-entities", "update", { code: "VALIDATION", message: `status must be one of: ${VALID_STATUSES.join(", ")}`, detail: null }));
      return;
    }

    const { rows } = await pool.query(
      `UPDATE company_entity SET
        legal_name = COALESCE($2, legal_name),
        status = COALESCE($3, status),
        dba_names = COALESCE($4, dba_names),
        cage_code = COALESCE($5, cage_code),
        uei = COALESCE($6, uei),
        duns = COALESCE($7, duns),
        primary_naics = COALESCE($8, primary_naics),
        naics_codes = COALESCE($9, naics_codes),
        psc_codes = COALESCE($10, psc_codes),
        set_aside_status = COALESCE($11, set_aside_status),
        certifications = COALESCE($12, certifications),
        contract_vehicles = COALESCE($13, contract_vehicles),
        capabilities = COALESCE($14, capabilities),
        bu_codes = COALESCE($15, bu_codes),
        differentiators = COALESCE($16, differentiators),
        headquarters = COALESCE($17, headquarters),
        employee_count = COALESCE($18, employee_count),
        revenue_band = COALESCE($19, revenue_band),
        primary_customers = COALESCE($20, primary_customers),
        description = COALESCE($21, description),
        updated_at = NOW()
      WHERE entity_id = $1 AND deleted_at IS NULL
      RETURNING *`,
      [
        entityId,
        legal_name ?? null, status ?? null,
        dba_names ?? null, cage_code ?? null, uei ?? null, duns ?? null,
        primary_naics ?? null, naics_codes ?? null, psc_codes ?? null,
        set_aside_status ?? null,
        certifications ? JSON.stringify(certifications) : null,
        contract_vehicles ? JSON.stringify(contract_vehicles) : null,
        capabilities ?? null,
        bu_codes ? JSON.stringify(bu_codes) : null,
        differentiators ?? null, headquarters ?? null,
        employee_count ?? null, revenue_band ?? null,
        primary_customers ?? null, description ?? null,
      ]
    );

    if (rows.length === 0) {
      res.status(404).json(errorEnvelope("company-entities", "update", { code: "NOT_FOUND", message: "Entity not found or was deleted", detail: null }));
      return;
    }

    const userId = (req as unknown as { user?: { id?: string } }).user?.id ?? "system";
    await recordVersion("company_entity", entityId, rows[0], userId, "update", current[0]);

    res.json(successEnvelope("company-entities", "update", rows[0]));
  } catch (err) {
    log.error("company_entity_update_error", { error: (err as Error).message });
    res.status(500).json(errorEnvelope("company-entities", "update", { code: "QUERY_ERROR", message: "Failed to update entity", detail: null }));
  }
});

// DELETE /api/admin/companies/:entityId — soft-delete entity
router.delete("/:entityId", requireRole("admin"), async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.status(503).json(errorEnvelope("company-entities", "delete", { code: "DB_UNAVAILABLE", message: "Database not configured", detail: null }));
    return;
  }

  const userId = (req as unknown as { user?: { id?: string } }).user?.id ?? "system";
  const ok = await softDelete("company_entity", req.params.entityId, userId, "entity_id");

  if (!ok) {
    res.status(404).json(errorEnvelope("company-entities", "delete", { code: "NOT_FOUND", message: "Entity not found or already deleted", detail: null }));
    return;
  }

  res.json(successEnvelope("company-entities", "delete", { deleted: req.params.entityId }));
});

// GET /api/admin/companies/:entityId/eligibility/:opportunityId — check entity eligibility for opportunity
router.get("/:entityId/eligibility/:opportunityId", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.status(503).json(errorEnvelope("company-entities", "eligibility", { code: "DB_UNAVAILABLE", message: "Database not configured", detail: null }));
    return;
  }

  try {
    const [entityResult, oppResult] = await Promise.all([
      pool.query(`SELECT * FROM company_entity WHERE entity_id = $1 AND deleted_at IS NULL`, [req.params.entityId]),
      pool.query(`SELECT * FROM opportunities WHERE id = $1`, [req.params.opportunityId]),
    ]);

    if (entityResult.rows.length === 0 || oppResult.rows.length === 0) {
      res.status(404).json(errorEnvelope("company-entities", "eligibility", { code: "NOT_FOUND", message: "Entity or opportunity not found", detail: null }));
      return;
    }

    const entity = entityResult.rows[0] as CompanyEntity;
    const opp = oppResult.rows[0];

    const checks: Array<{ check: string; pass: boolean; detail: string }> = [];

    // NAICS match
    const oppNaics = opp.naics;
    if (oppNaics) {
      const naicsMatch = entity.naics_codes.includes(oppNaics) || entity.primary_naics === oppNaics;
      checks.push({
        check: "naics_match",
        pass: naicsMatch,
        detail: naicsMatch ? `Entity covers NAICS ${oppNaics}` : `Entity does not cover NAICS ${oppNaics}`,
      });
    }

    // Set-aside eligibility
    const oppSetAside = opp.set_aside;
    if (oppSetAside && oppSetAside !== "None" && oppSetAside !== "Full and Open") {
      const saMatch = entity.set_aside_status.some((sa: string) =>
        oppSetAside.toLowerCase().includes(sa.toLowerCase())
      );
      checks.push({
        check: "set_aside_eligible",
        pass: saMatch,
        detail: saMatch ? `Entity qualifies for ${oppSetAside}` : `Entity not eligible for ${oppSetAside} (has: ${entity.set_aside_status.join(", ") || "none"})`,
      });
    }

    // PSC match
    const oppPsc = opp.psc;
    if (oppPsc) {
      const pscMatch = entity.psc_codes.includes(oppPsc);
      checks.push({
        check: "psc_match",
        pass: pscMatch,
        detail: pscMatch ? `Entity covers PSC ${oppPsc}` : `Entity does not cover PSC ${oppPsc}`,
      });
    }

    const eligible = checks.every(c => c.pass);

    res.json(successEnvelope("company-entities", "eligibility", {
      entity_id: entity.entity_id,
      opportunity_id: opp.id,
      eligible,
      checks,
    }));
  } catch (err) {
    log.error("company_entity_eligibility_error", { error: (err as Error).message });
    res.status(500).json(errorEnvelope("company-entities", "eligibility", { code: "QUERY_ERROR", message: "Failed to check eligibility", detail: null }));
  }
});

// POST /api/admin/companies/check-all/:opportunityId — check all entities against one opportunity
router.get("/check-all/:opportunityId", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.status(503).json(errorEnvelope("company-entities", "check-all", { code: "DB_UNAVAILABLE", message: "Database not configured", detail: null }));
    return;
  }

  try {
    const { rows: entities } = await pool.query(
      `SELECT * FROM company_entity WHERE deleted_at IS NULL ORDER BY legal_name`
    );
    const { rows: opps } = await pool.query(
      `SELECT * FROM opportunities WHERE id = $1`,
      [req.params.opportunityId]
    );

    if (opps.length === 0) {
      res.status(404).json(errorEnvelope("company-entities", "check-all", { code: "NOT_FOUND", message: "Opportunity not found", detail: null }));
      return;
    }

    const opp = opps[0];
    const results = entities.map((entity: CompanyEntity) => {
      const checks: Array<{ check: string; pass: boolean; detail: string }> = [];

      if (opp.naics) {
        const naicsMatch = entity.naics_codes.includes(opp.naics) || entity.primary_naics === opp.naics;
        checks.push({ check: "naics_match", pass: naicsMatch, detail: naicsMatch ? `Covers NAICS ${opp.naics}` : `Missing NAICS ${opp.naics}` });
      }

      if (opp.set_aside && opp.set_aside !== "None" && opp.set_aside !== "Full and Open") {
        const saMatch = entity.set_aside_status.some((sa: string) =>
          opp.set_aside.toLowerCase().includes(sa.toLowerCase())
        );
        checks.push({ check: "set_aside_eligible", pass: saMatch, detail: saMatch ? `Qualifies for ${opp.set_aside}` : `Not eligible for ${opp.set_aside}` });
      }

      if (opp.psc) {
        const pscMatch = entity.psc_codes.includes(opp.psc);
        checks.push({ check: "psc_match", pass: pscMatch, detail: pscMatch ? `Covers PSC ${opp.psc}` : `Missing PSC ${opp.psc}` });
      }

      return {
        entity_id: entity.entity_id,
        legal_name: entity.legal_name,
        eligible: checks.every(c => c.pass),
        checks,
        score: checks.filter(c => c.pass).length,
        total_checks: checks.length,
      };
    });

    // Sort by score descending
    results.sort((a: { score: number }, b: { score: number }) => b.score - a.score);

    const recommended = results[0]?.eligible ? results[0].entity_id : null;

    res.json(successEnvelope("company-entities", "check-all", {
      opportunity_id: opp.id,
      results,
      recommended_entity: recommended,
    }));
  } catch (err) {
    log.error("company_entity_check_all_error", { error: (err as Error).message });
    res.status(500).json(errorEnvelope("company-entities", "check-all", { code: "QUERY_ERROR", message: "Failed to check eligibility", detail: null }));
  }
});

export default router;
