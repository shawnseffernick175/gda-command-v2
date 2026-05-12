import { Router } from "express";
import type { Opportunity, OpportunityStatus } from "@gda/shared";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { requireRole } from "../lib/auth";

import {
  n8nWebhookConfigured,
  fetchOpsTrackerFromN8n,
  fetchPipelineFromN8n,
  fetchOpportunityDetailFromN8n,
} from "../lib/n8n-data";

const router = Router();

const VALID_STATUSES: OpportunityStatus[] = [
  "discovery",
  "qualified",
  "pipeline",
  "lost",
  "won",
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
  no_bid: "lost",
  gov_cancelled: "lost",
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
  const sortBy = (req.query.sortBy as string) ?? "updated_at";
  const sortDir = (req.query.sortDir as string) === "asc" ? "asc" : "desc";

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
        const rows = filterAndSort(n8nResult.opportunities);
        return res.json(
          successEnvelope(
            "gda-opportunities",
            "list",
            { opportunities: rows, source: "n8n" as const },
            {
              count: rows.length,
              totalAvailable: n8nResult.meta.total,
              filters_applied: { search, status: statusFilter, department: deptFilter, minPwin },
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
    const conditions: string[] = [];
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

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sortColumn = SORTABLE_COLUMNS[sortBy] ?? "updated_at";
    const direction = sortDir === "asc" ? "ASC" : "DESC";

    const sql = `
      SELECT id, title, agency, department, status, score, value_estimated,
             probability_of_win, naics, psc, due_date, solicitation_number,
             set_aside, place_of_performance, incumbent, qualified_at,
             qualified_by, tags, raw_source_url, created_at, updated_at
      FROM opportunities
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
    let rows = enrichWithNaicsSize(rawRows);
    if (naicsSizeFilter === "small" || naicsSizeFilter === "large") {
      rows = rows.filter((o) => o.naics_size === naicsSizeFilter);
    }

    return res.json(
      successEnvelope(
        "gda-opportunities",
        "list",
        { opportunities: rows, source: "db" as const },
        {
          count: rows.length,
          filters_applied: { search, status: statusFilter, department: deptFilter, naics_size: naicsSizeFilter, minPwin },
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

  // --- Helper: apply pipeline filters & sort ---
  function pipelineFilterAndSort(rows: Opportunity[]): Opportunity[] {
    let filtered = [...rows];
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (o) =>
          o.id.toLowerCase().includes(q) || o.title.toLowerCase().includes(q)
      );
    }
    if (deptFilter) {
      filtered = filtered.filter((o) => o.department === deptFilter);
    }
    if (minPwin !== undefined && !isNaN(minPwin)) {
      filtered = filtered.filter(
        (o) => o.probability_of_win !== null && o.probability_of_win >= minPwin
      );
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

  // 1. Try n8n webhook (pipeline-specific endpoint)
  if (n8nWebhookConfigured()) {
    try {
      const n8nResult = await fetchPipelineFromN8n();
      if (n8nResult.ok && n8nResult.opportunities.length > 0) {
        // n8n gda-pipeline webhook already curates pipeline-worthy opportunities;
        // their n8n stages (Qualified, Go/No-Go, Post-Submittal) are more granular
        // than our simple "pipeline" status, so we trust the webhook's curation.
        const rows = pipelineFilterAndSort(n8nResult.opportunities);
        return res.json(
          successEnvelope(
            "gda-opportunities",
            "pipeline-list",
            { opportunities: rows, source: "n8n" as const },
            {
              count: rows.length,
              totalAvailable: n8nResult.meta.count,
              filters_applied: { search, department: deptFilter, minPwin },
            }
          )
        );
      }
    } catch (err: unknown) {
      process.stderr.write(`[opportunities] pipeline n8n fallback: ${(err as Error).message}\n`);
    }
  }

  // 2. Try Postgres
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

  // Real DB query — pipeline status only
  try {
    const conditions: string[] = ["status = 'pipeline'"];
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
             qualified_by, tags, raw_source_url, created_at, updated_at
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
// GET /api/opportunities/:id/detail — S-009 opportunity detail with OODA
// ---------------------------------------------------------------------------
router.get("/:id/detail", async (req, res) => {
  const { id } = req.params;
  const requestedAt = new Date().toISOString();

  const pool = getPool();
  // Try DB for opportunity detail
  let opp: Opportunity | undefined;
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
      if (n8nOpp) opp = n8nOpp;
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

  return res.json(
    successEnvelope(
      "gda-opportunity-detail",
      "read",
      {
        opportunity: opp,
        analysis: { executive_summary: "", strengths: [], risks: [], competitive_landscape: null, relevance_rationale: null, recommended_action: null, confidence: null, last_analyzed_at: null, analyst_feedback: null, analysis_version: "1.0" },
        ooda: { observe: { summary: "", items: [] }, orient: { summary: "", items: [] }, decide: { summary: "", options: [] }, act: { summary: "", next_steps: [] } },
        sources: [],
        learning: { learning_notes: null, feedback_submitted: false, feedback_at: null, source_count: 0, coverage_gaps: [], next_review_at: null },
        source: "db" as const,
      },
      {
        requestedAt,
        respondedAt,
        opportunityId: id,
        sourceCount: 0,
        analysisGeneratedAt: null,
        coverageFlags: {
          hasAnalysis: false,
          hasOoda: false,
          hasSources: false,
          hasLearning: false,
        },
      }
    )
  );
});

// ---------------------------------------------------------------------------
// POST /api/opportunities/quick-create — create a new opportunity (Quick Entry)
// ---------------------------------------------------------------------------
router.post("/quick-create", requireRole("admin", "bd_manager", "capture_lead"), async (req, res) => {
  const { title, agency, department, status, value_estimated } = req.body as {
    title?: string;
    agency?: string;
    department?: string;
    status?: string;
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
      [id, title, agency ?? null, department ?? null, status ?? "discovery", value_estimated ?? null, now],
    );
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

    const current = await pool.query("SELECT title, status, capture_stage FROM opportunities WHERE id = $1", [id]);
    if (current.rows.length === 0) {
      return res.status(404).json(
        errorEnvelope("gda-opportunities", "change-stage", {
          code: "NOT_FOUND",
          message: `Opportunity ${id} not found`,
          detail: null,
        })
      );
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

export default router;
