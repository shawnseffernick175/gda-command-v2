import { Router, Request, Response } from "express";
import multer from "multer";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { requireRole } from "../lib/auth";
import { MOCK_COLOR_REVIEWS } from "../data/color-review-mock";
import { getPool } from "../lib/db";
import type { ColorReviewPhase, ColorReviewStatus } from "@gda/shared";
import { isLLMAvailable, chatCompletion, SYSTEM_PROMPTS } from "../lib/llm";
import { generateStorageKey, saveFile, getMaxFileSize } from "../lib/storage";
import { log } from "../lib/logger";

const router = Router();

type ReviewItem = Record<string, unknown> & { phase: string; status: string; proposal_id: string; proposal_title: string; agency: string; overall_score: number; go_no_go?: string; summary?: string };

async function loadReviews(): Promise<{ items: ReviewItem[]; source: "db" | "mock" }> {
  const pool = getPool();
  if (pool) {
    try {
      const { rows } = await pool.query("SELECT * FROM color_reviews ORDER BY created_at DESC");
      if (rows.length > 0) {
        return { items: rows.map((r) => ({
          ...r,
          requirement_checks: r.requirement_checks ?? [],
          section_scores: r.section_scores ?? [],
          risk_factors: r.risk_factors ?? [],
        })) as ReviewItem[], source: "db" };
      }
    } catch { /* fall through */ }
  }
  return { items: [...MOCK_COLOR_REVIEWS] as unknown as ReviewItem[], source: "mock" };
}

// ---------------------------------------------------------------------------
// Extract text from uploaded file buffer
// ---------------------------------------------------------------------------
async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === "text/plain" || mimeType === "text/markdown") {
    return buffer.toString("utf-8");
  }
  if (mimeType === "application/pdf") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
      const result = await pdfParse(buffer);
      return result.text;
    } catch (err) {
      log.error("pdf_parse_error", { error: String(err) });
      return "";
    }
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth") as { extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }> };
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (err) {
      log.error("docx_parse_error", { error: String(err) });
      return "";
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// Build phase-specific LLM prompt for color review
// ---------------------------------------------------------------------------
function buildReviewPrompt(phase: string, proposalTitle: string, text: string): string {
  const truncated = text.slice(0, 15000);

  const phaseInstructions: Record<string, string> = {
    white: `Perform a WHITE TEAM review (format & compliance check).
Evaluate:
- Page count compliance
- Font and formatting requirements
- Volume structure adherence
- Section numbering and headers
- Required forms and certifications present
- Submission packaging requirements

For each check, provide: { "label": "...", "volume": "Vol I/II/III/etc", "expected": "what was required", "actual": "what was found", "verdict": "pass|fail|warning", "detail": "explanation" }

Return JSON: { "overall_score": 0-100, "go_no_go": "go|conditional_go|no_go", "confidence": 0-100, "summary": "2-3 sentence executive summary", "format_checks": [...checks above...], "risk_factors": ["SEVERITY: description", ...] }`,

    pink: `Perform a PINK TEAM review (compliance & responsiveness check).
Evaluate each solicitation requirement (SHALL, MUST, WILL statements):
- Is the requirement addressed?
- Is the response compliant and responsive?
- Are there gaps or missing content?
- Does the response use evaluation criteria language?

For each requirement check: { "id": "CHK-001", "requirement": "requirement text", "section": "proposal section", "verdict": "pass|fail|warning", "detail": "explanation", "recommendation": "what to fix" }

Return JSON: { "overall_score": 0-100, "go_no_go": "go|conditional_go|no_go", "confidence": 0-100, "summary": "2-3 sentence executive summary", "requirement_checks": [...checks...], "risk_factors": ["SEVERITY: description", ...] }`,

    red: `Perform a RED TEAM review (quality & scoring assessment).
Score each major section:
- Technical Approach — innovation, understanding, feasibility
- Management Plan — team structure, key personnel, org chart
- Past Performance — relevance, recency, quality
- Executive Summary — compelling narrative, discriminators
- Staffing Plan — qualifications, availability, labor categories

For each section: { "id": "SEC-001", "section_name": "...", "score": 0-100, "max_score": 100, "strengths": ["..."], "weaknesses": ["..."], "verdict": "pass|fail|warning", "detail": "assessment narrative" }

Return JSON: { "overall_score": 0-100, "go_no_go": "go|conditional_go|no_go", "confidence": 0-100, "summary": "2-3 sentence executive summary", "section_scores": [...sections...], "risk_factors": ["SEVERITY: description", ...] }`,

    green: `Perform a GREEN TEAM review (cost/pricing analysis).
Evaluate:
- Cost realism and competitiveness
- Basis of Estimate (BOE) adequacy
- Labor rate reasonableness
- Direct/indirect rate structure
- Subcontractor pricing
- Fee/profit margin appropriateness
- Cost volume narrative consistency

For each cost area: { "id": "COST-001", "category": "...", "proposed_amount": number, "government_estimate": number_or_null, "variance_pct": number_or_null, "basis_of_estimate": "...", "verdict": "pass|fail|warning", "notes": "..." }
Also provide green checks: { "id": "GC-001", "label": "check name", "verdict": "pass|fail|warning", "detail": "...", "benchmark": "industry standard", "recommendation": "..." }

Return JSON: { "overall_score": 0-100, "go_no_go": "go|conditional_go|no_go", "confidence": 0-100, "summary": "2-3 sentence executive summary", "cost_line_items": [...costs...], "green_checks": [...checks...], "risk_factors": ["SEVERITY: description", ...] }`,

    gold: `Perform a GOLD TEAM review (executive go/no-go decision).
This is the final gate review. Evaluate:
- Overall competitive position
- Win probability assessment
- Strategic alignment with company goals
- Resource commitment vs. opportunity value
- Risk vs. reward analysis
- Competitor analysis
- Pricing strategy position

For each evaluation area: { "id": "GOLD-001", "area": "...", "assessment": "...", "verdict": "pass|fail|warning", "recommendation": "..." }

Return JSON: { "overall_score": 0-100, "go_no_go": "go|conditional_go|no_go", "confidence": 0-100, "summary": "2-3 sentence executive recommendation for leadership", "gold_checks": [...checks...], "risk_factors": ["SEVERITY: description", ...] }`,
  };

  return `Review the following proposal document.

Document Title: ${proposalTitle}
Review Phase: ${phase.toUpperCase()} TEAM

${phaseInstructions[phase] ?? phaseInstructions.red}

--- DOCUMENT TEXT ---
${truncated}
---`;
}

// ---------------------------------------------------------------------------
// GET /api/color-review — list reviews with filters
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const { items: allReviews, source } = await loadReviews();
    let items = [...allReviews];
    const { phase, status, proposal_id, search } = req.query;

    if (phase && typeof phase === "string") {
      items = items.filter((r) => r.phase === phase);
    }
    if (status && typeof status === "string") {
      items = items.filter((r) => r.status === status);
    }
    if (proposal_id && typeof proposal_id === "string") {
      items = items.filter((r) => r.proposal_id === proposal_id);
    }
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      items = items.filter(
        (r) =>
          (r.proposal_title ?? "").toLowerCase().includes(q) ||
          (r.agency ?? "").toLowerCase().includes(q) ||
          (r.summary ?? "").toLowerCase().includes(q),
      );
    }

    const all = allReviews;
    const phaseCounts: Record<string, number> = {};
    const statusCounts: Record<string, number> = {};
    for (const r of all) {
      phaseCounts[r.phase] = (phaseCounts[r.phase] ?? 0) + 1;
      statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
    }

    const completed = all.filter((r) => r.status === "completed");
    const avgScore = completed.length > 0
      ? Math.round(completed.reduce((s, r) => s + (r.overall_score ?? 0), 0) / completed.length)
      : 0;

    const goCount = completed.filter((r) => r.go_no_go === "go").length;
    const conditionalGoCount = completed.filter((r) => r.go_no_go === "conditional_go").length;
    const noGoCount = completed.filter((r) => r.go_no_go === "no_go").length;

    const proposalsReviewed = new Set(all.map((r) => r.proposal_id)).size;

    res.json(
      successEnvelope("GDA.color-review", "list", {
        reviews: items,
        total: all.length,
        filtered: items.length,
        summary: { phaseCounts, statusCounts, avgScore, goCount, conditionalGoCount, noGoCount, proposalsReviewed },
        source,
      }),
    );
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.color-review", "list", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// GET /api/color-review/:id — single review detail
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const pool = getPool();
    if (pool) {
      try {
        const { rows } = await pool.query("SELECT * FROM color_reviews WHERE id = $1", [req.params.id]);
        if (rows.length > 0) {
          const r = rows[0];
          const review = {
            ...r,
            requirement_checks: r.requirement_checks ?? [],
            section_scores: r.section_scores ?? [],
            risk_factors: r.risk_factors ?? [],
          };
          return res.json(successEnvelope("GDA.color-review", "get-detail", { review, source: "db" }));
        }
      } catch { /* fall through */ }
    }
    const review = MOCK_COLOR_REVIEWS.find((r) => r.id === req.params.id);
    if (!review) {
      return res.status(404).json(
        errorEnvelope("GDA.color-review", "get-detail", { code: "NOT_FOUND", message: `Color review ${req.params.id} not found`, detail: null }),
      );
    }
    res.json(successEnvelope("GDA.color-review", "get-detail", { review, source: "mock" }));
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.color-review", "get-detail", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// Multer config for proposal document uploads
// ---------------------------------------------------------------------------
const proposalUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: getMaxFileSize() },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set([
      "application/pdf",
      "text/plain",
      "text/markdown",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);
    if (!allowed.has(file.mimetype)) {
      cb(new Error(`File type ${file.mimetype} not allowed. Upload PDF, DOCX, or TXT.`));
      return;
    }
    cb(null, true);
  },
});

// ---------------------------------------------------------------------------
// POST /api/color-review/run — upload document + run AI color review
// ---------------------------------------------------------------------------
router.post(
  "/run",
  requireRole("admin", "bd_manager", "capture_lead", "analyst"),
  proposalUpload.single("file"),
  async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const { proposal_id, phase, proposal_title, agency, proposal_text } = req.body ?? {};

    if (!phase) {
      return res.status(400).json(
        errorEnvelope("GDA.color-review", "run", {
          code: "VALIDATION",
          message: "phase is required (white, pink, green, red, or gold)",
          detail: null,
        }),
      );
    }

    const validPhases = ["white", "pink", "green", "red", "gold"];
    if (!validPhases.includes(phase)) {
      return res.status(400).json(
        errorEnvelope("GDA.color-review", "run", {
          code: "VALIDATION",
          message: `Invalid phase '${phase}'. Must be one of: ${validPhases.join(", ")}`,
          detail: null,
        }),
      );
    }

    const title = proposal_title ?? file?.originalname ?? "Untitled Document";
    const effectiveProposalId = proposal_id ?? `PROP-${Date.now()}`;
    const reviewId = `CR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // Extract text from uploaded file or use provided text
    let documentText = proposal_text ?? "";
    if (file && !proposal_text) {
      documentText = await extractText(file.buffer, file.mimetype);
    }

    if (!documentText) {
      return res.status(400).json(
        errorEnvelope("GDA.color-review", "run", {
          code: "VALIDATION",
          message: file
            ? "Could not extract text from the uploaded file. Try uploading a PDF, DOCX, or TXT file, or paste the document text."
            : "Upload a document file or provide proposal_text to review.",
          detail: null,
        }),
      );
    }

    // Save uploaded file (only after text extraction succeeds to avoid orphaned files)
    let fileId: string | null = null;
    if (file) {
      const storageKey = generateStorageKey(file.originalname);
      saveFile(storageKey, file.buffer);
      fileId = `file-${Date.now()}`;

      const pool = getPool();
      if (pool) {
        try {
          await pool.query(
            `INSERT INTO uploaded_files (id, original_name, storage_key, mime_type, size_bytes, uploaded_by)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [fileId, file.originalname, storageKey, file.mimetype, file.size, req.user?.userId ?? null],
          );
        } catch (err) {
          log.error("color_review_file_save_error", { error: String(err) });
        }
      }
      log.info("color_review_file_uploaded", { fileId, fileName: file.originalname, sizeBytes: file.size });
    }

    if (!isLLMAvailable()) {
      return res.json(
        successEnvelope("GDA.color-review", "run", {
          reviewId,
          proposal_id: effectiveProposalId,
          phase,
          status: "queued",
          message: `Set OPENAI_API_KEY to enable AI-powered ${phase} team review.`,
          file_id: fileId,
        }, {}, true),
      );
    }

    log.info("color_review_started", { reviewId, phase, title, textLength: documentText.length });

    const prompt = buildReviewPrompt(phase, title, documentText);
    const llmResponse = await chatCompletion(
      [
        { role: "system", content: SYSTEM_PROMPTS.colorReview },
        { role: "user", content: prompt },
      ],
      { temperature: 0.3, max_tokens: 4000, response_format: { type: "json_object" } },
    );

    let reviewResult: Record<string, unknown> = {};
    try {
      reviewResult = JSON.parse(llmResponse.content);
    } catch {
      reviewResult = { summary: llmResponse.content, overall_score: 0 };
    }

    const overallScore = Number(reviewResult.overall_score ?? 0);
    const goNoGo = String(reviewResult.go_no_go ?? "conditional_go");
    const confidence = Number(reviewResult.confidence ?? 50);
    const summary = String(reviewResult.summary ?? "");
    const riskFactors = Array.isArray(reviewResult.risk_factors) ? reviewResult.risk_factors : [];

    const requirementChecks = Array.isArray(reviewResult.requirement_checks) ? reviewResult.requirement_checks : [];
    const sectionScores = Array.isArray(reviewResult.section_scores) ? reviewResult.section_scores : [];
    const goldChecks = Array.isArray(reviewResult.gold_checks) ? reviewResult.gold_checks : [];
    const costLineItems = Array.isArray(reviewResult.cost_line_items) ? reviewResult.cost_line_items : [];
    const greenChecks = Array.isArray(reviewResult.green_checks) ? reviewResult.green_checks : [];
    const formatChecks = Array.isArray(reviewResult.format_checks) ? reviewResult.format_checks : [];

    // Count verdicts across all check types
    const allChecks = [...requirementChecks, ...sectionScores, ...goldChecks, ...costLineItems, ...greenChecks, ...formatChecks];
    const totalChecks = allChecks.length;
    const passedChecks = allChecks.filter((c: Record<string, unknown>) => c.verdict === "pass").length;
    const failedChecks = allChecks.filter((c: Record<string, unknown>) => c.verdict === "fail").length;
    const warningChecks = allChecks.filter((c: Record<string, unknown>) => c.verdict === "warning").length;
    const passRate = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;

    // Save to database
    const pool = getPool();
    if (pool) {
      try {
        await pool.query(
          `INSERT INTO color_reviews (
            id, proposal_id, proposal_title, agency, phase, status,
            started_at, completed_at, overall_score, max_score, pass_rate,
            total_checks, passed_checks, failed_checks, warning_checks,
            reviewer, summary, go_no_go, confidence,
            requirement_checks, section_scores, gold_checks,
            cost_line_items, green_checks, format_checks, risk_factors,
            file_id
          ) VALUES (
            $1, $2, $3, $4, $5, 'completed',
            NOW(), NOW(), $6, 100, $7,
            $8, $9, $10, $11,
            'AI (GPT-4o)', $12, $13, $14,
            $15, $16, $17, $18, $19, $20, $21,
            $22
          )`,
          [
            reviewId, effectiveProposalId, title, agency ?? null, phase,
            overallScore, passRate,
            totalChecks, passedChecks, failedChecks, warningChecks,
            summary, goNoGo, confidence,
            JSON.stringify(requirementChecks), JSON.stringify(sectionScores),
            JSON.stringify(goldChecks), JSON.stringify(costLineItems),
            JSON.stringify(greenChecks), JSON.stringify(formatChecks),
            riskFactors,
            fileId,
          ],
        );
        log.info("color_review_saved", { reviewId, phase, overallScore, goNoGo });
      } catch (err) {
        log.error("color_review_save_error", { error: String(err) });
      }
    }

    res.json(
      successEnvelope("GDA.color-review", "run", {
        reviewId,
        proposal_id: effectiveProposalId,
        phase,
        status: "completed",
        proposal_title: title,
        overall_score: overallScore,
        go_no_go: goNoGo,
        confidence,
        pass_rate: passRate,
        total_checks: totalChecks,
        passed_checks: passedChecks,
        failed_checks: failedChecks,
        warning_checks: warningChecks,
        summary,
        requirement_checks: requirementChecks,
        section_scores: sectionScores,
        gold_checks: goldChecks,
        cost_line_items: costLineItems,
        green_checks: greenChecks,
        format_checks: formatChecks,
        risk_factors: riskFactors,
        file_id: fileId,
        ai: { model: llmResponse.model, tokens: llmResponse.usage.total_tokens },
      }),
    );
  } catch (err) {
    log.error("color_review_run_error", { error: String(err) });
    res.status(500).json(errorEnvelope("GDA.color-review", "run", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

export default router;
