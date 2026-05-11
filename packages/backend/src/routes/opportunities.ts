import { Router } from "express";
import type { Opportunity, OpportunityStatus } from "@gda/shared";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { requireRole } from "../lib/auth";
import {
  getMockOpportunities,
  getMockOpportunityById,
} from "../data/opportunities-mock";
import { getMockOpportunityDetail } from "../data/opportunity-detail-mock";
import {
  n8nWebhookConfigured,
  fetchOpsTrackerFromN8n,
  fetchPipelineFromN8n,
} from "../lib/n8n-data";

const router = Router();

const VALID_STATUSES: OpportunityStatus[] = [
  "discovery",
  "qualified",
  "pipeline",
  "lost",
  "won",
];

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

  // --- Helper: apply filters & sort to in-memory opportunity array ---
  function filterAndSort(rows: Opportunity[]): Opportunity[] {
    let filtered = [...rows];
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
    // 3. Mock fallback
    const rows = filterAndSort(getMockOpportunities());
    return res.json(
      successEnvelope(
        "gda-opportunities",
        "list",
        { opportunities: rows, source: "mock" as const },
        {
          count: rows.length,
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
    const rows: Opportunity[] = result.rows.map((r) => ({
      ...r,
      score: parseFloat(r.score) || 0,
      value_estimated: r.value_estimated ? parseFloat(r.value_estimated) : null,
      probability_of_win: r.probability_of_win ? parseFloat(r.probability_of_win) : null,
    }));

    return res.json(
      successEnvelope(
        "gda-opportunities",
        "list",
        { opportunities: rows, source: "db" as const },
        {
          count: rows.length,
          filters_applied: { search, status: statusFilter, department: deptFilter, minPwin },
        }
      )
    );
  } catch (err: unknown) {
    process.stderr.write(`[opportunities] query error: ${(err as Error).message}\n`);
    return res.status(500).json(
      errorEnvelope("gda-opportunities", "list", {
        code: "DB_ERROR",
        message: "Failed to query opportunities.",
        detail: null,
      })
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
    // 3. Mock fallback — filter pipeline-status opportunities
    const rows = pipelineFilterAndSort(
      getMockOpportunities().filter((o) => o.status === "pipeline")
    );
    return res.json(
      successEnvelope(
        "gda-opportunities",
        "pipeline-list",
        { opportunities: rows, source: "mock" as const },
        {
          count: rows.length,
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
    return res.status(500).json(
      errorEnvelope("gda-opportunities", "pipeline-list", {
        code: "DB_ERROR",
        message: "Failed to query pipeline opportunities.",
        detail: null,
      })
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
  const detail = getMockOpportunityDetail(id);

  if (!detail) {
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
        opportunity: detail.opportunity,
        analysis: detail.analysis,
        ooda: detail.ooda,
        sources: detail.sources,
        learning: detail.learning,
        source: "mock" as const,
      },
      {
        requestedAt,
        respondedAt,
        opportunityId: id,
        sourceCount: detail.sources.length,
        analysisGeneratedAt: detail.analysis.last_analyzed_at,
        coverageFlags: {
          hasAnalysis: true,
          hasOoda: true,
          hasSources: detail.sources.length > 0,
          hasLearning: true,
        },
      }
    )
  );
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
      opp = getMockOpportunityById(id);
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

export default router;
