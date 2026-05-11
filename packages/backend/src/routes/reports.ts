import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import {
  MOCK_REPORT_TEMPLATES,
  MOCK_GENERATED_REPORTS,
  MOCK_SCHEDULED_REPORTS,
  MOCK_EXPORT_JOBS,
} from "../data/reports-mock";
import type { ReportCategory, ExportFormat, ReportStatus } from "@gda/shared";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/reports/templates — list report templates with filters
// ---------------------------------------------------------------------------
router.get("/templates", async (req, res) => {
  try {
    const pool = getPool();
    let allTemplates = MOCK_REPORT_TEMPLATES;

    if (pool) {
      try {
        const result = await pool.query("SELECT * FROM report_templates ORDER BY use_count DESC");
        if (result.rows.length > 0) {
          allTemplates = result.rows.map((r) => ({
            ...r,
            created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
          }));
        }
      } catch { /* fall through */ }
    }

    let items = [...allTemplates];
    const { category, search } = req.query;

    if (category && typeof category === "string") {
      items = items.filter((t) => t.category === category);
    }
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      items = items.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.some((tag: string) => tag.toLowerCase().includes(q)),
      );
    }

    const categoryCounts: Record<string, number> = {};
    for (const t of allTemplates) {
      categoryCounts[t.category] = (categoryCounts[t.category] ?? 0) + 1;
    }

    res.json(
      successEnvelope("GDA.reports", "list-templates", {
        templates: items, total: allTemplates.length, filtered: items.length,
        summary: {
          categoryCounts,
          totalUses: allTemplates.reduce((sum, t) => sum + t.use_count, 0),
          categories: Object.keys(categoryCounts).length,
        },
      }),
    );
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.reports", "list-templates", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// GET /api/reports/templates/:id — single template detail
// ---------------------------------------------------------------------------
router.get("/templates/:id", async (req, res) => {
  try {
    const pool = getPool();

    if (pool) {
      try {
        const result = await pool.query("SELECT * FROM report_templates WHERE id = $1", [req.params.id]);
        if (result.rows.length > 0) {
          const r = result.rows[0];
          return res.json(successEnvelope("GDA.reports", "get-template", {
            template: { ...r, created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at },
          }));
        }
      } catch { /* fall through */ }
    }

    const template = MOCK_REPORT_TEMPLATES.find((t) => t.id === req.params.id);
    if (!template) {
      return res.status(404).json(
        errorEnvelope("GDA.reports", "get-template", { code: "NOT_FOUND", message: `Template ${req.params.id} not found`, detail: null }),
      );
    }
    res.json(successEnvelope("GDA.reports", "get-template", { template }));
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.reports", "get-template", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// GET /api/reports/generated — list generated reports with filters
// ---------------------------------------------------------------------------
router.get("/generated", async (req, res) => {
  try {
    const pool = getPool();
    let allReports = MOCK_GENERATED_REPORTS;

    if (pool) {
      try {
        const result = await pool.query("SELECT * FROM generated_reports ORDER BY generated_at DESC");
        if (result.rows.length > 0) {
          allReports = result.rows.map((r) => ({
            ...r,
            generated_at: r.generated_at instanceof Date ? r.generated_at.toISOString() : r.generated_at,
            expires_at: r.expires_at instanceof Date ? r.expires_at.toISOString() : r.expires_at,
          }));
        }
      } catch { /* fall through */ }
    }

    let items = [...allReports];
    const { category, status, format, search } = req.query;

    if (category && typeof category === "string") items = items.filter((r) => r.category === (category as ReportCategory));
    if (status && typeof status === "string") items = items.filter((r) => r.status === (status as ReportStatus));
    if (format && typeof format === "string") items = items.filter((r) => r.format === (format as ExportFormat));
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      items = items.filter((r) =>
        r.title.toLowerCase().includes(q) ||
        r.template_name.toLowerCase().includes(q) ||
        (r.notes ?? "").toLowerCase().includes(q),
      );
    }

    items.sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime());

    const statusCounts: Record<string, number> = {};
    for (const r of allReports) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;

    const categoryCounts: Record<string, number> = {};
    for (const r of allReports) categoryCounts[r.category] = (categoryCounts[r.category] ?? 0) + 1;

    const totalSizeBytes = allReports.reduce((sum, r) => sum + (r.file_size_bytes ?? 0), 0);

    res.json(
      successEnvelope("GDA.reports", "list-generated", {
        reports: items, total: allReports.length, filtered: items.length,
        summary: { statusCounts, categoryCounts, totalSizeBytes },
      }),
    );
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.reports", "list-generated", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// POST /api/reports/generate — create report job, real DB write
// ---------------------------------------------------------------------------
router.post("/generate", async (req, res) => {
  try {
    const { template_id, format, sections } = req.body as {
      template_id?: string;
      format?: ExportFormat;
      sections?: string[];
    };

    if (!template_id) {
      return res.status(400).json(
        errorEnvelope("GDA.reports", "generate", { code: "BAD_REQUEST", message: "template_id is required", detail: null }),
      );
    }

    const pool = getPool();
    let template: { id: string; name: string; category: string; default_format: string; estimated_pages: number; sections: { title: string; included: boolean }[] } | undefined;

    if (pool) {
      try {
        const result = await pool.query("SELECT * FROM report_templates WHERE id = $1", [template_id]);
        if (result.rows.length > 0) template = result.rows[0];
      } catch { /* fall through */ }
    }

    if (!template) {
      template = MOCK_REPORT_TEMPLATES.find((t) => t.id === template_id) as typeof template;
    }

    if (!template) {
      return res.status(404).json(
        errorEnvelope("GDA.reports", "generate", { code: "NOT_FOUND", message: `Template ${template_id} not found`, detail: null }),
      );
    }

    const resolvedFormat = format ?? template.default_format;
    const resolvedSections = sections ?? template.sections.filter((s) => s.included).map((s) => s.title);
    const correlationId = `GDA-RPT-${Date.now().toString(36)}`;

    if (pool) {
      try {
        const reportId = `rpt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const now = new Date().toISOString();

        await pool.query(
          `INSERT INTO generated_reports (id, template_id, template_name, category, title, status, format, generated_at, generated_by, sections_included, page_count)
           VALUES ($1, $2, $3, $4, $5, 'generating', $6, $7, $8, $9, $10)`,
          [
            reportId, template.id, template.name, template.category,
            `${template.name} — ${now.slice(0, 10)}`, resolvedFormat, now,
            (req as unknown as { user?: { email?: string } }).user?.email ?? "system",
            resolvedSections, template.estimated_pages,
          ],
        );

        return res.json(
          successEnvelope("GDA.reports", "generate", {
            status: "accepted",
            report_id: reportId,
            correlation_id: correlationId,
            template_id: template.id,
            template_name: template.name,
            format: resolvedFormat,
            sections_included: resolvedSections,
            estimated_pages: template.estimated_pages,
          }),
        );
      } catch (err) {
        process.stderr.write(`[reports] generate error: ${(err as Error).message}\n`);
        return res.status(500).json(
          errorEnvelope("GDA.reports", "generate", { code: "DB_ERROR", message: "Failed to create report", detail: null }),
        );
      }
    }

    // Mock fallback
    res.json(
      successEnvelope("GDA.reports", "generate", {
        status: "accepted", correlation_id: correlationId, template_id: template.id,
        template_name: template.name, format: resolvedFormat,
        sections_included: resolvedSections, estimated_pages: template.estimated_pages,
      }, {}, true),
    );
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.reports", "generate", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// GET /api/reports/scheduled — list scheduled reports
// ---------------------------------------------------------------------------
router.get("/scheduled", async (_req, res) => {
  try {
    const pool = getPool();

    if (pool) {
      try {
        const result = await pool.query("SELECT * FROM scheduled_reports ORDER BY created_at DESC");
        if (result.rows.length > 0) {
          const items = result.rows.map((r) => ({
            ...r,
            next_run_at: r.next_run_at instanceof Date ? r.next_run_at.toISOString() : r.next_run_at,
            last_run_at: r.last_run_at instanceof Date ? r.last_run_at.toISOString() : r.last_run_at,
            created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
          }));
          const enabled = items.filter((s: { enabled: boolean }) => s.enabled).length;
          const disabled = items.filter((s: { enabled: boolean }) => !s.enabled).length;
          return res.json(successEnvelope("GDA.reports", "list-scheduled", {
            schedules: items, total: items.length, summary: { enabled, disabled },
          }));
        }
      } catch { /* fall through */ }
    }

    const items = [...MOCK_SCHEDULED_REPORTS];
    const enabled = items.filter((s) => s.enabled).length;
    const disabled = items.filter((s) => !s.enabled).length;

    res.json(successEnvelope("GDA.reports", "list-scheduled", {
      schedules: items, total: items.length, summary: { enabled, disabled },
    }));
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.reports", "list-scheduled", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// GET /api/reports/exports — list export jobs
// ---------------------------------------------------------------------------
router.get("/exports", async (_req, res) => {
  try {
    const pool = getPool();

    if (pool) {
      try {
        const result = await pool.query("SELECT * FROM export_jobs ORDER BY started_at DESC");
        if (result.rows.length > 0) {
          const items = result.rows.map((r) => ({
            ...r,
            started_at: r.started_at instanceof Date ? r.started_at.toISOString() : r.started_at,
            completed_at: r.completed_at instanceof Date ? r.completed_at.toISOString() : r.completed_at,
          }));
          return res.json(successEnvelope("GDA.reports", "list-exports", { exports: items, total: items.length }));
        }
      } catch { /* fall through */ }
    }

    const items = [...MOCK_EXPORT_JOBS].sort(
      (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    );
    res.json(successEnvelope("GDA.reports", "list-exports", { exports: items, total: items.length }));
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.reports", "list-exports", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// POST /api/reports/export — create export job, real DB write
// ---------------------------------------------------------------------------
router.post("/export", async (req, res) => {
  try {
    const { source_page, format } = req.body as {
      source_page?: string;
      format?: ExportFormat;
    };

    if (!source_page || !format) {
      return res.status(400).json(
        errorEnvelope("GDA.reports", "export", { code: "BAD_REQUEST", message: "source_page and format are required", detail: null }),
      );
    }

    const correlationId = `GDA-EXP-${Date.now().toString(36)}`;
    const pool = getPool();

    if (pool) {
      try {
        const exportId = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const now = new Date().toISOString();

        await pool.query(
          `INSERT INTO export_jobs (id, source_page, format, status, started_at, correlation_id)
           VALUES ($1, $2, $3, 'generating', $4, $5)`,
          [exportId, source_page, format, now, correlationId],
        );

        return res.json(
          successEnvelope("GDA.reports", "export", {
            status: "accepted",
            export_id: exportId,
            correlation_id: correlationId,
            source_page,
            format,
          }),
        );
      } catch (err) {
        process.stderr.write(`[reports] export error: ${(err as Error).message}\n`);
        return res.status(500).json(
          errorEnvelope("GDA.reports", "export", { code: "DB_ERROR", message: "Failed to create export", detail: null }),
        );
      }
    }

    // Mock fallback
    res.json(
      successEnvelope("GDA.reports", "export", {
        status: "accepted", correlation_id: correlationId, source_page, format,
        message: `Export queued: ${source_page} → ${format.toUpperCase()}`,
      }, {}, true),
    );
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.reports", "export", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

export default router;
