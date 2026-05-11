import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import {
  MOCK_SHRED_JOBS,
  ALL_MOCK_REQUIREMENTS,
  MOCK_COMPLIANCE_MAP_SJ001,
  MOCK_RESPONSE_OUTLINE_SJ001,
} from "../data/rfp-shredder-mock";
import type {
  ShredJob,
  ShredJobStatus,
  ExtractedRequirement,
  RequirementType,
  ComplianceMatchLevel,
  RequirementComplexity,
} from "@gda/shared";
import { isLLMAvailable, chatCompletion, SYSTEM_PROMPTS } from "../lib/llm";

const router = Router();

const WF = "GDA.api.rfp-shredder";

// ---------------------------------------------------------------------------
// GET /api/rfp-shredder/jobs — list all shred jobs with optional filters
// ---------------------------------------------------------------------------
router.get("/jobs", (req, res) => {
  try {
    let items: ShredJob[] = [...MOCK_SHRED_JOBS];
    const { status, search, agency } = req.query;

    if (status && typeof status === "string") {
      items = items.filter((j) => j.status === status);
    }
    if (agency && typeof agency === "string") {
      const q = agency.toLowerCase();
      items = items.filter((j) => j.agency.toLowerCase().includes(q));
    }
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      items = items.filter(
        (j) =>
          j.solicitation_title.toLowerCase().includes(q) ||
          j.agency.toLowerCase().includes(q) ||
          j.file_name.toLowerCase().includes(q),
      );
    }

    // Summary stats from full set
    const all = MOCK_SHRED_JOBS;
    const completed = all.filter((j) => j.status === "completed").length;
    const processing = all.filter((j) => j.status === "processing").length;
    const failed = all.filter((j) => j.status === "failed").length;
    const queued = all.filter((j) => j.status === "queued").length;
    const totalRequirements = all
      .filter((j) => j.status === "completed")
      .reduce((sum, j) => sum + j.requirements_found, 0);
    const totalPages = all.reduce((sum, j) => sum + j.page_count, 0);

    res.json(
      successEnvelope(WF, "list-jobs", {
        jobs: items,
        summary: {
          total: all.length,
          completed,
          processing,
          failed,
          queued,
          total_requirements: totalRequirements,
          total_pages: totalPages,
        },
      }),
    );
  } catch (err) {
    res.status(500).json(
      errorEnvelope(WF, "list-jobs", {
        code: "INTERNAL",
        message: (err as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/rfp-shredder/jobs/:id — single shred job detail
// ---------------------------------------------------------------------------
router.get("/jobs/:id", (req, res) => {
  try {
    const job = MOCK_SHRED_JOBS.find((j) => j.id === req.params.id);
    if (!job) {
      return res.status(404).json(
        errorEnvelope(WF, "get-job", {
          code: "NOT_FOUND",
          message: `Shred job ${req.params.id} not found`,
          detail: null,
        }),
      );
    }
    res.json(successEnvelope(WF, "get-job", job));
  } catch (err) {
    res.status(500).json(
      errorEnvelope(WF, "get-job", {
        code: "INTERNAL",
        message: (err as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/rfp-shredder/shred — initiate a shred job (LLM-powered extraction)
// ---------------------------------------------------------------------------
router.post("/shred", async (req, res) => {
  try {
    const { file_name, solicitation_title, agency, document_text } = req.body;

    if (!file_name || !solicitation_title) {
      return res.status(400).json(
        errorEnvelope(WF, "shred", {
          code: "VALIDATION",
          message: "file_name and solicitation_title are required",
          detail: null,
        }),
      );
    }

    const correlationId = `GDA-SHRED-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const jobId = `SJ-${Date.now()}`;

    if (!isLLMAvailable() || !document_text) {
      // Fallback when no LLM or no document text provided
      return res.json(
        successEnvelope(
          WF,
          "shred",
          {
            id: jobId,
            file_name,
            solicitation_title,
            agency: agency ?? "Unknown",
            status: "queued",
            correlation_id: correlationId,
            message: document_text
              ? "Set OPENAI_API_KEY to enable AI-powered requirement extraction."
              : "Shred job queued. Provide document_text in the request body for AI extraction, or upload the document via the n8n pipeline.",
            estimated_processing_time: "3-5 minutes",
            pipeline: "GDA.batch.doc-ingest → GDA.api.rfp-shredder → GDA.api.compliance-matrix",
          },
          {},
          true,
        ),
      );
    }

    // Real LLM extraction
    const truncatedText = document_text.slice(0, 12000);
    const llmResponse = await chatCompletion(
      [
        { role: "system", content: SYSTEM_PROMPTS.rfpShredder },
        {
          role: "user",
          content: `Extract all structured requirements from this solicitation document.\n\nSolicitation: ${solicitation_title}\nAgency: ${agency ?? "Unknown"}\n\n--- DOCUMENT TEXT ---\n${truncatedText}`,
        },
      ],
      { temperature: 0.2, max_tokens: 3000, response_format: { type: "json_object" } },
    );

    let extractedRequirements: Array<Record<string, unknown>> = [];
    try {
      const parsed = JSON.parse(llmResponse.content);
      extractedRequirements = Array.isArray(parsed.requirements) ? parsed.requirements : Array.isArray(parsed) ? parsed : [];
    } catch {
      extractedRequirements = [];
    }

    res.json(
      successEnvelope(WF, "shred", {
        id: jobId,
        file_name,
        solicitation_title,
        agency: agency ?? "Unknown",
        status: "completed",
        correlation_id: correlationId,
        requirements_count: extractedRequirements.length,
        requirements: extractedRequirements,
        ai: { model: llmResponse.model, tokens: llmResponse.usage.total_tokens },
      }),
    );
  } catch (err) {
    res.status(500).json(
      errorEnvelope(WF, "shred", {
        code: "INTERNAL",
        message: (err as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/rfp-shredder/requirements — extracted requirements (optionally by job)
// ---------------------------------------------------------------------------
router.get("/requirements", (req, res) => {
  try {
    let items: ExtractedRequirement[] = [...ALL_MOCK_REQUIREMENTS];
    const { job_id, type, complexity, match, search, sort } = req.query;

    if (job_id && typeof job_id === "string") {
      items = items.filter((r) => r.shred_job_id === job_id);
    }
    if (type && typeof type === "string") {
      items = items.filter((r) => r.requirement_type === type);
    }
    if (complexity && typeof complexity === "string") {
      items = items.filter((r) => r.complexity === complexity);
    }
    if (match && typeof match === "string") {
      items = items.filter((r) => r.compliance_match === match);
    }
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      items = items.filter(
        (r) =>
          r.requirement_text.toLowerCase().includes(q) ||
          r.section.toLowerCase().includes(q) ||
          (r.matched_evidence && r.matched_evidence.toLowerCase().includes(q)),
      );
    }

    // Sort
    if (sort === "section") {
      items.sort((a, b) => a.section.localeCompare(b.section));
    } else if (sort === "confidence") {
      items.sort((a, b) => b.confidence - a.confidence);
    } else if (sort === "complexity") {
      const order: Record<string, number> = { complex: 0, moderate: 1, simple: 2 };
      items.sort((a, b) => (order[a.complexity] ?? 1) - (order[b.complexity] ?? 1));
    } else if (sort === "match") {
      const order: Record<string, number> = { none: 0, partial: 1, full: 2 };
      items.sort((a, b) => (order[a.compliance_match] ?? 1) - (order[b.compliance_match] ?? 1));
    }

    // Summary breakdown
    const full = items.filter((r) => r.compliance_match === "full").length;
    const partial = items.filter((r) => r.compliance_match === "partial").length;
    const none = items.filter((r) => r.compliance_match === "none").length;

    const types: Record<string, number> = {};
    for (const r of items) {
      types[r.requirement_type] = (types[r.requirement_type] ?? 0) + 1;
    }

    const complexities: Record<string, number> = {};
    for (const r of items) {
      complexities[r.complexity] = (complexities[r.complexity] ?? 0) + 1;
    }

    res.json(
      successEnvelope(WF, "list-requirements", {
        requirements: items,
        summary: {
          total: items.length,
          full_match: full,
          partial_match: partial,
          no_match: none,
          by_type: types,
          by_complexity: complexities,
          avg_confidence: items.length > 0
            ? Math.round((items.reduce((s, r) => s + r.confidence, 0) / items.length) * 100) / 100
            : 0,
        },
      }),
    );
  } catch (err) {
    res.status(500).json(
      errorEnvelope(WF, "list-requirements", {
        code: "INTERNAL",
        message: (err as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/rfp-shredder/compliance-map/:jobId — compliance mapping for a job
// ---------------------------------------------------------------------------
router.get("/compliance-map/:jobId", (req, res) => {
  try {
    const jobId = req.params.jobId;
    const job = MOCK_SHRED_JOBS.find((j) => j.id === jobId);

    if (!job) {
      return res.status(404).json(
        errorEnvelope(WF, "compliance-map", {
          code: "NOT_FOUND",
          message: `Shred job ${jobId} not found`,
          detail: null,
        }),
      );
    }

    if (job.status !== "completed") {
      return res.status(400).json(
        errorEnvelope(WF, "compliance-map", {
          code: "NOT_READY",
          message: `Shred job ${jobId} has status '${job.status}' — compliance mapping requires completed shred`,
          detail: null,
        }),
      );
    }

    // Only SJ-001 has compliance map in mock data
    const entries = jobId === "SJ-001" ? MOCK_COMPLIANCE_MAP_SJ001 : [];

    const full = entries.filter((e) => e.match_level === "full").length;
    const partial = entries.filter((e) => e.match_level === "partial").length;
    const none = entries.filter((e) => e.match_level === "none").length;
    const coverage = entries.length > 0
      ? Math.round(((full + partial * 0.5) / entries.length) * 100)
      : 0;

    res.json(
      successEnvelope(WF, "compliance-map", {
        job_id: jobId,
        solicitation_title: job.solicitation_title,
        entries,
        summary: {
          total: entries.length,
          full_match: full,
          partial_match: partial,
          no_match: none,
          coverage_score: coverage,
        },
      }),
    );
  } catch (err) {
    res.status(500).json(
      errorEnvelope(WF, "compliance-map", {
        code: "INTERNAL",
        message: (err as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/rfp-shredder/response-outline/:jobId — response outline for a job
// ---------------------------------------------------------------------------
router.get("/response-outline/:jobId", (req, res) => {
  try {
    const jobId = req.params.jobId;
    const job = MOCK_SHRED_JOBS.find((j) => j.id === jobId);

    if (!job) {
      return res.status(404).json(
        errorEnvelope(WF, "response-outline", {
          code: "NOT_FOUND",
          message: `Shred job ${jobId} not found`,
          detail: null,
        }),
      );
    }

    if (job.status !== "completed") {
      return res.status(400).json(
        errorEnvelope(WF, "response-outline", {
          code: "NOT_READY",
          message: `Shred job ${jobId} has status '${job.status}' — response outline requires completed shred`,
          detail: null,
        }),
      );
    }

    // Only SJ-001 has outline in mock data
    const sections = jobId === "SJ-001" ? MOCK_RESPONSE_OUTLINE_SJ001 : [];

    const totalPages = sections.reduce((s, sec) => s + sec.page_estimate, 0);
    const reusable = sections.filter((s) => s.status === "reuse_available").length;
    const drafts = sections.filter((s) => s.status === "draft_available").length;
    const newContent = sections.filter((s) => s.status === "needs_new_content").length;

    res.json(
      successEnvelope(WF, "response-outline", {
        job_id: jobId,
        solicitation_title: job.solicitation_title,
        sections,
        summary: {
          total_sections: sections.length,
          total_page_estimate: totalPages,
          reuse_available: reusable,
          draft_available: drafts,
          needs_new_content: newContent,
        },
      }),
    );
  } catch (err) {
    res.status(500).json(
      errorEnvelope(WF, "response-outline", {
        code: "INTERNAL",
        message: (err as Error).message,
        detail: null,
      }),
    );
  }
});

export default router;
