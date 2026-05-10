import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
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
router.get("/templates", (req, res) => {
  try {
    let items = [...MOCK_REPORT_TEMPLATES];
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
          t.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }

    const all = MOCK_REPORT_TEMPLATES;
    const categoryCounts: Record<string, number> = {};
    for (const t of all) {
      categoryCounts[t.category] = (categoryCounts[t.category] ?? 0) + 1;
    }

    res.json(
      successEnvelope("GDA.reports", "list-templates", {
        templates: items,
        total: all.length,
        filtered: items.length,
        summary: {
          categoryCounts,
          totalUses: all.reduce((sum, t) => sum + t.use_count, 0),
          categories: Object.keys(categoryCounts).length,
        },
        source: "mock" as const,
      }),
    );
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.reports", "list-templates", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// GET /api/reports/templates/:id — single template detail
// ---------------------------------------------------------------------------
router.get("/templates/:id", (req, res) => {
  try {
    const template = MOCK_REPORT_TEMPLATES.find((t) => t.id === req.params.id);
    if (!template) {
      return res.status(404).json(
        errorEnvelope("GDA.reports", "get-template", {
          code: "NOT_FOUND",
          message: `Template ${req.params.id} not found`,
          detail: null,
        }),
      );
    }
    res.json(successEnvelope("GDA.reports", "get-template", { template, source: "mock" as const }));
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.reports", "get-template", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// GET /api/reports/generated — list generated reports with filters
// ---------------------------------------------------------------------------
router.get("/generated", (req, res) => {
  try {
    let items = [...MOCK_GENERATED_REPORTS];
    const { category, status, format, search } = req.query;

    if (category && typeof category === "string") {
      items = items.filter((r) => r.category === (category as ReportCategory));
    }
    if (status && typeof status === "string") {
      items = items.filter((r) => r.status === (status as ReportStatus));
    }
    if (format && typeof format === "string") {
      items = items.filter((r) => r.format === (format as ExportFormat));
    }
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      items = items.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.template_name.toLowerCase().includes(q) ||
          (r.notes ?? "").toLowerCase().includes(q),
      );
    }

    // Sort newest first
    items.sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime());

    const all = MOCK_GENERATED_REPORTS;
    const statusCounts: Record<string, number> = {};
    for (const r of all) {
      statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
    }

    const categoryCounts: Record<string, number> = {};
    for (const r of all) {
      categoryCounts[r.category] = (categoryCounts[r.category] ?? 0) + 1;
    }

    const totalSizeBytes = all.reduce((sum, r) => sum + (r.file_size_bytes ?? 0), 0);

    res.json(
      successEnvelope("GDA.reports", "list-generated", {
        reports: items,
        total: all.length,
        filtered: items.length,
        summary: {
          statusCounts,
          categoryCounts,
          totalSizeBytes,
        },
        source: "mock" as const,
      }),
    );
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.reports", "list-generated", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// POST /api/reports/generate — trigger report generation (dry-run)
// ---------------------------------------------------------------------------
router.post("/generate", (req, res) => {
  try {
    const { template_id, format, sections } = req.body as {
      template_id?: string;
      format?: ExportFormat;
      sections?: string[];
    };

    if (!template_id) {
      return res.status(400).json(
        errorEnvelope("GDA.reports", "generate", {
          code: "BAD_REQUEST",
          message: "template_id is required",
          detail: null,
        }),
      );
    }

    const template = MOCK_REPORT_TEMPLATES.find((t) => t.id === template_id);
    if (!template) {
      return res.status(404).json(
        errorEnvelope("GDA.reports", "generate", {
          code: "NOT_FOUND",
          message: `Template ${template_id} not found`,
          detail: null,
        }),
      );
    }

    const resolvedFormat = format ?? template.default_format;
    const resolvedSections = sections ?? template.sections.filter((s) => s.included).map((s) => s.title);

    const correlationId = `GDA-RPT-${Date.now().toString(36)}`;

    res.json(
      successEnvelope(
        "GDA.reports",
        "generate",
        {
          status: "accepted",
          correlation_id: correlationId,
          template_id: template.id,
          template_name: template.name,
          format: resolvedFormat,
          sections_included: resolvedSections,
          estimated_pages: template.estimated_pages,
          message: `Report generation queued. Template: ${template.name}, Format: ${resolvedFormat.toUpperCase()}, Sections: ${resolvedSections.length}`,
        },
        {},
        true, // dryRun
      ),
    );
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.reports", "generate", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// GET /api/reports/scheduled — list scheduled reports
// ---------------------------------------------------------------------------
router.get("/scheduled", (_req, res) => {
  try {
    const items = [...MOCK_SCHEDULED_REPORTS];
    const enabled = items.filter((s) => s.enabled).length;
    const disabled = items.filter((s) => !s.enabled).length;

    res.json(
      successEnvelope("GDA.reports", "list-scheduled", {
        schedules: items,
        total: items.length,
        summary: { enabled, disabled },
        source: "mock" as const,
      }),
    );
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.reports", "list-scheduled", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// GET /api/reports/exports — list export jobs
// ---------------------------------------------------------------------------
router.get("/exports", (_req, res) => {
  try {
    const items = [...MOCK_EXPORT_JOBS].sort(
      (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    );

    res.json(
      successEnvelope("GDA.reports", "list-exports", {
        exports: items,
        total: items.length,
        source: "mock" as const,
      }),
    );
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.reports", "list-exports", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// POST /api/reports/export — trigger ad-hoc export (dry-run)
// ---------------------------------------------------------------------------
router.post("/export", (req, res) => {
  try {
    const { source_page, format } = req.body as {
      source_page?: string;
      format?: ExportFormat;
    };

    if (!source_page || !format) {
      return res.status(400).json(
        errorEnvelope("GDA.reports", "export", {
          code: "BAD_REQUEST",
          message: "source_page and format are required",
          detail: null,
        }),
      );
    }

    const correlationId = `GDA-EXP-${Date.now().toString(36)}`;

    res.json(
      successEnvelope(
        "GDA.reports",
        "export",
        {
          status: "accepted",
          correlation_id: correlationId,
          source_page: source_page,
          format,
          message: `Export queued: ${source_page} → ${format.toUpperCase()}`,
        },
        {},
        true, // dryRun
      ),
    );
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.reports", "export", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

export default router;
