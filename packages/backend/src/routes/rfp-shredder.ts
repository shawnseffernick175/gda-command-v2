import { Router, Request, Response } from "express";
import multer from "multer";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { requireRole } from "../lib/auth";
import type {
  ShredJob,
  ShredJobStatus,
  ExtractedRequirement,
  RequirementType,
  ComplianceMatchLevel,
  RequirementComplexity,
} from "@gda/shared";
import { isLLMAvailable, chatCompletion, SYSTEM_PROMPTS } from "../lib/llm";
import { getPool } from "../lib/db";
import { log } from "../lib/logger";
import { generateStorageKey, saveFile, isAllowedMimeType, getMaxFileSize } from "../lib/storage";
import { extractText, EXTRACTABLE_MIME_TYPES } from "../lib/extract-text";

const router = Router();

const WF = "GDA.api.rfp-shredder";

// ---------------------------------------------------------------------------
// GET /api/rfp-shredder/jobs — list all shred jobs with optional filters
// ---------------------------------------------------------------------------
router.get("/jobs", async (req, res) => {
  try {
    const pool = getPool();
    let items: ShredJob[] = [];

    if (pool) {
      const conditions: string[] = [];
      const params: string[] = [];
      let idx = 1;
      const { status, search, agency } = req.query;

      if (status && typeof status === "string") {
        conditions.push(`status = $${idx++}`);
        params.push(status);
      }
      if (agency && typeof agency === "string") {
        conditions.push(`agency ILIKE $${idx++}`);
        params.push(`%${agency}%`);
      }
      if (search && typeof search === "string") {
        conditions.push(`(solicitation_title ILIKE $${idx} OR agency ILIKE $${idx} OR file_name ILIKE $${idx})`);
        params.push(`%${search}%`);
        idx++;
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const { rows } = await pool.query(
        `SELECT * FROM shred_jobs ${where} ORDER BY started_at DESC`,
        params,
      );
      items = rows as ShredJob[];
    }

    const completed = items.filter((j) => j.status === "completed").length;
    const processing = items.filter((j) => j.status === "processing").length;
    const failed = items.filter((j) => j.status === "failed").length;
    const queued = items.filter((j) => j.status === "queued").length;
    const totalRequirements = items
      .filter((j) => j.status === "completed")
      .reduce((sum, j) => sum + j.requirements_found, 0);
    const totalPages = items.reduce((sum, j) => sum + j.page_count, 0);

    res.json(
      successEnvelope(WF, "list-jobs", {
        jobs: items,
        summary: {
          total: items.length,
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
router.get("/jobs/:id", async (req, res) => {
  try {
    const pool = getPool();
    let job: ShredJob | undefined;
    if (pool) {
      try {
        const { rows } = await pool.query("SELECT * FROM shred_jobs WHERE id = $1", [req.params.id]);
        if (rows.length > 0) job = rows[0] as ShredJob;
      } catch { /* fall through */ }
    }
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
// Multer config for RFP uploads
// ---------------------------------------------------------------------------
const rfpUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: getMaxFileSize() },
  fileFilter: (_req, file, cb) => {
    if (!EXTRACTABLE_MIME_TYPES.has(file.mimetype)) {
      cb(new Error(`File type ${file.mimetype} is not allowed for RFP shredding. Use PDF, DOC, DOCX, XLSX, XLS, PPTX, TXT, or CSV.`));
      return;
    }
    cb(null, true);
  },
});

// ---------------------------------------------------------------------------
// POST /api/rfp-shredder/shred — initiate a shred job (file upload + LLM)
// ---------------------------------------------------------------------------
router.post(
  "/shred",
  requireRole("admin", "bd_manager", "capture_lead", "analyst"),
  rfpUpload.single("file"),
  async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const { file_name, solicitation_title, agency, document_text } = req.body;

    const effectiveFileName = file ? file.originalname : file_name;

    if (!effectiveFileName || !solicitation_title) {
      res.status(400).json(
        errorEnvelope(WF, "shred", {
          code: "VALIDATION",
          message: "solicitation_title is required. Provide either a file upload or file_name.",
          detail: null,
        }),
      );
      return;
    }

    const correlationId = `GDA-SHRED-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const jobId = `SJ-${Date.now()}`;

    // If file uploaded, store it and link to shred job
    let fileId: string | null = null;
    if (file) {
      const storageKey = generateStorageKey(file.originalname);
      saveFile(storageKey, file.buffer);
      fileId = `file-${Date.now()}`;

      const pool = getPool();
      if (pool) {
        await pool.query(
          `INSERT INTO uploaded_files (id, original_name, storage_key, mime_type, size_bytes, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [fileId, file.originalname, storageKey, file.mimetype, file.size, req.user?.userId ?? null],
        );
        log.info("rfp_file_uploaded", { fileId, fileName: file.originalname, sizeBytes: file.size });
      }
    }

    // Extract text from uploaded file
    let effectiveText = document_text ?? "";
    if (file && !document_text) {
      effectiveText = await extractText(file.buffer, file.mimetype);
    }

    const persistJob = async (status: ShredJobStatus, reqsFound: number, pageCount: number, errorMsg?: string) => {
      const pool = getPool();
      if (!pool) return;
      try {
        await pool.query(
          `INSERT INTO shred_jobs (id, solicitation_title, agency, file_name, file_size_bytes, page_count, status, requirements_found, correlation_id, file_id, error_message, completed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (id) DO UPDATE SET status = $7, requirements_found = $8, error_message = $11, completed_at = $12`,
          [
            jobId,
            solicitation_title,
            agency ?? "Unknown",
            effectiveFileName,
            file ? file.size : null,
            pageCount,
            status,
            reqsFound,
            correlationId,
            fileId,
            errorMsg ?? null,
            status === "queued" || status === "processing" ? null : new Date().toISOString(),
          ],
        );
      } catch (e) {
        log.error("shred_job_persist_error", { jobId, error: (e as Error).message });
      }
    };

    if (!isLLMAvailable() || !effectiveText) {
      await persistJob("queued", 0, 0);
      res.json(
        successEnvelope(
          WF,
          "shred",
          {
            id: jobId,
            file_name: effectiveFileName,
            file_id: fileId,
            solicitation_title,
            agency: agency ?? "Unknown",
            status: "queued",
            correlation_id: correlationId,
            message: effectiveText
              ? "Set OPENAI_API_KEY to enable AI-powered requirement extraction."
              : file
                ? "File uploaded and stored. Text could not be extracted — try a different file format (PDF, DOCX, XLSX, PPTX, TXT)."
                : "Shred job queued. Upload an RFP document or provide document_text for AI extraction.",
            estimated_processing_time: "3-5 minutes",
            pipeline: "GDA.batch.doc-ingest → GDA.api.rfp-shredder → GDA.api.compliance-matrix",
          },
          {},
          true,
        ),
      );
      return;
    }

    // Real LLM extraction
    const truncatedText = effectiveText.slice(0, 12000);
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

    await persistJob("completed", extractedRequirements.length, 0);

    // Persist extracted requirements to DB
    const pool2 = getPool();
    if (pool2 && extractedRequirements.length > 0) {
      for (const r of extractedRequirements) {
        const reqId = `REQ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        try {
          await pool2.query(
            `INSERT INTO extracted_requirements (id, shred_job_id, section, requirement_text, requirement_type, complexity, keyword, confidence)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              reqId,
              jobId,
              (r.section as string) ?? "General",
              (r.requirement_text as string) ?? (r.text as string) ?? "",
              (r.requirement_type as string) ?? (r.type as string) ?? "technical",
              (r.complexity as string) ?? "moderate",
              (r.keyword as string) ?? null,
              typeof r.confidence === "number" ? r.confidence : 0.8,
            ],
          );
        } catch (e) {
          log.error("shred_req_persist_error", { reqId, error: (e as Error).message });
        }
      }
    }

    res.json(
      successEnvelope(WF, "shred", {
        id: jobId,
        file_name: effectiveFileName,
        file_id: fileId,
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
    log.error("rfp_shred_error", { error: (err as Error).message });
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
router.get("/requirements", async (req, res) => {
  try {
    const pool = getPool();
    let items: ExtractedRequirement[] = [];

    if (pool) {
      const conditions: string[] = [];
      const params: string[] = [];
      let idx = 1;
      const { job_id, type, complexity, match, search, sort } = req.query;

      if (job_id && typeof job_id === "string") {
        conditions.push(`shred_job_id = $${idx++}`);
        params.push(job_id);
      }
      if (type && typeof type === "string") {
        conditions.push(`requirement_type = $${idx++}`);
        params.push(type);
      }
      if (complexity && typeof complexity === "string") {
        conditions.push(`complexity = $${idx++}`);
        params.push(complexity);
      }
      if (match && typeof match === "string") {
        conditions.push(`compliance_match = $${idx++}`);
        params.push(match);
      }
      if (search && typeof search === "string") {
        conditions.push(`(requirement_text ILIKE $${idx} OR section ILIKE $${idx} OR matched_evidence ILIKE $${idx})`);
        params.push(`%${search}%`);
        idx++;
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      let orderBy = "ORDER BY id";
      if (sort === "section") orderBy = "ORDER BY section";
      else if (sort === "confidence") orderBy = "ORDER BY confidence DESC";
      else if (sort === "complexity") orderBy = "ORDER BY CASE complexity WHEN 'complex' THEN 0 WHEN 'moderate' THEN 1 ELSE 2 END";
      else if (sort === "match") orderBy = "ORDER BY CASE compliance_match WHEN 'none' THEN 0 WHEN 'partial' THEN 1 ELSE 2 END";

      const { rows } = await pool.query(
        `SELECT * FROM extracted_requirements ${where} ${orderBy}`,
        params,
      );
      items = rows as ExtractedRequirement[];
    }

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
    const entries: Array<{ match_level: string }> = [];

    const full = entries.filter((e) => e.match_level === "full").length;
    const partial = entries.filter((e) => e.match_level === "partial").length;
    const none = entries.filter((e) => e.match_level === "none").length;
    const coverage = entries.length > 0
      ? Math.round(((full + partial * 0.5) / entries.length) * 100)
      : 0;

    res.json(
      successEnvelope(WF, "compliance-map", {
        job_id: jobId,
        solicitation_title: "",
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
    const sections: Array<{ page_estimate: number; status: string }> = [];

    const totalPages = sections.reduce((s, sec) => s + sec.page_estimate, 0);
    const reusable = sections.filter((s) => s.status === "reuse_available").length;
    const drafts = sections.filter((s) => s.status === "draft_available").length;
    const newContent = sections.filter((s) => s.status === "needs_new_content").length;

    res.json(
      successEnvelope(WF, "response-outline", {
        job_id: jobId,
        solicitation_title: "",
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
