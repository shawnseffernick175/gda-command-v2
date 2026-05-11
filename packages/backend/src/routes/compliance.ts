import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { MOCK_REQUIREMENTS, MOCK_CLAUSES } from "../data/compliance-mock";
import { getPool } from "../lib/db";
import type { ComplianceRequirement, ClauseReference } from "@gda/shared";

const router = Router();

async function loadRequirements(): Promise<{ items: ComplianceRequirement[]; source: "db" | "mock" }> {
  const pool = getPool();
  if (pool) {
    try {
      const { rows } = await pool.query("SELECT * FROM compliance_requirements ORDER BY solicitation_id, section");
      if (rows.length > 0) return { items: rows as ComplianceRequirement[], source: "db" };
    } catch { /* fall through */ }
  }
  return { items: [...MOCK_REQUIREMENTS], source: "mock" };
}

async function loadClauses(): Promise<{ items: ClauseReference[]; source: "db" | "mock" }> {
  const pool = getPool();
  if (pool) {
    try {
      const { rows } = await pool.query("SELECT * FROM clause_references ORDER BY clause_number");
      if (rows.length > 0) return { items: rows as ClauseReference[], source: "db" };
    } catch { /* fall through */ }
  }
  return { items: [...MOCK_CLAUSES], source: "mock" };
}

// ---------------------------------------------------------------------------
// GET /api/compliance/requirements — compliance requirements with filters
// ---------------------------------------------------------------------------
router.get("/requirements", async (req, res) => {
  try {
    const { items: allReqs, source } = await loadRequirements();
    let items = [...allReqs];
    const { solicitation, category, status, search } = req.query;

    if (solicitation && typeof solicitation === "string") {
      items = items.filter((r) => r.solicitation_id === solicitation);
    }
    if (category && typeof category === "string") {
      items = items.filter((r) => r.category === category);
    }
    if (status && typeof status === "string") {
      items = items.filter((r) => r.status === status);
    }
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      items = items.filter(
        (r) =>
          r.requirement.toLowerCase().includes(q) ||
          r.section.toLowerCase().includes(q) ||
          r.solicitation_title.toLowerCase().includes(q) ||
          (r.evidence && r.evidence.toLowerCase().includes(q)),
      );
    }

    const all = allReqs;
    const compliant = all.filter((r) => r.status === "compliant").length;
    const partial = all.filter((r) => r.status === "partial").length;
    const gap = all.filter((r) => r.status === "gap").length;
    const notApplicable = all.filter((r) => r.status === "not_applicable").length;

    const solicitations = Array.from(
      new Map(all.map((r) => [r.solicitation_id, { id: r.solicitation_id, title: r.solicitation_title }])).values(),
    );

    const categories: Record<string, number> = {};
    for (const r of all) {
      categories[r.category] = (categories[r.category] ?? 0) + 1;
    }

    const scorable = all.filter((r) => r.status !== "not_applicable").length;
    const score = scorable > 0 ? Math.round(((compliant + partial * 0.5) / scorable) * 100) : 100;

    res.json(
      successEnvelope("GDA.compliance", "list-requirements", {
        requirements: items,
        total: all.length,
        filtered: items.length,
        summary: { compliant, partial, gap, not_applicable: notApplicable, score },
        solicitations, categories, source,
      }),
    );
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.compliance", "list-requirements", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// GET /api/compliance/clauses — clause library with filters
// ---------------------------------------------------------------------------
router.get("/clauses", async (req, res) => {
  try {
    const { items: allClauses, source } = await loadClauses();
    let items = [...allClauses];
    const { type, search } = req.query;

    if (type && typeof type === "string") {
      items = items.filter((c) => c.type === type);
    }
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      items = items.filter(
        (c) =>
          c.clause_number.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.summary.toLowerCase().includes(q),
      );
    }

    const typeCounts: Record<string, number> = {};
    for (const c of allClauses) {
      typeCounts[c.type] = (typeCounts[c.type] ?? 0) + 1;
    }

    res.json(
      successEnvelope("GDA.compliance", "list-clauses", {
        clauses: items, total: allClauses.length, filtered: items.length, typeCounts, source,
      }),
    );
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.compliance", "list-clauses", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// GET /api/compliance/clauses/:id — single clause detail
// ---------------------------------------------------------------------------
router.get("/clauses/:id", async (req, res) => {
  const pool = getPool();
  if (pool) {
    try {
      const { rows } = await pool.query("SELECT * FROM clause_references WHERE id = $1", [req.params.id]);
      if (rows.length > 0) return res.json(successEnvelope("GDA.compliance", "get-clause", { clause: rows[0], source: "db" }));
    } catch { /* fall through */ }
  }
  const clause = MOCK_CLAUSES.find((c) => c.id === req.params.id);
  if (!clause) {
    return res.status(404).json(errorEnvelope("GDA.compliance", "get-clause", { code: "NOT_FOUND", message: `Clause ${req.params.id} not found`, detail: null }));
  }
  res.json(successEnvelope("GDA.compliance", "get-clause", { clause, source: "mock" }));
});

export default router;
