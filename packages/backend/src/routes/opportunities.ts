import { Router } from "express";
import type { Opportunity, OpportunityStatus } from "@gda/shared";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { requireRole } from "../lib/auth";

import {
  n8nWebhookConfigured,
  fetchOpsTrackerFromN8n,
  fetchOpportunityDetailFromN8n,
} from "../lib/n8n-data";
import { queueCaptureCoachIfNeeded } from "../agents/auto-capture-coach";
import { recordVersion } from "../lib/versioning";
import { log } from "../lib/logger";

const router = Router();

const VALID_STATUSES: OpportunityStatus[] = [
  "discovery",
  "qualified",
  "pipeline",
  "lost",
  "won",
  "no_bid",
  "gov_cancelled",
];

// Shipley stages — superset of existing statuses for the capture pipeline
const SHIPLEY_STAGES = [
  "interest",
  "qualify",
  "pursue",
  "solicitation",
  "post_submittal",
  "won",
  "lost",
  "no_bid",
  "gov_cancelled",
] as const;

// Map Shipley stages to the existing DB status values
const SHIPLEY_TO_STATUS: Record<string, OpportunityStatus> = {
  interest: "discovery",
  qualify: "qualified",
  pursue: "pipeline",
  solicitation: "pipeline",
  post_submittal: "pipeline",
  won: "won",
  lost: "lost",
  no_bid: "no_bid",
  gov_cancelled: "gov_cancelled",
};

// ---------------------------------------------------------------------------
// NAICS size classification — SBA size standard lookup
// Revenue-based NAICS codes (threshold in $M): if company revenue exceeds
// the threshold, the company is "large" for that NAICS code.
// Employee-based codes use headcount threshold instead.
// ---------------------------------------------------------------------------
type SbaSizeStandard = { type: "revenue"; thresholdM: number } | { type: "employees"; threshold: number };

const SBA_SIZE_STANDARDS: Record<string, SbaSizeStandard> = {
  // Professional, Scientific, and Technical Services
  "541330": { type: "revenue", thresholdM: 25.5 },   // Engineering Services
  "541511": { type: "revenue", thresholdM: 34 },      // Custom Computer Programming
  "541512": { type: "revenue", thresholdM: 34 },      // Computer Systems Design
  "541513": { type: "revenue", thresholdM: 34 },      // Computer Facilities Management
  "541519": { type: "revenue", thresholdM: 34 },      // Other Computer Related Services
  "541611": { type: "revenue", thresholdM: 24.5 },    // Admin Management Consulting
  "541612": { type: "revenue", thresholdM: 19 },      // Human Resources Consulting
  "541613": { type: "revenue", thresholdM: 19 },      // Marketing Consulting
  "541614": { type: "revenue", thresholdM: 19 },      // Process/Physical Distribution Consulting
  "541618": { type: "revenue", thresholdM: 19 },      // Other Management Consulting
  "541690": { type: "revenue", thresholdM: 19.5 },    // Other Scientific/Technical Consulting
  "541711": { type: "revenue", thresholdM: 1000 },    // R&D Physical/Engineering/Life Sciences
  "541712": { type: "revenue", thresholdM: 1000 },    // R&D Social Sciences/Humanities
  "541715": { type: "employees", threshold: 1000 },   // R&D Physical/Engineering (employee based)
  "541990": { type: "revenue", thresholdM: 19.5 },    // All Other Professional Services
  // Information Technology
  "511210": { type: "employees", threshold: 500 },    // Software Publishers
  "518210": { type: "revenue", thresholdM: 40 },      // Data Processing/Hosting
  "519130": { type: "employees", threshold: 1000 },   // Internet Publishing
  // Manufacturing
  "334111": { type: "employees", threshold: 1250 },   // Electronic Computer Manufacturing
  "334511": { type: "employees", threshold: 1250 },   // Search/Navigation Equipment
  "336414": { type: "employees", threshold: 1500 },   // Guided Missile/Space Vehicle Mfg
};

// Default: revenue-based at $30M for unknown NAICS
const DEFAULT_SBA: SbaSizeStandard = { type: "revenue", thresholdM: 30 };

// Envision Innovative Solutions context: ~$382M revenue, ~41 employees
const COMPANY_REVENUE_M = 382;
const COMPANY_EMPLOYEES = 41;

function classifyNaicsSize(naicsCode: string | null): "small" | "large" | null {
  if (!naicsCode) return null;
  const code = naicsCode.replace(/\D/g, "").slice(0, 6);
  if (!code) return null;
  const standard = SBA_SIZE_STANDARDS[code] ?? DEFAULT_SBA;
  if (standard.type === "revenue") {
    return COMPANY_REVENUE_M <= standard.thresholdM ? "small" : "large";
  }
  return COMPANY_EMPLOYEES <= standard.threshold ? "small" : "large";
}

const SORTABLE_COLUMNS: Record<string, string> = {
  id: "id",
  title: "title",
  department: "department",
  status: "status",
  score: "score",
  value_estimated: "value_estimated",
  probability_of_win: "probability_of_win",
  due_date: "due_date",
  qualified_at: "qualified_at",
  updated_at: "updated_at",
  created_at: "created_at",
};

// ---------------------------------------------------------------------------
// GET /api/opportunities — list with server-side filtering & sorting
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  const search = (req.query.search as string) ?? "";
  const statusFilter = req.query.status as string | undefined;
  const deptFilter = req.query.department as string | undefined;
  const naicsSizeFilter = req.query.naics_size as string | undefined;
  const minPwin = req.query.minPwin ? parseFloat(req.query.minPwin as string) : undefined;
  const minScore = req.query.minScore ? parseFloat(req.query.minScore as string) : undefined;
  const includeLowFit = req.query.includeLowFit === "true";
  const includeAllStatuses = req.query.includeAllStatuses === "true";
  const sortBy = (req.query.sortBy as string) ?? "updated_at";
  const sortDir = (req.query.sortDir as string) === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string, 10) || 25));

  if (statusFilter && !VALID_STATUSES.includes(statusFilter as OpportunityStatus)) {
    return res.status(400).json(
      errorEnvelope("gda-opportunities", "list", {
        code: "INVALID_STATUS",
        message: `Invalid status filter. Must be one of: ${VALID_STATUSES.join(", ")}`,
        detail: null,
      })
    );
  }

  // --- Helper: apply NAICS size classification & filters ---
  function enrichWithNaicsSize(rows: Opportunity[]): Opportunity[] {
    return rows.map((o) => ({ ...o, naics_size: o.naics_size ?? classifyNaicsSize(o.naics) }));
  }

  function filterAndSort(rows: Opportunity[]): Opportunity[] {
    let filtered = enrichWithNaicsSize(rows);
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (o) =>
          o.id.toLowerCase().includes(q) || o.title.toLowerCase().includes(q)
      );
    }
    if (statusFilter) {
      filtered = filtered.filter((o) => o.status === statusFilter);
    } else if (!includeAllStatuses) {
      filtered = filtered.filter((o) => !["won", "lost", "no_bid", "gov_cancelled"].includes(o.status));
    }
    if (deptFilter) {
      filtered = filtered.filter((o) => o.department === deptFilter);
    }
    if (naicsSizeFilter === "small" || naicsSizeFilter === "large") {
      filtered = filtered.filter((o) => o.naics_size === naicsSizeFilter);
    }
    if (minPwin !== undefined && !isNaN(minPwin)) {
      filtered = filtered.filter(
        (o) => o.probability_of_win !== null && o.probability_of_win >= minPwin
      );
    }
    if (minScore !== undefined && !isNaN(minScore)) {
      filtered = filtered.filter((o) => o.score >= minScore);
    } else if (!includeLowFit && !search) {
      filtered = filtered.filter((o) => o.score >= 30 || o.score === 0);
    }
    const col = sortBy as keyof Opportunity;
    filtered.sort((a, b) => {
      const av = a[col] ?? "";
      const bv = b[col] ?? "";
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return filtered;
  }

  // --- Source priority: n8n webhook → Postgres → mock ---

  // 1. Try n8n webhook
  if (n8nWebhookConfigured()) {
    try {
      const n8nResult = await fetchOpsTrackerFromN8n();
      if (n8nResult.ok && n8nResult.opportunities.length > 0) {
        let combined = n8nResult.opportunities;

        // Stage enforcement: default all n8n opportunities to "discovery" (Interest),
        // then apply any user-approved overrides from the local DB.
        // Also merge locally-created opportunities (QuickEntry) into results.
        const dbPool = getPool();
        if (dbPool) {
          try {
            // Fetch user-approved stage overrides (opportunities the user explicitly changed)
            const overrides = await dbPool.query(
              `SELECT id, status, capture_stage FROM opportunities WHERE status != 'discovery' AND id NOT LIKE 'opp-%' AND deleted_at IS NULL`
            );
            const overrideMap = new Map<string, string>();
            for (const row of overrides.rows) {
              overrideMap.set(String(row.id), row.status as string);
            }

            // Apply stage enforcement: default to "discovery" unless user overrode.
            // Auto no-bid: if due_date is past or within 30 days and user hasn't
            // explicitly overridden, set status to "lost" (no-bid).
            const thirtyDaysFromNow = new Date();
            thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

            combined = combined.map((o) => {
              const userStatus = overrideMap.get(String(o.id));
              if (userStatus) return { ...o, status: userStatus as typeof o.status };

              if (o.due_date) {
                const due = new Date(o.due_date);
                if (!isNaN(due.getTime()) && due <= thirtyDaysFromNow) {
                  return { ...o, status: "no_bid" as typeof o.status };
                }
              }
              return { ...o, status: "discovery" as typeof o.status };
            });

            // Merge locally-created opportunities (QuickEntry) that only exist in the DB
            const localOpps = await dbPool.query(
              `SELECT id, title, agency, department, status, score, value_estimated,
                      probability_of_win, naics, due_date, solicitation_number,
                      set_aside, place_of_performance, data_source, created_at, updated_at
               FROM opportunities WHERE id LIKE 'opp-%' AND deleted_at IS NULL`
            );
            if (localOpps.rows.length > 0) {
              combined = [...combined, ...localOpps.rows.map((r) => ({
                ...r,
                id: String(r.id),
                score: parseFloat(r.score) || 0,
                value_estimated: r.value_estimated ? parseFloat(r.value_estimated) : null,
                probability_of_win: r.probability_of_win ? parseFloat(r.probability_of_win) : null,
                naics_size: classifyNaicsSize(r.naics),
                tags: [],
              } as Opportunity))];
            }
          } catch (dbErr) {
            process.stderr.write(`[opportunities] DB merge: ${(dbErr as Error).message}\n`);
            // Fallback: still enforce Interest on all n8n results even without DB,
            // but auto no-bid expired / within-30-day opportunities.
            const fbCutoff = new Date();
            fbCutoff.setDate(fbCutoff.getDate() + 30);
            combined = combined.map((o) => {
              if (o.due_date) {
                const due = new Date(o.due_date);
                if (!isNaN(due.getTime()) && due <= fbCutoff) {
                  return { ...o, status: "no_bid" as typeof o.status };
                }
              }
              return { ...o, status: "discovery" as typeof o.status };
            });
          }
        } else {
          // No DB: enforce Interest on all n8n results,
          // but auto no-bid expired / within-30-day opportunities.
          const noDbCutoff = new Date();
          noDbCutoff.setDate(noDbCutoff.getDate() + 30);
          combined = combined.map((o) => {
            if (o.due_date) {
              const due = new Date(o.due_date);
              if (!isNaN(due.getTime()) && due <= noDbCutoff) {
                return { ...o, status: "no_bid" as typeof o.status };
              }
            }
            return { ...o, status: "discovery" as typeof o.status };
          });
        }

        const allRows = filterAndSort(combined);
        const totalFiltered = allRows.length;
        const totalPages = Math.ceil(totalFiltered / pageSize);
        const rows = allRows.slice((page - 1) * pageSize, page * pageSize);

        // Compute aggregate stats across ALL filtered rows (not just page slice)
        // Ensure numeric coercion to prevent string concatenation from DB/n8n values
        const aggTotalValue = allRows.reduce((s, o) => s + (Number(o.value_estimated) || 0), 0);
        const withPwin = allRows.filter((o) => o.probability_of_win !== null);
        const aggAvgPwin = withPwin.length > 0 ? withPwin.reduce((s, o) => s + (Number(o.probability_of_win) || 0), 0) / withPwin.length : 0;
        const aggAvgScore = allRows.length > 0 ? allRows.reduce((s, o) => s + (Number(o.score) || 0), 0) / allRows.length : 0;
        const aggDepartments = [...new Set(allRows.map((o) => o.department).filter(Boolean))].sort();

        return res.json(
          successEnvelope(
            "gda-opportunities",
            "list",
            { opportunities: rows, source: "n8n" as const },
            {
              count: rows.length,
              totalFiltered,
              totalAvailable: n8nResult.meta.total + (combined.length - n8nResult.opportunities.length),
              page,
              pageSize,
              totalPages,
              totalValue: aggTotalValue,
              avgPwin: aggAvgPwin,
              avgScore: aggAvgScore,
              departments: aggDepartments,
              filters_applied: { search, status: statusFilter, department: deptFilter, naics_size: naicsSizeFilter, minPwin },
              viewLabel: includeAllStatuses ? "v_opportunity_all_tracked" : "v_opportunity_active",
              lastSync: n8nResult.meta.lastSync,
              dataSources: n8nResult.meta.dataSources,
            }
          )
        );
      }
    } catch (err: unknown) {
      process.stderr.write(`[opportunities] n8n fallback: ${(err as Error).message}\n`);
    }
  }

  // 2. Try Postgres
  const pool = getPool();

  if (!pool) {
    return res.json(
      successEnvelope(
        "gda-opportunities",
        "list",
        { opportunities: [], source: "db" as const },
        {
          count: 0,
          filters_applied: { search, status: statusFilter, department: deptFilter, minPwin },
        }
      )
    );
  }

  // Real DB query
  try {
    const conditions: string[] = ["deleted_at IS NULL"];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (search) {
      conditions.push(`(id::text ILIKE $${paramIdx} OR title ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }
    if (statusFilter) {
      conditions.push(`status = $${paramIdx}`);
      params.push(statusFilter);
      paramIdx++;
    } else if (!includeAllStatuses) {
      conditions.push(`status NOT IN ('won', 'lost', 'no_bid', 'gov_cancelled')`);
    }
    if (deptFilter) {
      conditions.push(`department = $${paramIdx}`);
      params.push(deptFilter);
      paramIdx++;
    }
    if (minPwin !== undefined && !isNaN(minPwin)) {
      conditions.push(`probability_of_win >= $${paramIdx}`);
      params.push(minPwin);
      paramIdx++;
    }
    if (minScore !== undefined && !isNaN(minScore)) {
      conditions.push(`score >= $${paramIdx}`);
      params.push(minScore);
      paramIdx++;
    } else if (!includeLowFit && !search) {
      conditions.push(`(score >= 30 OR score = 0)`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sortColumn = SORTABLE_COLUMNS[sortBy] ?? "updated_at";
    const direction = sortDir === "asc" ? "ASC" : "DESC";

    const sql = `
      SELECT id, title, agency, department, status, score, value_estimated,
             probability_of_win, naics, psc, due_date, solicitation_number,
             set_aside, place_of_performance, incumbent, qualified_at,
             qualified_by, description, capture_stage, tags, raw_source_url, created_at, updated_at
      FROM v_opportunity_all_tracked
      ${where}
      ORDER BY ${sortColumn} ${direction} NULLS LAST, id ASC
    `;

    const result = await pool.query(sql, params);
    const rawRows: Opportunity[] = result.rows.map((r) => ({
      ...r,
      score: parseFloat(r.score) || 0,
      value_estimated: r.value_estimated ? parseFloat(r.value_estimated) : null,
      probability_of_win: r.probability_of_win ? parseFloat(r.probability_of_win) : null,
    }));

    // Enrich with NAICS size classification and apply naics_size filter
    let allRows = enrichWithNaicsSize(rawRows);
    if (naicsSizeFilter === "small" || naicsSizeFilter === "large") {
      allRows = allRows.filter((o) => o.naics_size === naicsSizeFilter);
    }

    // naics_size is computed, not a DB column — re-sort in memory when requested
    if (sortBy === "naics_size") {
      const dir = sortDir === "asc" ? 1 : -1;
      allRows.sort((a, b) => {
        const av = a.naics_size ?? "";
        const bv = b.naics_size ?? "";
        return av < bv ? -dir : av > bv ? dir : 0;
      });
    }

    // Paginate DB results (same as n8n path)
    const totalFiltered = allRows.length;
    const totalPages = Math.ceil(totalFiltered / pageSize);
    const rows = allRows.slice((page - 1) * pageSize, page * pageSize);

    // Compute aggregate stats across ALL filtered rows (not just page slice)
    const aggTotalValue = allRows.reduce((s, o) => s + (Number(o.value_estimated) || 0), 0);
    const withPwin = allRows.filter((o) => o.probability_of_win !== null);
    const aggAvgPwin = withPwin.length > 0 ? withPwin.reduce((s, o) => s + (Number(o.probability_of_win) || 0), 0) / withPwin.length : 0;
    const aggAvgScore = allRows.length > 0 ? allRows.reduce((s, o) => s + (Number(o.score) || 0), 0) / allRows.length : 0;
    const aggDepartments = [...new Set(allRows.map((o) => o.department).filter(Boolean))].sort();

    return res.json(
      successEnvelope(
        "gda-opportunities",
        "list",
        { opportunities: rows, source: "db" as const },
        {
          count: rows.length,
          totalFiltered,
          totalAvailable: rawRows.length,
          page,
          pageSize,
          totalPages,
          totalValue: aggTotalValue,
          avgPwin: aggAvgPwin,
          avgScore: aggAvgScore,
          departments: aggDepartments,
          filters_applied: { search, status: statusFilter, department: deptFilter, naics_size: naicsSizeFilter, minPwin },
          viewLabel: includeAllStatuses ? "v_opportunity_all_tracked" : statusFilter ? "v_opportunity_all_tracked (filtered)" : "v_opportunity_active",
        }
      )
    );
  } catch (err: unknown) {
    process.stderr.write(`[opportunities] query error: ${(err as Error).message}\n`);
    return res.json(
      successEnvelope(
        "gda-opportunities",
        "list",
        { opportunities: [], source: "db" as const },
        {
          count: 0,
          filters_applied: { search, status: statusFilter, department: deptFilter, minPwin },
        }
      )
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/opportunities/pipeline — read-only pipeline view per S-008
// ---------------------------------------------------------------------------
router.get("/pipeline", async (req, res) => {
  const search = (req.query.search as string) ?? "";
  const deptFilter = req.query.department as string | undefined;
  const minPwin = req.query.minPwin ? parseFloat(req.query.minPwin as string) : undefined;
  const sortBy = (req.query.sortBy as string) ?? "qualified_at";
  const sortDir = (req.query.sortDir as string) === "asc" ? "asc" : "desc";

  // --- Source: Postgres only (n8n webhook bypasses approval gate) ---
  // Pipeline must ONLY show opportunities the user explicitly approved
  // (approved_at IS NOT NULL). n8n returns all opportunities with
  // "Qualified" status regardless of user approval, so we skip it.

  // Try Postgres
  const pool = getPool();

  if (!pool) {
    return res.json(
      successEnvelope(
        "gda-opportunities",
        "pipeline-list",
        { opportunities: [], source: "db" as const },
        {
          count: 0,
          filters_applied: { search, department: deptFilter, minPwin },
        }
      )
    );
  }

  // Real DB query — only approved opportunities with 30+ days runway
  try {
    const conditions: string[] = ["approved_at IS NOT NULL", "COALESCE(due_date, NOW() + INTERVAL '365 days') > NOW() + INTERVAL '30 days'"];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (search) {
      conditions.push(`(id::text ILIKE $${paramIdx} OR title ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }
    if (deptFilter) {
      conditions.push(`department = $${paramIdx}`);
      params.push(deptFilter);
      paramIdx++;
    }
    if (minPwin !== undefined && !isNaN(minPwin)) {
      conditions.push(`probability_of_win >= $${paramIdx}`);
      params.push(minPwin);
      paramIdx++;
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const sortColumn = SORTABLE_COLUMNS[sortBy] ?? "qualified_at";
    const direction = sortDir === "asc" ? "ASC" : "DESC";

    const sql = `
      SELECT id, title, agency, department, status, score, value_estimated,
             probability_of_win, naics, psc, due_date, solicitation_number,
             set_aside, place_of_performance, incumbent, qualified_at,
             qualified_by, approved_at, approved_by, tags, raw_source_url, created_at, updated_at
      FROM opportunities
      ${where}
      ORDER BY ${sortColumn} ${direction} NULLS LAST, id ASC
    `;

    const result = await pool.query(sql, params);
    const rows: Opportunity[] = result.rows.map((r) => ({
      ...r,
      score: parseFloat(r.score) || 0,
      value_estimated: r.value_estimated ? parseFloat(r.value_estimated) : null,
      probability_of_win: r.probability_of_win ? parseFloat(r.probability_of_win) : null,
    }));

    return res.json(
      successEnvelope(
        "gda-opportunities",
        "pipeline-list",
        { opportunities: rows, source: "db" as const },
        {
          count: rows.length,
          filters_applied: { search, department: deptFilter, minPwin },
        }
      )
    );
  } catch (err: unknown) {
    process.stderr.write(`[opportunities] pipeline query error: ${(err as Error).message}\n`);
    return res.json(
      successEnvelope(
        "gda-opportunities",
        "pipeline-list",
        { opportunities: [], source: "db" as const },
        {
          count: 0,
          filters_applied: { search, department: deptFilter, minPwin },
        }
      )
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/opportunities/:id/approve — mark opportunity as approved
// ---------------------------------------------------------------------------
router.post("/:id/approve", requireRole("admin", "bd_manager"), async (req, res) => {
  const { id } = req.params;
  const pool = getPool();
  if (!pool) {
    return res.status(500).json(
      successEnvelope("gda-opportunities", "approve", null, { error: "no database" })
    );
  }
  try {
    const approvedBy = (req.body?.approved_by as string) || "system";
    const result = await pool.query(
      "UPDATE opportunities SET approved_at = NOW(), approved_by = $1 WHERE id = $2 RETURNING id, title, approved_at, approved_by",
      [approvedBy, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json(
        successEnvelope("gda-opportunities", "approve", null, { error: "not found" })
      );
    }
    return res.json(
      successEnvelope("gda-opportunities", "approve", result.rows[0], {})
    );
  } catch (err: unknown) {
    process.stderr.write(`[opportunities] approve error: ${(err as Error).message}\n`);
    return res.status(500).json(
      successEnvelope("gda-opportunities", "approve", null, { error: (err as Error).message })
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/opportunities/no-bid — past-due or within 30 days of due date
// ---------------------------------------------------------------------------
router.get("/no-bid", async (_req, res) => {
  const pool = getPool();
  if (!pool) {
    return res.json(
      successEnvelope("gda-opportunities", "no-bid-list", { opportunities: [], source: "db" as const }, { count: 0 })
    );
  }
  try {
    const sql = `
      SELECT id, title, agency, department, status, score, value_estimated,
             probability_of_win, naics, psc, due_date, solicitation_number,
             set_aside, place_of_performance, incumbent, qualified_at,
             qualified_by, approved_at, approved_by, tags, raw_source_url, created_at, updated_at
      FROM opportunities
      WHERE due_date IS NOT NULL AND due_date <= NOW() + INTERVAL '30 days'
      ORDER BY due_date ASC NULLS LAST, id ASC
    `;
    const result = await pool.query(sql);
    const rows: Opportunity[] = result.rows.map((r) => ({
      ...r,
      score: parseFloat(r.score) || 0,
      value_estimated: r.value_estimated ? parseFloat(r.value_estimated) : null,
      probability_of_win: r.probability_of_win ? parseFloat(r.probability_of_win) : null,
    }));
    return res.json(
      successEnvelope("gda-opportunities", "no-bid-list", { opportunities: rows, source: "db" as const }, { count: rows.length })
    );
  } catch (err: unknown) {
    process.stderr.write(`[opportunities] no-bid query error: ${(err as Error).message}\n`);
    return res.json(
      successEnvelope("gda-opportunities", "no-bid-list", { opportunities: [], source: "db" as const }, { count: 0 })
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/opportunities/:id/detail — S-009 opportunity detail with OODA
// ---------------------------------------------------------------------------
router.get("/:id/detail", async (req, res) => {
  const { id } = req.params;
  const requestedAt = new Date().toISOString();

  const pool = getPool();
  // Try DB for opportunity detail
  let opp: Opportunity | undefined;
  let source: "db" | "n8n" = "db";
  if (pool) {
    try {
      const result = await pool.query("SELECT * FROM opportunities WHERE id = $1", [id]);
      if (result.rows.length > 0) opp = result.rows[0] as Opportunity;
    } catch { /* empty */ }
  }

  // Fall back to n8n if not in DB
  if (!opp && n8nWebhookConfigured()) {
    try {
      const n8nOpp = await fetchOpportunityDetailFromN8n(id);
      if (n8nOpp) {
        opp = n8nOpp;
        source = "n8n";
      }
    } catch { /* empty */ }
  }

  if (!opp) {
    return res.status(404).json(
      errorEnvelope("gda-opportunity-detail", "read", {
        code: "OPPORTUNITY_NOT_FOUND",
        message: `No opportunity found for ID: ${id}`,
        detail: null,
      })
    );
  }

  const respondedAt = new Date().toISOString();

  // Extract stored OODA and analysis from DB columns (populated by Opportunity Watch agent)
  const oppRecord = opp as unknown as Record<string, unknown>;
  const storedOoda = oppRecord.ooda as Record<string, unknown> | null;
  const storedAnalysis = oppRecord.analysis as Record<string, unknown> | null;
  const aiAnalyzedAt = oppRecord.ai_analyzed_at as string | null;

  const emptyOoda = { observe: { summary: "", items: [] }, orient: { summary: "", items: [] }, decide: { summary: "", options: [] }, act: { summary: "", next_steps: [] } };
  const emptyAnalysis = { executive_summary: "", strengths: [], risks: [], competitive_landscape: null, relevance_rationale: null, recommended_action: null, confidence: null, last_analyzed_at: null, analyst_feedback: null, analysis_version: "1.0" };

  const oodaData = storedOoda ?? emptyOoda;
  const analysisData = storedAnalysis
    ? { ...emptyAnalysis, ...storedAnalysis, last_analyzed_at: aiAnalyzedAt }
    : emptyAnalysis;

  const hasAnalysis = !!storedAnalysis;
  const hasOoda = !!storedOoda;

  return res.json(
    successEnvelope(
      "gda-opportunity-detail",
      "read",
      {
        opportunity: opp,
        analysis: analysisData,
        ooda: oodaData,
        sources: [],
        learning: { learning_notes: null, feedback_submitted: false, feedback_at: null, source_count: 0, coverage_gaps: [], next_review_at: null },
        source,
      },
      {
        requestedAt,
        respondedAt,
        opportunityId: id,
        sourceCount: 0,
        analysisGeneratedAt: aiAnalyzedAt,
        coverageFlags: {
          hasAnalysis,
          hasOoda,
          hasSources: false,
          hasLearning: false,
        },
      }
    )
  );
});

// ---------------------------------------------------------------------------
// POST /api/opportunities/:id/analyze — trigger AI OODA analysis on demand
// ---------------------------------------------------------------------------
router.post("/:id/analyze", requireRole("admin", "bd_manager", "capture_lead"), async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json(
        errorEnvelope("gda-opportunities", "analyze", { code: "DB_UNAVAILABLE", message: "Database not available", detail: null }),
      );
    }

    const id = req.params.id;

    // Ensure the opportunity exists in the local DB before scoring.
    // Many opportunities are sourced from n8n/SAM.gov and only exist there
    // until they're explicitly persisted (e.g., stage change, analysis).
    const existing = await pool.query("SELECT id FROM opportunities WHERE id = $1", [id]);
    if (existing.rows.length === 0 && n8nWebhookConfigured()) {
      const n8nOpp = await fetchOpportunityDetailFromN8n(id);
      if (n8nOpp) {
        const now = new Date().toISOString();
        await pool.query(
          `INSERT INTO opportunities (id, title, agency, department, status, score, value_estimated, probability_of_win, naics, due_date, solicitation_number, set_aside, place_of_performance, data_source, description, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)
           ON CONFLICT (id) DO NOTHING`,
          [n8nOpp.id, n8nOpp.title, n8nOpp.agency, n8nOpp.department, "discovery", n8nOpp.score, n8nOpp.value_estimated, n8nOpp.probability_of_win, n8nOpp.naics, n8nOpp.due_date, n8nOpp.solicitation_number, n8nOpp.set_aside, n8nOpp.place_of_performance, n8nOpp.data_source, n8nOpp.description ?? null, now],
        );
      } else {
        return res.status(404).json(
          errorEnvelope("gda-opportunities", "analyze", { code: "NOT_FOUND", message: `Opportunity ${id} not found`, detail: null }),
        );
      }
    } else if (existing.rows.length === 0) {
      return res.status(404).json(
        errorEnvelope("gda-opportunities", "analyze", { code: "NOT_FOUND", message: `Opportunity ${id} not found`, detail: null }),
      );
    }

    // Score this specific opportunity via dedicated single-opp scorer
    const { scoreSingleOpportunity } = await import("../agents/opportunity-watch");
    const scored = await scoreSingleOpportunity(id);

    if (!scored) {
      return res.status(500).json(
        errorEnvelope("gda-opportunities", "analyze", { code: "ANALYSIS_FAILED", message: "AI could not parse analysis results", detail: null }),
      );
    }

    res.json(successEnvelope("gda-opportunities", "analyze", {
      message: "AI analysis complete",
      score: scored.score,
      classification: scored.classification,
      pwin: scored.score / 100,
    }));
  } catch (e) {
    res.status(500).json(
      errorEnvelope("gda-opportunities", "analyze", { code: "ANALYSIS_ERROR", message: (e as Error).message, detail: null }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/opportunities/quick-create — create a new opportunity (Quick Entry)
// ---------------------------------------------------------------------------
router.post("/quick-create", requireRole("admin", "bd_manager", "capture_lead"), async (req, res) => {
  const { title, agency, department, value_estimated } = req.body as {
    title?: string;
    agency?: string;
    department?: string;
    value_estimated?: number;
  };

  if (!title) {
    return res.status(400).json(
      errorEnvelope("gda-opportunities", "quick-create", { code: "BAD_REQUEST", message: "title is required", detail: null }),
    );
  }

  const pool = getPool();
  if (!pool) {
    return res.status(500).json(
      errorEnvelope("gda-opportunities", "quick-create", { code: "DB_UNAVAILABLE", message: "Database not available", detail: null }),
    );
  }

  try {
    const id = `opp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO opportunities (id, title, agency, department, status, score, value_estimated, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $7)`,
      [id, title, agency ?? null, department ?? null, "discovery", value_estimated ?? null, now],
    );
    // Record initial version
    const userId = req.user?.userId ?? "system";
    const { rows: created } = await pool.query("SELECT * FROM opportunities WHERE id = $1", [id]);
    if (created[0]) {
      await recordVersion("opportunities", id, created[0], userId, "create");
    }

    // Auto-trigger Capture Coach for newly created opportunity (fire-and-forget)
    queueCaptureCoachIfNeeded(id);

    res.json(successEnvelope("gda-opportunities", "quick-create", { id, title }));
  } catch (e) {
    res.status(500).json(
      errorEnvelope("gda-opportunities", "quick-create", { code: "INTERNAL", message: (e as Error).message, detail: null }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/opportunities/:id/qualify — S-007/S-008 safety-gated write
// ---------------------------------------------------------------------------
router.post("/:id/qualify", requireRole("admin", "bd_manager"), async (req, res) => {
  const { id } = req.params;
  const dryRun = req.body.dryRun !== false; // default true for safety
  const approve = req.body.approve === true;
  const writesEnabled = process.env.QUALIFY_WRITES_ENABLED === "true";

  // Generate correlation ID per S-008 spec
  const correlationId = `GDA-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const pool = getPool();

  // --- Dry-run path ---
  if (dryRun) {
    let opp: Opportunity | undefined;

    if (pool) {
      try {
        const result = await pool.query(
          "SELECT id, title, status FROM opportunities WHERE id = $1",
          [id]
        );
        if (result.rows.length > 0) {
          opp = result.rows[0] as Opportunity;
        }
      } catch {
        // Fall through to mock
      }
    }

    if (!opp) {
      return res.status(404).json(
        errorEnvelope(
          "gda-opportunities",
          "qualify",
          {
            code: "OPPORTUNITY_NOT_FOUND",
            message: `No opportunity found for ID: ${id}`,
            detail: null,
          },
          {},
          true
        )
      );
    }

    return res.json(
      successEnvelope(
        "gda-opportunities",
        "qualify",
        {
          opportunity_id: opp.id,
          title: opp.title,
          prev_status: opp.status,
          new_status: "qualified" as const,
          qualified_at: new Date().toISOString(),
          correlation_id: correlationId,
          would_write: false,
          gates: {
            dryRun: true,
            approve,
            writesEnabled,
          },
        },
        { correlation_id: correlationId },
        true
      )
    );
  }

  // --- Real write path ---

  // Gate 1: writes must be enabled
  if (!writesEnabled) {
    return res.status(400).json(
      errorEnvelope(
        "gda-opportunities",
        "qualify",
        {
          code: "WRITES_DISABLED",
          message:
            "QUALIFY_WRITES_ENABLED is false. Set this environment variable to 'true' to allow qualify writes.",
          detail: null,
        },
        { correlation_id: correlationId }
      )
    );
  }

  // Gate 2: explicit approval required
  if (!approve) {
    return res.status(400).json(
      errorEnvelope(
        "gda-opportunities",
        "qualify",
        {
          code: "APPROVAL_REQUIRED",
          message:
            "Qualify writes require approve:true in the request body. Send a dry-run first (dryRun:true) to preview the change.",
          detail: null,
        },
        { correlation_id: correlationId }
      )
    );
  }

  // Gate 3: DB must be configured for real writes
  if (!pool) {
    return res.status(400).json(
      errorEnvelope(
        "gda-opportunities",
        "qualify",
        {
          code: "DB_NOT_CONFIGURED",
          message:
            "DATABASE_URL is not set. Cannot perform real writes without a database connection.",
          detail: null,
        },
        { correlation_id: correlationId }
      )
    );
  }

  try {
    const now = new Date().toISOString();

    // Fetch current state
    const current = await pool.query(
      "SELECT id, title, status FROM opportunities WHERE id = $1",
      [id]
    );
    if (current.rows.length === 0) {
      return res.status(404).json(
        errorEnvelope("gda-opportunities", "qualify", {
          code: "OPPORTUNITY_NOT_FOUND",
          message: `No opportunity found for ID: ${id}`,
          detail: null,
        })
      );
    }

    const prevStatus = current.rows[0].status as OpportunityStatus;
    const title = current.rows[0].title as string;

    // Perform the write
    await pool.query(
      `UPDATE opportunities
       SET status = 'qualified', qualified_at = $2, qualified_by = 'GDA_REBUILD_UI', updated_at = $2
       WHERE id = $1`,
      [id, now]
    );

    // Audit log per S-008 format
    process.stdout.write(
      `[GDA QUALIFY WRITE] correlation_id=${correlationId} | opportunity_id=${id} | title=${title.replace(/\s+/g, "_")} | prev_status=${prevStatus} | new_status=qualified | qualified_at=${now} | triggered_by=GDA_REBUILD_UI\n`
    );

    // Auto-trigger Capture Coach after qualifying (fire-and-forget)
    queueCaptureCoachIfNeeded(id);

    return res.json(
      successEnvelope(
        "gda-opportunities",
        "qualify",
        {
          opportunity_id: id,
          title,
          prev_status: prevStatus,
          new_status: "qualified" as const,
          qualified_at: now,
          correlation_id: correlationId,
        },
        { correlation_id: correlationId }
      )
    );
  } catch (err: unknown) {
    process.stderr.write(
      `[opportunities] qualify error: ${(err as Error).message}\n`
    );
    return res.status(500).json(
      errorEnvelope(
        "gda-opportunities",
        "qualify",
        {
          code: "DB_ERROR",
          message: "Failed to qualify opportunity.",
          detail: null,
        },
        { correlation_id: correlationId }
      )
    );
  }
});

// ---------------------------------------------------------------------------
// PUT /api/opportunities/:id — update opportunity fields (e.g. pursuing_entity_id)
// ---------------------------------------------------------------------------
router.put("/:id", requireRole("admin", "bd_manager"), async (req, res) => {
  const { id } = req.params;
  const pool = getPool();
  if (!pool) {
    return res.status(503).json(errorEnvelope("gda-opportunities", "update", { code: "DB_UNAVAILABLE", message: "Database not configured", detail: null }));
  }

  const { pursuing_entity_id } = req.body;

  try {
    const setClauses: string[] = [];
    const values: unknown[] = [id];
    let idx = 2;

    if (pursuing_entity_id !== undefined) {
      setClauses.push(`pursuing_entity_id = $${idx}`);
      values.push(pursuing_entity_id);
      idx++;
    }

    if (setClauses.length === 0) {
      return res.status(400).json(errorEnvelope("gda-opportunities", "update", { code: "NO_FIELDS", message: "No updatable fields provided", detail: null }));
    }

    setClauses.push(`updated_at = NOW()`);

    const { rows } = await pool.query(
      `UPDATE opportunities SET ${setClauses.join(", ")} WHERE id = $1 RETURNING *`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json(errorEnvelope("gda-opportunities", "update", { code: "NOT_FOUND", message: "Opportunity not found", detail: null }));
    }

    return res.json(successEnvelope("gda-opportunities", "update", rows[0]));
  } catch (err) {
    log.error("opportunity_update_error", { id, error: (err as Error).message });
    return res.status(500).json(errorEnvelope("gda-opportunities", "update", { code: "QUERY_ERROR", message: "Failed to update opportunity", detail: null }));
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/opportunities/:id/stage — change Shipley capture stage
// ---------------------------------------------------------------------------
router.patch("/:id/stage", requireRole("admin", "bd_manager"), async (req, res) => {
  const { id } = req.params;
  const { stage } = req.body as { stage: string };

  if (!stage || !SHIPLEY_STAGES.includes(stage as typeof SHIPLEY_STAGES[number])) {
    return res.status(400).json(
      errorEnvelope("gda-opportunities", "change-stage", {
        code: "INVALID_STAGE",
        message: `Invalid stage. Must be one of: ${SHIPLEY_STAGES.join(", ")}`,
        detail: null,
      })
    );
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json(
      errorEnvelope("gda-opportunities", "change-stage", {
        code: "NO_DB",
        message: "Database not available",
        detail: null,
      })
    );
  }

  try {
    const now = new Date().toISOString();
    const dbStatus = SHIPLEY_TO_STATUS[stage] ?? "discovery";

    let current = await pool.query("SELECT title, status, capture_stage FROM opportunities WHERE id = $1", [id]);

    // If not found in DB, try to fetch from n8n and upsert so stage can be changed
    if (current.rows.length === 0) {
      const n8nOpp = await fetchOpportunityDetailFromN8n(id);
      if (n8nOpp) {
        await pool.query(
          `INSERT INTO opportunities (id, title, agency, department, status, score, value_estimated, probability_of_win, naics, due_date, solicitation_number, set_aside, place_of_performance, data_source, description, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)
           ON CONFLICT (id) DO NOTHING`,
          [n8nOpp.id, n8nOpp.title, n8nOpp.agency, n8nOpp.department, "discovery", n8nOpp.score, n8nOpp.value_estimated, n8nOpp.probability_of_win, n8nOpp.naics, n8nOpp.due_date, n8nOpp.solicitation_number, n8nOpp.set_aside, n8nOpp.place_of_performance, n8nOpp.data_source, n8nOpp.description ?? null, now]
        );
        current = await pool.query("SELECT title, status, capture_stage FROM opportunities WHERE id = $1", [id]);
      }
      if (current.rows.length === 0) {
        return res.status(404).json(
          errorEnvelope("gda-opportunities", "change-stage", {
            code: "NOT_FOUND",
            message: `Opportunity ${id} not found`,
            detail: null,
          })
        );
      }
    }

    const prevStatus = current.rows[0].status;
    const prevStage = current.rows[0].capture_stage;
    const title = current.rows[0].title;

    await pool.query(
      `UPDATE opportunities
       SET status = $2, capture_stage = $3, updated_at = $4,
           qualified_at = CASE WHEN $3 IN ('qualify','pursue','solicitation','post_submittal') AND qualified_at IS NULL THEN $4 ELSE qualified_at END,
           qualified_by = CASE WHEN $3 IN ('qualify','pursue','solicitation','post_submittal') AND qualified_by IS NULL THEN 'GDA_STAGE_CHANGE' ELSE qualified_by END
       WHERE id = $1`,
      [id, dbStatus, stage, now]
    );

    process.stdout.write(
      `[GDA STAGE CHANGE] opportunity_id=${id} | title=${title.replace(/\s+/g, "_")} | prev_status=${prevStatus} | prev_stage=${prevStage} | new_stage=${stage} | new_status=${dbStatus}\n`
    );

    // Record version after stage change
    const userId = req.user?.userId ?? "system";
    const { rows: updatedRows } = await pool.query("SELECT * FROM opportunities WHERE id = $1", [id]);
    if (updatedRows[0]) {
      await recordVersion("opportunities", id, updatedRows[0], userId, "update");
    }

    // Auto-trigger Capture Coach after stage change (fire-and-forget)
    queueCaptureCoachIfNeeded(id);

    return res.json(
      successEnvelope("gda-opportunities", "change-stage", {
        opportunity_id: id,
        title,
        prev_status: prevStatus,
        prev_stage: prevStage,
        new_stage: stage,
        new_status: dbStatus,
      })
    );
  } catch (err: unknown) {
    process.stderr.write(`[opportunities] stage change error: ${(err as Error).message}\n`);
    return res.status(500).json(
      errorEnvelope("gda-opportunities", "change-stage", {
        code: "DB_ERROR",
        message: "Failed to change stage.",
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/opportunities/:id/timeline — activity timeline for an opportunity
// ---------------------------------------------------------------------------
router.get("/:id/timeline", async (req, res) => {
  const { id } = req.params;
  const pool = getPool();

  if (!pool) {
    return res.json(
      successEnvelope("gda-opportunities", "timeline", { events: [] })
    );
  }

  try {
    const versionRows = await pool.query(
      `SELECT id, change_type, changed_by, created_at, snapshot
       FROM record_versions
       WHERE table_name = 'opportunities' AND record_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [id]
    );

    const events = versionRows.rows.map((r: { id: string; change_type: string; changed_by: string; created_at: string; snapshot: Record<string, unknown> }) => ({
      id: r.id,
      type: r.change_type,
      actor: r.changed_by,
      timestamp: r.created_at,
      summary: r.change_type === "create"
        ? "Opportunity created"
        : `Updated by ${r.changed_by}`,
      snapshot_keys: Object.keys(r.snapshot ?? {}),
    }));

    res.json(
      successEnvelope("gda-opportunities", "timeline", { events })
    );
  } catch (err) {
    res.status(500).json(
      errorEnvelope("gda-opportunities", "timeline", {
        code: "INTERNAL",
        message: "Failed to load timeline.",
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/opportunities/analytics — aggregate analytics for the index page
// ---------------------------------------------------------------------------
router.get("/analytics", async (_req, res) => {
  const pool = getPool();
  if (!pool) {
    res.status(503).json(errorEnvelope("gda-opportunities", "analytics", { code: "DB_UNAVAILABLE", message: "Database not configured", detail: null }));
    return;
  }

  try {
    // 1. Pipeline value by vehicle type
    const byVehicle = await pool.query(
      `SELECT COALESCE(vehicle_type::text, 'unclassified') AS vehicle_type,
              COUNT(*)::int AS count,
              COALESCE(SUM(value_estimated), 0) AS total_value
       FROM opportunities
       WHERE deleted_at IS NULL AND status NOT IN ('lost', 'no_bid', 'gov_cancelled')
       GROUP BY vehicle_type ORDER BY total_value DESC`
    );

    // 2. Capture phase funnel (Shipley)
    const funnel = await pool.query(
      `SELECT COALESCE(shipley_phase::text, capture_stage, 'identify') AS phase,
              COUNT(*)::int AS count,
              COALESCE(SUM(value_estimated), 0) AS total_value
       FROM opportunities
       WHERE deleted_at IS NULL
       GROUP BY phase ORDER BY count DESC`
    );

    // 3. Top agencies by count and ceiling
    const topAgencies = await pool.query(
      `SELECT COALESCE(agency, 'Unknown') AS agency,
              COUNT(*)::int AS count,
              COALESCE(SUM(value_estimated), 0) AS total_value
       FROM opportunities
       WHERE deleted_at IS NULL AND status NOT IN ('lost', 'no_bid', 'gov_cancelled')
       GROUP BY agency ORDER BY total_value DESC LIMIT 10`
    );

    // 4. Aging report (no activity in 14+ days)
    const aging = await pool.query(
      `SELECT id, title, EXTRACT(DAY FROM NOW() - updated_at)::int AS days_stale
       FROM opportunities
       WHERE deleted_at IS NULL
         AND status NOT IN ('won', 'lost', 'no_bid', 'gov_cancelled')
         AND updated_at < NOW() - INTERVAL '14 days'
       ORDER BY updated_at ASC LIMIT 20`
    );

    // 5. Win-probability-weighted pipeline
    const weighted = await pool.query(
      `SELECT COALESCE(SUM(value_estimated * COALESCE(probability_of_win, 0)), 0) AS weighted_value,
              COALESCE(SUM(value_estimated), 0) AS total_value,
              COUNT(*)::int AS count
       FROM opportunities
       WHERE deleted_at IS NULL AND status NOT IN ('lost', 'no_bid', 'gov_cancelled')`
    );

    res.json(successEnvelope("gda-opportunities", "analytics", {
      by_vehicle: byVehicle.rows.map((r) => ({ vehicle_type: r.vehicle_type, count: Number(r.count), total_value: Number(r.total_value) })),
      funnel: funnel.rows.map((r) => ({ phase: r.phase, count: Number(r.count), total_value: Number(r.total_value) })),
      top_agencies: topAgencies.rows.map((r) => ({ agency: r.agency, count: Number(r.count), total_value: Number(r.total_value) })),
      aging: aging.rows.map((r) => ({ id: r.id, title: r.title, days_stale: Number(r.days_stale) })),
      weighted_pipeline: {
        weighted_value: Number(weighted.rows[0].weighted_value),
        total_value: Number(weighted.rows[0].total_value),
        count: Number(weighted.rows[0].count),
      },
    }));
  } catch (err) {
    log.error("analytics_error", { error: (err as Error).message });
    res.status(500).json(errorEnvelope("gda-opportunities", "analytics", { code: "QUERY_ERROR", message: "Failed to load analytics", detail: null }));
  }
});

export default router;
