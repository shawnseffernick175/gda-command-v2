import { Router } from "express";
import { log } from "../lib/logger";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import envisionProfile from "../data/envision-profile.json";
import gdaNarrative from "../data/gda-narrative.json";

const router = Router();

// ---------------------------------------------------------------------------
// F-100 Sprint 1: Static Envision identity card
// ---------------------------------------------------------------------------

router.get("/envision", (_req, res) => {
  res.json(successEnvelope("GDA.company-profile", "envision", envisionProfile));
});

// ---------------------------------------------------------------------------
// F-100 Sprint 1: GDA 3-pillar narrative for proposal generation
// ---------------------------------------------------------------------------

router.get("/gda-narrative", (_req, res) => {
  res.json(successEnvelope("GDA.company-profile", "gda-narrative", gdaNarrative));
});

// ---------------------------------------------------------------------------
// F-100 Sprint 1: Partner summary cards (read-only)
// ---------------------------------------------------------------------------

router.get("/partners", async (_req, res) => {
  try {
    const pool = getPool();
    if (pool) {
      try {
        const result = await pool.query(
          `SELECT ou_tag, display_name, anchor_company, is_primary, is_partner,
                  uei, cage, primary_naics, notes, created_at
           FROM ou_registry
           WHERE is_partner = TRUE
           ORDER BY ou_tag`,
        );
        if (result.rows.length > 0) {
          const partners = result.rows.map((row) => ({
            ...row,
            read_only: true,
            why_envision_tracks: row.ou_tag === "riverstone"
              ? "HUBZone certification (teaming lever for set-aside opps). MDA SHIELD prime ($151B ceiling) — Envision sub potential. IC access."
              : "V3 Veteran cert. 300+ heads (surge capacity). Training/sim depth. Shared RS3 access.",
            certs: row.ou_tag === "riverstone"
              ? ["HUBZone", "WOSB", "SDB", "ISO 9001:2015", "CMMC RPO", "CMMI-DEV ML3-aligned"]
              : ["V3 Veteran", "ISO 9001:2015"],
            top_vehicles: row.ou_tag === "riverstone"
              ? ["GSA MAS 47QTCA20D006F", "MDA SHIELD IDIQ prime", "NASA CPSS", "Air Force ABMS", "Army FCoE Ft Sill"]
              : ["Army RS3", "EAGLE", "SCOE II", "TSS-E", "63rd RD", "SeaPort-NxG", "GSA FSS"],
          }));
          return res.json(successEnvelope("GDA.company-profile", "partners", { partners, read_only: true }));
        }
      } catch (err) {
        log.warn("company-profile_partners_db_fallback", { error: String(err) });
      }
    }

    // Fallback: static partner data
    const partners = [
      {
        ou_tag: "riverstone",
        display_name: "OU-II Intelligence & Cyber Engineering",
        anchor_company: "Riverstone Solutions",
        is_partner: true,
        cage: "71WX3",
        uei: null,
        primary_naics: null,
        read_only: true,
        why_envision_tracks: "HUBZone certification (teaming lever for set-aside opps). MDA SHIELD prime ($151B ceiling) — Envision sub potential. IC access.",
        certs: ["HUBZone", "WOSB", "SDB", "ISO 9001:2015", "CMMC RPO", "CMMI-DEV ML3-aligned"],
        top_vehicles: ["GSA MAS 47QTCA20D006F", "MDA SHIELD IDIQ prime", "NASA CPSS", "Air Force ABMS", "Army FCoE Ft Sill"],
      },
      {
        ou_tag: "pd_systems",
        display_name: "OU-III Training, Simulation & Digital Readiness",
        anchor_company: "PD Systems",
        is_partner: true,
        cage: "4V8V7",
        uei: "MBF6MBLZLMC3",
        primary_naics: "561210",
        read_only: true,
        why_envision_tracks: "V3 Veteran cert. 300+ heads (surge capacity). Training/sim depth. Shared RS3 access.",
        certs: ["V3 Veteran", "ISO 9001:2015"],
        top_vehicles: ["Army RS3", "EAGLE", "SCOE II", "TSS-E", "63rd RD", "SeaPort-NxG", "GSA FSS"],
      },
    ];
    res.json(successEnvelope("GDA.company-profile", "partners", { partners, read_only: true }));
  } catch (err) {
    log.error("company-profile_partners_error", { error: String((err as Error).message) });
    res.status(500).json(
      errorEnvelope("GDA.company-profile", "partners", {
        code: "INTERNAL_ERROR",
        message: "Failed to fetch partner data",
        detail: null,
      }),
    );
  }
});

// GET /api/company-profile — current company profile (legacy)
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
    } catch (err) { log.warn("company-profile_fallback", { error: String(err) }); }
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
    } catch (err) { log.warn("company-profile_fallback", { error: String(err) }); }
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
