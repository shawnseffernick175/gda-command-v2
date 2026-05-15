import { Router, Request, Response } from "express";
import multer from "multer";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { requireRole } from "../lib/auth";
import { getPool } from "../lib/db";
import type { ColorReviewPhase, ColorReviewStatus } from "@gda/shared";
import { isLLMAvailable, chatCompletion, SYSTEM_PROMPTS } from "../lib/llm";
import { generateStorageKey, saveFile, getMaxFileSize } from "../lib/storage";
import { log } from "../lib/logger";
import { extractText } from "../lib/extract-text";

const router = Router();

type ReviewItem = Record<string, unknown> & { phase: string; status: string; proposal_id: string; proposal_title: string; agency: string; overall_score: number; go_no_go?: string; summary?: string };

async function loadReviews(): Promise<{ items: ReviewItem[]; source: "db" }> {
  const pool = getPool();
  if (pool) {
    try {
      const { rows } = await pool.query("SELECT * FROM color_reviews ORDER BY created_at DESC");
      if (rows.length > 0) {
        return { items: rows.map((r) => ({
          ...r,
          requirement_checks: r.requirement_checks ?? [],
          section_scores: r.section_scores ?? [],
          gold_checks: r.gold_checks ?? [],
          cost_line_items: r.cost_line_items ?? [],
          green_checks: r.green_checks ?? [],
          format_checks: r.format_checks ?? [],
          blue_assessments: r.blue_assessments ?? [],
          black_hat_findings: r.black_hat_findings ?? [],
          risk_factors: r.risk_factors ?? [],
        })) as ReviewItem[], source: "db" };
      }
    } catch { /* fall through */ }
  }
  return { items: [], source: "db" };
}

// ---------------------------------------------------------------------------
// Build phase-specific LLM prompt for color review
// ---------------------------------------------------------------------------
function buildReviewPrompt(phase: string, proposalTitle: string, text: string): string {
  const truncated = text.slice(0, 15000);

  const phaseInstructions: Record<string, string> = {
    blue: `Perform a BLUE TEAM review (capture strategy / fit assessment).
This is the first review before any proposal is written. Evaluate whether our company should pursue this opportunity:
- Do we have relevant past performance? (minimum references, CPARS ratings)
- Does our NAICS/size standard qualify?
- Do we have required certifications? (ISO, CMMI, FedRAMP, etc.)
- Do we have necessary clearances? (facility + personnel)
- Are we eligible for any set-aside requirements?
- What is our competitive position vs. likely competitors?
- What is our teaming strategy?
- What is our estimated pre-capture Pwin?

For each assessment area: { "id": "BA-001", "category": "past_performance|naics_fit|certifications|clearances|set_aside|competitive_position|teaming|pwin_estimate", "label": "...", "verdict": "pass|fail|warning", "detail": "assessment", "evidence": "supporting data", "recommendation": "what to do" }

Return JSON: { "overall_score": 0-100, "go_no_go": "go|conditional_go|no_go", "confidence": 0-100, "summary": "2-3 sentence fit assessment", "blue_assessments": [...assessments...], "risk_factors": ["description", ...] }`,

    black_hat: `Perform a BLACK HAT review (competitor analysis).
Predict each competitor's likely approach:
- What technical solution will they propose?
- What is their pricing strategy?
- What past performance will they cite?
- Who will they team with?
- What are their differentiators?
- What are their weaknesses we can exploit?

For each competitor finding: { "id": "BH-001", "competitor": "name", "area": "technical_approach|pricing|past_performance|teaming|differentiator|weakness", "assessment": "detailed assessment", "threat_level": "high|medium|low", "counter_strategy": "how to counter this" }

Return JSON: { "overall_score": 0, "summary": "2-3 sentence competitive landscape summary", "black_hat_findings": [...findings...], "risk_factors": ["description", ...] }`,

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

    white_glove: `Perform a WHITE GLOVE review (final visual/print inspection).
This is the absolute last check before physical submission. Evaluate:
- Layout consistency across all volumes
- Font, margin, and spacing compliance
- Header/footer accuracy (company name, proposal title, page numbers)
- Table of contents accuracy — do page numbers match?
- Cross-references valid — do section references point correctly?
- Acronym list complete and consistent
- Attachments and appendices included and labeled correctly
- Print-ready quality — no orphaned lines, no cut-off text, no broken images

For each check: { "id": "WG-001", "category": "layout|fonts|headers|toc|cross_ref|acronyms|attachments|print_quality", "label": "...", "verdict": "pass|fail|warning", "expected": "...", "actual": "...", "detail": "..." }

Return JSON: { "overall_score": 0-100, "summary": "2-3 sentence visual inspection summary", "format_checks": [...checks...], "risk_factors": ["description", ...] }`,
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
      ? Math.round(completed.reduce((s, r) => s + (Number(r.overall_score) || 0), 0) / completed.length)
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
            gold_checks: r.gold_checks ?? [],
            cost_line_items: r.cost_line_items ?? [],
            green_checks: r.green_checks ?? [],
            format_checks: r.format_checks ?? [],
            blue_assessments: r.blue_assessments ?? [],
            black_hat_findings: r.black_hat_findings ?? [],
            risk_factors: r.risk_factors ?? [],
          };
          return res.json(successEnvelope("GDA.color-review", "get-detail", { review, source: "db" }));
        }
      } catch { /* fall through */ }
    }
    return res.status(404).json(
      errorEnvelope("GDA.color-review", "get-detail", { code: "NOT_FOUND", message: `Color review ${req.params.id} not found`, detail: null }),
    );
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
          message: "phase is required (blue, pink, red, green, gold, white, black_hat, or white_glove)",
          detail: null,
        }),
      );
    }

    const validPhases = ["blue", "pink", "red", "green", "gold", "white", "black_hat", "white_glove"];
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

    // Normalize AI response fields to match frontend expected schema
    const rawRequirementChecks = Array.isArray(reviewResult.requirement_checks) ? reviewResult.requirement_checks as Record<string, unknown>[] : [];
    const requirementChecks = rawRequirementChecks.map((c) => ({
      id: c.id ?? c.requirement_id ?? `CHK-${Math.random().toString(36).slice(2, 6)}`,
      requirement_id: c.requirement_id ?? c.id ?? "",
      requirement_text: c.requirement_text ?? c.requirement ?? "",
      source_reference: c.source_reference ?? c.section ?? "",
      verdict: c.verdict ?? "not_reviewed",
      response_location: c.response_location ?? null,
      gap_detail: c.gap_detail ?? c.detail ?? null,
      suggestion: c.suggestion ?? c.recommendation ?? null,
    }));

    const rawSectionScores = Array.isArray(reviewResult.section_scores) ? reviewResult.section_scores as Record<string, unknown>[] : [];
    const sectionScores = rawSectionScores.map((s) => ({
      id: s.id ?? `SEC-${Math.random().toString(36).slice(2, 6)}`,
      section: s.section ?? s.section_name ?? "",
      volume: s.volume ?? "",
      score: Number(s.score ?? 0),
      max_score: Number(s.max_score ?? 100),
      strengths: Array.isArray(s.strengths) ? s.strengths : [],
      weaknesses: Array.isArray(s.weaknesses) ? s.weaknesses : [],
      discriminators_found: Array.isArray(s.discriminators_found) ? s.discriminators_found : [],
      discriminators_missing: Array.isArray(s.discriminators_missing) ? s.discriminators_missing : [],
      improvement_actions: Array.isArray(s.improvement_actions) ? s.improvement_actions : [],
      evaluator_notes: s.evaluator_notes ?? s.detail ?? "",
      verdict: s.verdict ?? "not_reviewed",
    }));

    const rawGoldChecks = Array.isArray(reviewResult.gold_checks) ? reviewResult.gold_checks as Record<string, unknown>[] : [];
    const goldChecks = rawGoldChecks.map((g) => ({
      id: g.id ?? `GOLD-${Math.random().toString(36).slice(2, 6)}`,
      category: g.category ?? g.area ?? "",
      label: g.label ?? g.area ?? g.assessment ?? "",
      verdict: g.verdict ?? "not_reviewed",
      score: Number(g.score ?? 0),
      max_score: Number(g.max_score ?? 100),
      detail: g.detail ?? g.assessment ?? "",
      recommendations: Array.isArray(g.recommendations) ? g.recommendations : (g.recommendation ? [g.recommendation] : []),
    }));

    const rawCostLineItems = Array.isArray(reviewResult.cost_line_items) ? reviewResult.cost_line_items as Record<string, unknown>[] : [];
    const costLineItems = rawCostLineItems.map((c) => ({
      id: c.id ?? `COST-${Math.random().toString(36).slice(2, 6)}`,
      category: c.category ?? c.label ?? "",
      proposed_amount: Number(c.proposed_amount ?? c.amount ?? 0),
      government_estimate: c.government_estimate != null ? Number(c.government_estimate) : null,
      variance_pct: c.variance_pct != null ? Number(c.variance_pct) : null,
      verdict: c.verdict ?? "not_reviewed",
      basis_of_estimate: c.basis_of_estimate ?? c.detail ?? "",
      notes: c.notes ?? "",
    }));

    const rawGreenChecks = Array.isArray(reviewResult.green_checks) ? reviewResult.green_checks as Record<string, unknown>[] : [];
    const greenChecks = rawGreenChecks.map((g) => ({
      id: g.id ?? `GC-${Math.random().toString(36).slice(2, 6)}`,
      area: g.area ?? g.category ?? "",
      label: g.label ?? "",
      verdict: g.verdict ?? "not_reviewed",
      detail: g.detail ?? "",
      benchmark: g.benchmark ?? null,
      recommendation: g.recommendation ?? null,
    }));

    const rawFormatChecks = Array.isArray(reviewResult.format_checks) ? reviewResult.format_checks as Record<string, unknown>[] : [];
    const formatChecks = rawFormatChecks.map((f) => ({
      id: f.id ?? `FMT-${Math.random().toString(36).slice(2, 6)}`,
      category: f.category ?? "",
      label: f.label ?? "",
      verdict: f.verdict ?? "not_reviewed",
      expected: f.expected ?? "",
      actual: f.actual ?? "",
      volume: f.volume ?? "",
      detail: f.detail ?? null,
    }));

    const rawBlueAssessments = Array.isArray(reviewResult.blue_assessments) ? reviewResult.blue_assessments as Record<string, unknown>[] : [];
    const blueAssessments = rawBlueAssessments.map((b) => ({
      id: b.id ?? `BA-${Math.random().toString(36).slice(2, 6)}`,
      category: b.category ?? "",
      label: b.label ?? "",
      verdict: b.verdict ?? "not_reviewed",
      detail: b.detail ?? "",
      evidence: b.evidence ?? null,
      recommendation: b.recommendation ?? null,
    }));

    const rawBlackHatFindings = Array.isArray(reviewResult.black_hat_findings) ? reviewResult.black_hat_findings as Record<string, unknown>[] : [];
    const blackHatFindings = rawBlackHatFindings.map((bh) => ({
      id: bh.id ?? `BH-${Math.random().toString(36).slice(2, 6)}`,
      competitor: bh.competitor ?? "",
      area: bh.area ?? "",
      assessment: bh.assessment ?? "",
      threat_level: bh.threat_level ?? "medium",
      counter_strategy: bh.counter_strategy ?? null,
    }));

    // Count verdicts across all check types
    const allChecks = [...requirementChecks, ...sectionScores, ...goldChecks, ...costLineItems, ...greenChecks, ...formatChecks, ...blueAssessments];
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
            cost_line_items, green_checks, format_checks,
            blue_assessments, black_hat_findings,
            risk_factors, file_id
          ) VALUES (
            $1, $2, $3, $4, $5, 'completed',
            NOW(), NOW(), $6, 100, $7,
            $8, $9, $10, $11,
            'AI (GPT-4o)', $12, $13, $14,
            $15, $16, $17, $18, $19, $20,
            $21, $22,
            $23, $24
          )`,
          [
            reviewId, effectiveProposalId, title, agency ?? null, phase,
            overallScore, passRate,
            totalChecks, passedChecks, failedChecks, warningChecks,
            summary, goNoGo, confidence,
            JSON.stringify(requirementChecks), JSON.stringify(sectionScores),
            JSON.stringify(goldChecks), JSON.stringify(costLineItems),
            JSON.stringify(greenChecks), JSON.stringify(formatChecks),
            JSON.stringify(blueAssessments), JSON.stringify(blackHatFindings),
            riskFactors, fileId,
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
        blue_assessments: blueAssessments,
        black_hat_findings: blackHatFindings,
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

// ---------------------------------------------------------------------------
// GET /api/color-review/:id/export — Generate exportable HTML report
// ---------------------------------------------------------------------------
router.get("/:id/export", requireRole("admin", "bd_manager", "capture_lead"), async (_req: Request, res: Response) => {
  const { id } = _req.params;

  const pool = getPool();
  if (!pool) {
    return res.status(503).json(errorEnvelope("GDA.color-review", "export", { code: "DB_UNAVAILABLE", message: "Database not available", detail: null }));
  }

  try {
    const { rows } = await pool.query("SELECT * FROM color_reviews WHERE id = $1", [id]);
    if (rows.length === 0) {
      return res.status(404).json(errorEnvelope("GDA.color-review", "export", { code: "NOT_FOUND", message: `Review ${id} not found`, detail: null }));
    }

    const r = rows[0];
    const phaseLabel: Record<string, string> = {
      blue: "Blue Team", pink: "Pink Team", red: "Red Team", green: "Green Team",
      gold: "Gold Team", white: "White Team", black_hat: "Black Hat", white_glove: "White Glove",
    };
    const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const esc = (v: unknown): string => escapeHtml(String(v ?? ""));
    const verdictSymbol = (v: string) => v === "pass" ? "✓ PASS" : v === "fail" ? "✗ FAIL" : v === "warning" ? "⚠ WARN" : "— N/R";
    const goLabel: Record<string, string> = { go: "GO", conditional_go: "CONDITIONAL GO", no_go: "NO-GO" };

    const checks: Array<Record<string, string>> = r.requirement_checks ?? [];
    const sections: Array<Record<string, string | number>> = r.section_scores ?? [];
    const goldChecks: Array<Record<string, string>> = r.gold_checks ?? [];
    const costItems: Array<Record<string, string | number>> = r.cost_line_items ?? [];
    const greenChecks: Array<Record<string, string>> = r.green_checks ?? [];
    const formatChecks: Array<Record<string, string>> = r.format_checks ?? [];
    const blueAssessments: Array<Record<string, string>> = r.blue_assessments ?? [];
    const blackHatFindings: Array<Record<string, string>> = r.black_hat_findings ?? [];
    const risks: string[] = r.risk_factors ?? [];

    let checksHtml = "";
    if (checks.length > 0) {
      checksHtml = `<h2>Requirement Checks</h2><table><tr><th>#</th><th>Requirement</th><th>Section</th><th>Verdict</th><th>Notes</th></tr>${
        checks.map((c, i) => `<tr><td>${i + 1}</td><td>${esc(c.requirement)}</td><td>${esc(c.section_ref)}</td><td class="verdict-${esc(c.verdict) || "not_reviewed"}">${verdictSymbol(c.verdict ?? "")}</td><td>${esc(c.detail)}</td></tr>`).join("")
      }</table>`;
    }

    if (sections.length > 0) {
      checksHtml += `<h2>Section Scores</h2><table><tr><th>Section</th><th>Score</th><th>Max</th><th>Verdict</th><th>Strengths</th><th>Weaknesses</th></tr>${
        sections.map((s) => `<tr><td>${esc(s.section)}</td><td>${esc(s.score)}</td><td>${esc(s.max_score)}</td><td class="verdict-${esc(s.verdict) || "not_reviewed"}">${verdictSymbol(String(s.verdict ?? ""))}</td><td>${esc(s.strengths)}</td><td>${esc(s.weaknesses)}</td></tr>`).join("")
      }</table>`;
    }

    if (goldChecks.length > 0) {
      checksHtml += `<h2>Gold Team Checks</h2><table><tr><th>#</th><th>Category</th><th>Criterion</th><th>Verdict</th><th>Detail</th></tr>${
        goldChecks.map((g, i) => `<tr><td>${i + 1}</td><td>${esc(g.category)}</td><td>${esc(g.criterion ?? g.label)}</td><td class="verdict-${esc(g.verdict) || "not_reviewed"}">${verdictSymbol(g.verdict ?? "")}</td><td>${esc(g.detail)}</td></tr>`).join("")
      }</table>`;
    }

    if (costItems.length > 0) {
      checksHtml += `<h2>Cost Line Items</h2><table><tr><th>Category</th><th>Description</th><th>Amount</th><th>Verdict</th><th>Detail</th></tr>${
        costItems.map((c) => `<tr><td>${esc(c.category)}</td><td>${esc(c.description)}</td><td>$${Number(c.amount ?? 0).toLocaleString()}</td><td class="verdict-${esc(c.verdict) || "not_reviewed"}">${verdictSymbol(String(c.verdict ?? ""))}</td><td>${esc(c.detail)}</td></tr>`).join("")
      }</table>`;
    }

    if (greenChecks.length > 0) {
      checksHtml += `<h2>Green Team (Pricing) Checks</h2><table><tr><th>#</th><th>Label</th><th>Verdict</th><th>Detail</th></tr>${
        greenChecks.map((g, i) => `<tr><td>${i + 1}</td><td>${esc(g.label)}</td><td class="verdict-${esc(g.verdict) || "not_reviewed"}">${verdictSymbol(g.verdict ?? "")}</td><td>${esc(g.detail)}</td></tr>`).join("")
      }</table>`;
    }

    if (formatChecks.length > 0) {
      checksHtml += `<h2>Format / Compliance Checks</h2><table><tr><th>Label</th><th>Volume</th><th>Expected</th><th>Actual</th><th>Verdict</th><th>Detail</th></tr>${
        formatChecks.map((f) => `<tr><td>${esc(f.label)}</td><td>${esc(f.volume)}</td><td>${esc(f.expected)}</td><td>${esc(f.actual)}</td><td class="verdict-${esc(f.verdict) || "not_reviewed"}">${verdictSymbol(f.verdict ?? "")}</td><td>${esc(f.detail)}</td></tr>`).join("")
      }</table>`;
    }

    if (blueAssessments.length > 0) {
      checksHtml += `<h2>Blue Team Assessments</h2><table><tr><th>ID</th><th>Category</th><th>Label</th><th>Verdict</th><th>Detail</th><th>Recommendation</th></tr>${
        blueAssessments.map((b) => `<tr><td>${esc(b.id)}</td><td>${esc(b.category)}</td><td>${esc(b.label)}</td><td class="verdict-${esc(b.verdict) || "not_reviewed"}">${verdictSymbol(b.verdict ?? "")}</td><td>${esc(b.detail)}</td><td>${esc(b.recommendation)}</td></tr>`).join("")
      }</table>`;
    }

    if (blackHatFindings.length > 0) {
      checksHtml += `<h2>Black Hat Findings</h2><table><tr><th>ID</th><th>Competitor</th><th>Area</th><th>Threat</th><th>Assessment</th><th>Counter Strategy</th></tr>${
        blackHatFindings.map((b) => `<tr><td>${esc(b.id)}</td><td>${esc(b.competitor)}</td><td>${esc(b.area)}</td><td>${esc(b.threat_level)}</td><td>${esc(b.assessment)}</td><td>${esc(b.counter_strategy)}</td></tr>`).join("")
      }</table>`;
    }

    let risksHtml = "";
    if (risks.length > 0) {
      risksHtml = `<h2>Risk Factors</h2><ul>${risks.map((rk) => `<li>${esc(rk)}</li>`).join("")}</ul>`;
    }

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(phaseLabel[r.phase] ?? r.phase)} Review — ${esc(r.proposal_title ?? "Color Review Report")}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; margin: 40px; color: #1a1a1a; }
  h1 { font-size: 22px; border-bottom: 2px solid #1a1a1a; padding-bottom: 6px; }
  h2 { font-size: 16px; margin-top: 28px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  .meta { display: flex; gap: 32px; flex-wrap: wrap; margin-bottom: 20px; font-size: 13px; }
  .meta-item { }
  .meta-label { font-weight: 700; color: #666; text-transform: uppercase; font-size: 10px; }
  .meta-value { font-size: 15px; margin-top: 2px; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; font-size: 12px; }
  th { background: #f3f4f6; text-align: left; padding: 6px 8px; border: 1px solid #ddd; font-weight: 600; }
  td { padding: 5px 8px; border: 1px solid #ddd; vertical-align: top; }
  .verdict-pass { color: #16a34a; font-weight: 700; }
  .verdict-fail { color: #dc2626; font-weight: 700; }
  .verdict-warning { color: #d97706; font-weight: 700; }
  .verdict-not_reviewed { color: #6b7280; }
  .summary-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px 16px; margin: 12px 0; }
  .go-badge { display: inline-block; padding: 4px 12px; border-radius: 4px; font-weight: 700; font-size: 13px; color: #fff; }
  .go-go { background: #16a34a; }
  .go-conditional_go { background: #d97706; }
  .go-no_go { background: #dc2626; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
<h1>${esc(phaseLabel[r.phase] ?? r.phase)} Review Report</h1>
<div class="meta">
  <div class="meta-item"><div class="meta-label">Proposal</div><div class="meta-value">${esc(r.proposal_title ?? "—")}</div></div>
  <div class="meta-item"><div class="meta-label">Agency</div><div class="meta-value">${esc(r.agency ?? "—")}</div></div>
  <div class="meta-item"><div class="meta-label">Phase</div><div class="meta-value">${phaseLabel[r.phase] ?? r.phase}</div></div>
  <div class="meta-item"><div class="meta-label">Overall Score</div><div class="meta-value">${r.overall_score ?? 0}/100</div></div>
  <div class="meta-item"><div class="meta-label">Pass Rate</div><div class="meta-value">${r.pass_rate ?? 0}%</div></div>
  ${r.go_no_go ? `<div class="meta-item"><div class="meta-label">Decision</div><div class="meta-value"><span class="go-badge go-${r.go_no_go}">${goLabel[r.go_no_go] ?? r.go_no_go}</span></div></div>` : ""}
  <div class="meta-item"><div class="meta-label">Reviewer</div><div class="meta-value">${esc(r.reviewer ?? "AI")}</div></div>
  <div class="meta-item"><div class="meta-label">Date</div><div class="meta-value">${r.completed_at ? new Date(r.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</div></div>
</div>

${r.summary ? `<div class="summary-box"><strong>Executive Summary:</strong> ${esc(r.summary)}</div>` : ""}

<div class="meta" style="margin-top:4px;">
  <div class="meta-item"><div class="meta-label">Total Checks</div><div class="meta-value">${r.total_checks ?? 0}</div></div>
  <div class="meta-item"><div class="meta-label">Passed</div><div class="meta-value" style="color:#16a34a">${r.passed_checks ?? 0}</div></div>
  <div class="meta-item"><div class="meta-label">Failed</div><div class="meta-value" style="color:#dc2626">${r.failed_checks ?? 0}</div></div>
  <div class="meta-item"><div class="meta-label">Warnings</div><div class="meta-value" style="color:#d97706">${r.warning_checks ?? 0}</div></div>
</div>

${checksHtml}
${risksHtml}

<hr style="margin-top:40px;border:none;border-top:1px solid #ccc;">
<p style="font-size:10px;color:#999;">Generated by GDA Command — Envision Innovative Solutions — ${new Date().toISOString()}</p>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="color-review-${r.phase}-${id.slice(0, 8)}.html"`);
    res.send(html);
  } catch (err) {
    log.error("color_review_export_error", { error: String(err) });
    res.status(500).json(errorEnvelope("GDA.color-review", "export", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

export default router;
