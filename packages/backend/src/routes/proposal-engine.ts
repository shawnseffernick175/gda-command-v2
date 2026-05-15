/**
 * Proposal Engine — full lifecycle from RFP qualification to AI-powered writing and review.
 *
 * Sub-routes:
 *   /api/proposal-engine/proposals          CRUD for proposals (DB-backed)
 *   /api/proposal-engine/go-no-go           Go/No-Go AI assessments
 *   /api/proposal-engine/sections           Section-level management, Kanban
 *   /api/proposal-engine/ai/generate-*      AI writing endpoints (outline, draft, enhance)
 *   /api/proposal-engine/answer-bank        Curated Q&A from past proposals
 *   /api/proposal-engine/ai-review          AI-powered color review
 */

import { Router, Request, Response } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { isLLMAvailable, chatCompletion, chatCompletionStream, SYSTEM_PROMPTS } from "../lib/llm";
import { isEmbeddingAvailable, vectorSearch, generateQueryEmbedding } from "../lib/embeddings";
import { log } from "../lib/logger";

const router = Router();
const WF = "GDA.proposal-engine";

// ============================================================================
// PROPOSALS CRUD
// ============================================================================

router.get("/proposals", async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.json(successEnvelope(WF, "proposals-list", { proposals: [], total: 0 }));

    const { status, search, sortBy, sortDir } = _req.query;
    let query = `SELECT p.*, 
      (SELECT count(*)::int FROM proposal_sections WHERE proposal_id = p.id) as section_count,
      (SELECT count(*)::int FROM proposal_sections WHERE proposal_id = p.id AND status = 'final') as sections_complete
      FROM proposals p WHERE 1=1`;
    const params: unknown[] = [];
    let idx = 1;

    if (status && typeof status === "string") {
      query += ` AND p.status = $${idx++}`;
      params.push(status);
    }
    if (search && typeof search === "string") {
      query += ` AND (p.title ILIKE $${idx} OR p.solicitation_title ILIKE $${idx} OR p.agency ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    const dir = sortDir === "asc" ? "ASC" : "DESC";
    const validSort = ["title", "agency", "status", "due_date", "created_at", "value_estimated"];
    const orderCol = validSort.includes(sortBy as string) ? sortBy : "created_at";
    query += ` ORDER BY p.${orderCol} ${dir}`;

    const { rows } = await pool.query(query, params);

    const statusCounts: Record<string, number> = {};
    rows.forEach((r: Record<string, unknown>) => {
      const s = r.status as string;
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    });

    return res.json(successEnvelope(WF, "proposals-list", {
      proposals: rows,
      total: rows.length,
      summary: { statusCounts },
    }));
  } catch (err) {
    log.error("proposal_list_error", { error: (err as Error).message });
    return res.status(500).json(errorEnvelope(WF, "proposals-list", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

router.get("/proposals/:id", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(404).json(errorEnvelope(WF, "proposal-detail", { code: "NOT_FOUND", message: "DB not configured", detail: null }));

    const { rows } = await pool.query("SELECT * FROM proposals WHERE id = $1", [req.params.id]);
    if (rows.length === 0) return res.status(404).json(errorEnvelope(WF, "proposal-detail", { code: "NOT_FOUND", message: "Proposal not found", detail: null }));

    const proposal = rows[0];

    const [volRes, findRes, scoreRes, timeRes, secRes] = await Promise.all([
      pool.query("SELECT * FROM proposal_volumes WHERE proposal_id = $1 ORDER BY volume_type", [req.params.id]),
      pool.query("SELECT * FROM proposal_red_team_findings WHERE proposal_id = $1 ORDER BY created_at DESC", [req.params.id]),
      pool.query("SELECT * FROM proposal_scorecard WHERE proposal_id = $1", [req.params.id]),
      pool.query("SELECT * FROM proposal_timeline WHERE proposal_id = $1 ORDER BY due_date", [req.params.id]),
      pool.query("SELECT * FROM proposal_sections WHERE proposal_id = $1 ORDER BY section_number, created_at", [req.params.id]),
    ]);

    return res.json(successEnvelope(WF, "proposal-detail", {
      proposal: {
        ...proposal,
        volumes: volRes.rows,
        red_team_findings: findRes.rows,
        scorecard: scoreRes.rows,
        timeline: timeRes.rows,
        sections: secRes.rows,
      },
    }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "proposal-detail", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

router.post("/proposals", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(503).json(errorEnvelope(WF, "create-proposal", { code: "DB_UNAVAILABLE", message: "Database not configured", detail: null }));

    const { title, solicitation_id, solicitation_title, agency, value_estimated, due_date, capture_manager, proposal_manager, win_themes, opportunity_id, shred_job_id } = req.body;

    if (!title) return res.status(400).json(errorEnvelope(WF, "create-proposal", { code: "VALIDATION", message: "title is required", detail: null }));

    const { rows } = await pool.query(
      `INSERT INTO proposals (title, solicitation_id, solicitation_title, agency, value_estimated, due_date, capture_manager, proposal_manager, win_themes, opportunity_id, shred_job_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [title, solicitation_id ?? null, solicitation_title ?? null, agency ?? null, value_estimated ?? 0, due_date ?? null, capture_manager ?? null, proposal_manager ?? null, JSON.stringify(win_themes ?? []), opportunity_id ?? null, shred_job_id ?? null]
    );

    // Auto-create standard volumes
    const standardVolumes = [
      { volume_type: "executive_summary", title: "Executive Summary" },
      { volume_type: "technical", title: "Technical Approach" },
      { volume_type: "management", title: "Management Approach" },
      { volume_type: "past_performance", title: "Past Performance" },
      { volume_type: "cost_price", title: "Cost/Price Volume" },
    ];

    for (const vol of standardVolumes) {
      await pool.query(
        `INSERT INTO proposal_volumes (proposal_id, volume_type, title) VALUES ($1, $2, $3)`,
        [rows[0].id, vol.volume_type, vol.title]
      );
    }

    // Auto-create standard timeline milestones
    const milestones = [
      "Kickoff Meeting",
      "Compliance Matrix Complete",
      "Outline Review",
      "First Draft (Pink Team)",
      "Red Team Review",
      "Final Draft",
      "Gold Team Review",
      "Production & Submission",
    ];

    for (const ms of milestones) {
      await pool.query(
        `INSERT INTO proposal_timeline (proposal_id, milestone) VALUES ($1, $2)`,
        [rows[0].id, ms]
      );
    }

    log.info("proposal_created", { id: rows[0].id, title });
    return res.json(successEnvelope(WF, "create-proposal", { proposal: rows[0] }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "create-proposal", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

router.patch("/proposals/:id", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(503).json(errorEnvelope(WF, "update-proposal", { code: "DB_UNAVAILABLE", message: "Database not configured", detail: null }));

    const allowedFields = ["title", "solicitation_id", "solicitation_title", "agency", "status", "value_estimated", "due_date", "submission_date", "capture_manager", "proposal_manager", "compliance_score", "overall_score", "win_themes"];
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        const val = field === "win_themes" ? JSON.stringify(req.body[field]) : req.body[field];
        updates.push(`${field} = $${idx++}`);
        params.push(val);
      }
    }

    if (updates.length === 0) return res.status(400).json(errorEnvelope(WF, "update-proposal", { code: "VALIDATION", message: "No valid fields to update", detail: null }));

    updates.push(`updated_at = now()`);
    params.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE proposals SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (rows.length === 0) return res.status(404).json(errorEnvelope(WF, "update-proposal", { code: "NOT_FOUND", message: "Proposal not found", detail: null }));

    return res.json(successEnvelope(WF, "update-proposal", { proposal: rows[0] }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "update-proposal", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

router.delete("/proposals/:id", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(503).json(errorEnvelope(WF, "delete-proposal", { code: "DB_UNAVAILABLE", message: "Database not configured", detail: null }));

    await pool.query("DELETE FROM proposals WHERE id = $1", [req.params.id]);
    return res.json(successEnvelope(WF, "delete-proposal", { deleted: true }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "delete-proposal", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

// ============================================================================
// PROPOSAL PROGRESS DASHBOARD
// ============================================================================

router.get("/proposals/:id/progress", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.json(successEnvelope(WF, "proposal-progress", { progress: null }));

    const [secRes, volRes, findRes, timeRes] = await Promise.all([
      pool.query(`SELECT status, count(*)::int as count, coalesce(sum(word_count), 0)::int as words FROM proposal_sections WHERE proposal_id = $1 GROUP BY status`, [req.params.id]),
      pool.query(`SELECT volume_type, page_count, word_count, compliance_score FROM proposal_volumes WHERE proposal_id = $1`, [req.params.id]),
      pool.query(`SELECT severity, status FROM proposal_red_team_findings WHERE proposal_id = $1`, [req.params.id]),
      pool.query(`SELECT milestone, status, due_date FROM proposal_timeline WHERE proposal_id = $1 ORDER BY due_date`, [req.params.id]),
    ]);

    const sectionsByStatus: Record<string, number> = {};
    let totalSections = 0;
    let totalWords = 0;
    for (const row of secRes.rows) {
      sectionsByStatus[row.status] = row.count;
      totalSections += row.count;
      totalWords += row.words;
    }
    const completeSections = (sectionsByStatus["final"] ?? 0) + (sectionsByStatus["submitted"] ?? 0);
    const pctComplete = totalSections > 0 ? Math.round((completeSections / totalSections) * 100) : 0;

    const openFindings = findRes.rows.filter((f: Record<string, unknown>) => f.status === "open").length;
    const criticalFindings = findRes.rows.filter((f: Record<string, unknown>) => f.severity === "critical" && f.status === "open").length;

    const overdueMilestones = timeRes.rows.filter((t: Record<string, unknown>) => t.status === "overdue").length;
    const completedMilestones = timeRes.rows.filter((t: Record<string, unknown>) => t.status === "completed").length;

    return res.json(successEnvelope(WF, "proposal-progress", {
      progress: {
        pctComplete,
        totalSections,
        completeSections,
        totalWords,
        sectionsByStatus,
        volumes: volRes.rows,
        openFindings,
        criticalFindings,
        overdueMilestones,
        completedMilestones,
        totalMilestones: timeRes.rows.length,
        timeline: timeRes.rows,
      },
    }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "proposal-progress", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

// ============================================================================
// GO/NO-GO ASSESSMENT
// ============================================================================

router.post("/go-no-go", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(503).json(errorEnvelope(WF, "go-no-go", { code: "DB_UNAVAILABLE", message: "Database not configured", detail: null }));
    if (!isLLMAvailable()) return res.status(503).json(errorEnvelope(WF, "go-no-go", { code: "AI_UNAVAILABLE", message: "No AI model configured", detail: null }));

    const { opportunity_id, shred_job_id, requirements_text, opportunity_data } = req.body;

    // Gather context
    let companyProfile = "";
    try {
      const { rows } = await pool.query(`SELECT * FROM company_profile LIMIT 1`);
      if (rows.length > 0) companyProfile = JSON.stringify(rows[0]);
    } catch { /* table may not exist */ }

    let pastPerformance = "";
    try {
      const { rows } = await pool.query(`SELECT contract_name, agency, contract_value, performance_rating, description FROM cpars_records ORDER BY performance_rating DESC LIMIT 10`);
      if (rows.length > 0) pastPerformance = rows.map((r: Record<string, unknown>) => `${r.contract_name} (${r.agency}) - Rating: ${r.performance_rating}, Value: $${r.contract_value}`).join("\n");
    } catch { /* table may not exist */ }

    const oppContext = opportunity_data ? JSON.stringify(opportunity_data) : "No opportunity data provided";
    const reqsContext = requirements_text || "No requirements extracted yet";

    const messages = [
      {
        role: "system" as const,
        content: `You are an expert government contracting Go/No-Go assessment analyst for Envision Innovative Solutions, a Service-Disabled Veteran-Owned Small Business (SDVOSB) specializing in defense IT, cybersecurity, Army SETA support, and C5ISR systems engineering.

Evaluate this opportunity and provide a Go/No-Go recommendation. Score each dimension 0-100.

Return ONLY valid JSON:
{
  "naics_score": <0-100>,
  "past_performance_score": <0-100>,
  "set_aside_score": <0-100>,
  "geographic_score": <0-100>,
  "competition_score": <0-100>,
  "overall_score": <0-100>,
  "recommendation": "go" | "no_go" | "conditional",
  "rationale": "<2-3 paragraph assessment>",
  "strengths": ["<strength 1>", ...],
  "weaknesses": ["<weakness 1>", ...],
  "mitigations": ["<mitigation for each weakness>", ...]
}`,
      },
      {
        role: "user" as const,
        content: `OPPORTUNITY:\n${oppContext}\n\nEXTRACTED REQUIREMENTS:\n${reqsContext}\n\nCOMPANY PROFILE:\n${companyProfile || "Envision Innovative Solutions — SDVOSB, defense IT, cyber, SETA"}\n\nPAST PERFORMANCE:\n${pastPerformance || "No CPARS records available"}`,
      },
    ];

    const llmResult = await chatCompletion(messages, { tier: "deep", max_tokens: 2048, response_format: { type: "json_object" } });

    let assessment: Record<string, unknown>;
    try {
      assessment = JSON.parse(llmResult.content);
    } catch {
      assessment = { overall_score: 0, recommendation: "conditional", rationale: llmResult.content };
    }

    const { rows } = await pool.query(
      `INSERT INTO go_no_go_assessments (opportunity_id, shred_job_id, naics_score, past_performance_score, set_aside_score, geographic_score, competition_score, overall_score, recommendation, rationale, assessed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ai')
       RETURNING *`,
      [
        opportunity_id ?? null,
        shred_job_id ?? null,
        (assessment.naics_score as number) ?? 0,
        (assessment.past_performance_score as number) ?? 0,
        (assessment.set_aside_score as number) ?? 0,
        (assessment.geographic_score as number) ?? 0,
        (assessment.competition_score as number) ?? 0,
        (assessment.overall_score as number) ?? 0,
        assessment.recommendation ?? "conditional",
        assessment.rationale ?? "",
      ]
    );

    log.info("go_no_go_assessed", { id: rows[0].id, recommendation: assessment.recommendation });

    return res.json(successEnvelope(WF, "go-no-go", {
      assessment: { ...rows[0], strengths: assessment.strengths, weaknesses: assessment.weaknesses, mitigations: assessment.mitigations },
      model: llmResult.model,
      tier: llmResult.tier,
    }));
  } catch (err) {
    log.error("go_no_go_error", { error: (err as Error).message });
    return res.status(500).json(errorEnvelope(WF, "go-no-go", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

router.get("/go-no-go/:opportunityId", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.json(successEnvelope(WF, "go-no-go-history", { assessments: [] }));

    const { rows } = await pool.query(
      `SELECT * FROM go_no_go_assessments WHERE opportunity_id = $1 ORDER BY assessed_at DESC`,
      [req.params.opportunityId]
    );

    return res.json(successEnvelope(WF, "go-no-go-history", { assessments: rows }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "go-no-go-history", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

// Create proposal from Go/No-Go (one-click)
router.post("/go-no-go/:assessmentId/create-proposal", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(503).json(errorEnvelope(WF, "create-from-gng", { code: "DB_UNAVAILABLE", message: "DB not configured", detail: null }));

    const { rows: gngRows } = await pool.query("SELECT * FROM go_no_go_assessments WHERE id = $1", [req.params.assessmentId]);
    if (gngRows.length === 0) return res.status(404).json(errorEnvelope(WF, "create-from-gng", { code: "NOT_FOUND", message: "Assessment not found", detail: null }));

    const gng = gngRows[0];

    // Fetch opportunity data if available
    let oppTitle = req.body.title ?? "New Proposal";
    let oppAgency = req.body.agency ?? "";
    let oppValue = req.body.value_estimated ?? 0;
    let oppSolId = "";

    if (gng.opportunity_id) {
      try {
        const { rows: oppRows } = await pool.query("SELECT title, agency, value_estimated, solicitation_number FROM opportunities WHERE id = $1", [gng.opportunity_id]);
        if (oppRows.length > 0) {
          oppTitle = oppRows[0].title || oppTitle;
          oppAgency = oppRows[0].agency || oppAgency;
          oppValue = oppRows[0].value_estimated || oppValue;
          oppSolId = oppRows[0].solicitation_number || "";
        }
      } catch { /* ok */ }
    }

    const { rows } = await pool.query(
      `INSERT INTO proposals (title, solicitation_id, agency, value_estimated, opportunity_id, shred_job_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [oppTitle, oppSolId, oppAgency, oppValue, gng.opportunity_id, gng.shred_job_id]
    );

    // Auto-create standard volumes
    const standardVolumes = [
      { volume_type: "executive_summary", title: "Executive Summary" },
      { volume_type: "technical", title: "Technical Approach" },
      { volume_type: "management", title: "Management Approach" },
      { volume_type: "past_performance", title: "Past Performance" },
      { volume_type: "cost_price", title: "Cost/Price Volume" },
    ];

    for (const vol of standardVolumes) {
      await pool.query(
        `INSERT INTO proposal_volumes (proposal_id, volume_type, title) VALUES ($1, $2, $3)`,
        [rows[0].id, vol.volume_type, vol.title]
      );
    }

    return res.json(successEnvelope(WF, "create-from-gng", { proposal: rows[0] }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "create-from-gng", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

// ============================================================================
// PROPOSAL SECTIONS (task-level management)
// ============================================================================

router.get("/proposals/:id/sections", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.json(successEnvelope(WF, "sections-list", { sections: [] }));

    const { rows } = await pool.query(
      `SELECT s.*, (SELECT count(*)::int FROM proposal_comments WHERE section_id = s.id AND resolved = false) as open_comments
       FROM proposal_sections s WHERE s.proposal_id = $1 ORDER BY s.volume, s.section_number, s.created_at`,
      [req.params.id]
    );

    return res.json(successEnvelope(WF, "sections-list", { sections: rows }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "sections-list", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

router.post("/proposals/:id/sections", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(503).json(errorEnvelope(WF, "create-section", { code: "DB_UNAVAILABLE", message: "DB not configured", detail: null }));

    const { volume, title, section_number, assigned_to, due_date, page_limit, compliance_requirements, win_themes } = req.body;

    if (!volume || !title) return res.status(400).json(errorEnvelope(WF, "create-section", { code: "VALIDATION", message: "volume and title are required", detail: null }));

    const { rows } = await pool.query(
      `INSERT INTO proposal_sections (proposal_id, volume, title, section_number, assigned_to, due_date, page_limit, compliance_requirements, win_themes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.params.id, volume, title, section_number ?? null, assigned_to ?? null, due_date ?? null, page_limit ?? null, JSON.stringify(compliance_requirements ?? []), JSON.stringify(win_themes ?? [])]
    );

    return res.json(successEnvelope(WF, "create-section", { section: rows[0] }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "create-section", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

router.patch("/proposals/:id/sections/:sectionId", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(503).json(errorEnvelope(WF, "update-section", { code: "DB_UNAVAILABLE", message: "DB not configured", detail: null }));

    const allowedFields = ["title", "section_number", "assigned_to", "status", "due_date", "page_limit", "content", "ai_draft", "compliance_requirements", "win_themes"];
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        const val = (field === "compliance_requirements" || field === "win_themes") ? JSON.stringify(req.body[field]) : req.body[field];
        updates.push(`${field} = $${idx++}`);
        params.push(val);
      }
    }

    // Auto-calculate word count if content is updated
    if (req.body.content !== undefined) {
      const wc = req.body.content.trim().split(/\s+/).filter(Boolean).length;
      updates.push(`word_count = $${idx++}`);
      params.push(wc);
    }

    if (updates.length === 0) return res.status(400).json(errorEnvelope(WF, "update-section", { code: "VALIDATION", message: "No valid fields to update", detail: null }));

    updates.push(`updated_at = now()`);
    params.push(req.params.sectionId);
    params.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE proposal_sections SET ${updates.join(", ")} WHERE id = $${idx} AND proposal_id = $${idx + 1} RETURNING *`,
      params
    );

    if (rows.length === 0) return res.status(404).json(errorEnvelope(WF, "update-section", { code: "NOT_FOUND", message: "Section not found", detail: null }));

    return res.json(successEnvelope(WF, "update-section", { section: rows[0] }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "update-section", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

router.delete("/proposals/:id/sections/:sectionId", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(503).json(errorEnvelope(WF, "delete-section", { code: "DB_UNAVAILABLE", message: "DB not configured", detail: null }));

    await pool.query("DELETE FROM proposal_sections WHERE id = $1 AND proposal_id = $2", [req.params.sectionId, req.params.id]);
    return res.json(successEnvelope(WF, "delete-section", { deleted: true }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "delete-section", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

// Section comments
router.get("/proposals/:id/sections/:sectionId/comments", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.json(successEnvelope(WF, "section-comments", { comments: [] }));

    const { rows } = await pool.query(
      "SELECT * FROM proposal_comments WHERE section_id = $1 ORDER BY created_at DESC",
      [req.params.sectionId]
    );

    return res.json(successEnvelope(WF, "section-comments", { comments: rows }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "section-comments", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

router.post("/proposals/:id/sections/:sectionId/comments", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(503).json(errorEnvelope(WF, "create-comment", { code: "DB_UNAVAILABLE", message: "DB not configured", detail: null }));

    const { author, content, comment_type } = req.body;
    if (!content) return res.status(400).json(errorEnvelope(WF, "create-comment", { code: "VALIDATION", message: "content is required", detail: null }));

    const { rows } = await pool.query(
      `INSERT INTO proposal_comments (section_id, author, content, comment_type)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.sectionId, author ?? "Unknown", content, comment_type ?? "general"]
    );

    return res.json(successEnvelope(WF, "create-comment", { comment: rows[0] }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "create-comment", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

// ============================================================================
// AI WRITING ENGINE
// ============================================================================

// Generate outline for a section
router.post("/proposals/:id/sections/:sectionId/generate-outline", async (req: Request, res: Response) => {
  try {
    if (!isLLMAvailable()) return res.status(503).json(errorEnvelope(WF, "generate-outline", { code: "AI_UNAVAILABLE", message: "No AI model configured", detail: null }));
    const pool = getPool();
    if (!pool) return res.status(503).json(errorEnvelope(WF, "generate-outline", { code: "DB_UNAVAILABLE", message: "DB not configured", detail: null }));

    const { rows: secRows } = await pool.query("SELECT * FROM proposal_sections WHERE id = $1", [req.params.sectionId]);
    if (secRows.length === 0) return res.status(404).json(errorEnvelope(WF, "generate-outline", { code: "NOT_FOUND", message: "Section not found", detail: null }));

    const section = secRows[0];

    // Gather context
    const { rows: propRows } = await pool.query("SELECT * FROM proposals WHERE id = $1", [req.params.id]);
    const proposal = propRows[0] ?? {};

    let companyInfo = "Envision Innovative Solutions — SDVOSB, defense IT, cyber, SETA, C5ISR";
    try {
      const { rows } = await pool.query("SELECT * FROM company_profile LIMIT 1");
      if (rows.length > 0) companyInfo = JSON.stringify(rows[0]);
    } catch { /* */ }

    const messages = [
      {
        role: "system" as const,
        content: `You are an expert government proposal writer for Envision Innovative Solutions. Generate a detailed outline for a proposal section.

The outline should include:
- Main topics and subtopics with clear hierarchy
- Key points to cover under each topic
- Suggested evidence/past performance to reference
- Compliance requirement mapping notes
- Approximate word count per subsection

Format as a structured outline with numbered headings.`,
      },
      {
        role: "user" as const,
        content: `PROPOSAL: ${proposal.title || "Untitled"} for ${proposal.agency || "Unknown Agency"}
VOLUME: ${section.volume}
SECTION: ${section.title} (${section.section_number || "N/A"})
PAGE LIMIT: ${section.page_limit || "Not specified"}
WIN THEMES: ${JSON.stringify(section.win_themes || [])}
COMPLIANCE REQUIREMENTS: ${JSON.stringify(section.compliance_requirements || [])}
COMPANY: ${companyInfo}

Generate a detailed outline for this section.`,
      },
    ];

    const result = await chatCompletion(messages, { tier: "deep", max_tokens: 2048 });

    // Store outline as ai_draft
    await pool.query(
      "UPDATE proposal_sections SET ai_draft = $1, updated_at = now() WHERE id = $2",
      [result.content, req.params.sectionId]
    );

    return res.json(successEnvelope(WF, "generate-outline", {
      outline: result.content,
      model: result.model,
      tier: result.tier,
    }));
  } catch (err) {
    log.error("generate_outline_error", { error: (err as Error).message });
    return res.status(500).json(errorEnvelope(WF, "generate-outline", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

// Generate full draft for a section (SSE streaming)
router.post("/proposals/:id/sections/:sectionId/generate-draft", async (req: Request, res: Response) => {
  try {
    if (!isLLMAvailable()) return res.status(503).json(errorEnvelope(WF, "generate-draft", { code: "AI_UNAVAILABLE", message: "No AI model configured", detail: null }));
    const pool = getPool();
    if (!pool) return res.status(503).json(errorEnvelope(WF, "generate-draft", { code: "DB_UNAVAILABLE", message: "DB not configured", detail: null }));

    const { rows: secRows } = await pool.query("SELECT * FROM proposal_sections WHERE id = $1", [req.params.sectionId]);
    if (secRows.length === 0) return res.status(404).json(errorEnvelope(WF, "generate-draft", { code: "NOT_FOUND", message: "Section not found", detail: null }));

    const section = secRows[0];
    const { rows: propRows } = await pool.query("SELECT * FROM proposals WHERE id = $1", [req.params.id]);
    const proposal = propRows[0] ?? {};

    // Gather RAG context if available
    let ragContext = "";
    if (isEmbeddingAvailable()) {
      try {
        const query = `${section.title} ${section.volume} ${proposal.agency || ""} government proposal`;
        const results = await vectorSearch(query, 5);
        if (results.length > 0) {
          ragContext = results.map((r) => `[Source: ${r.document_title || "KB Doc"}]\n${r.chunk_text}`).join("\n\n---\n\n");
        }
      } catch { /* */ }
    }

    // Fetch past performance
    let ppContext = "";
    try {
      const { rows } = await pool.query("SELECT contract_name, agency, description, performance_rating FROM cpars_records ORDER BY performance_rating DESC LIMIT 5");
      if (rows.length > 0) ppContext = rows.map((r: Record<string, unknown>) => `${r.contract_name} (${r.agency}): ${r.description} [Rating: ${r.performance_rating}]`).join("\n");
    } catch { /* */ }

    let companyInfo = "Envision Innovative Solutions — SDVOSB, defense IT, cyber, SETA, C5ISR";
    try {
      const { rows } = await pool.query("SELECT * FROM company_profile LIMIT 1");
      if (rows.length > 0) companyInfo = JSON.stringify(rows[0]);
    } catch { /* */ }

    const outline = section.ai_draft || "";

    const messages = [
      {
        role: "system" as const,
        content: `You are an expert government proposal writer for Envision Innovative Solutions, a Service-Disabled Veteran-Owned Small Business specializing in defense IT, cybersecurity, Army SETA support, and C5ISR systems engineering.

Write a proposal section that:
- Directly addresses each requirement from the SOW/PWS
- Incorporates specific past performance with quantitative results
- Weaves in the provided win themes naturally
- Uses active voice, confident tone, evaluator-friendly language
- Includes competitive discriminators where appropriate
- Follows Shipley proposal writing best practices
- Stays within the page limit constraint
- Uses markdown formatting for headings, lists, bold emphasis`,
      },
      {
        role: "user" as const,
        content: `PROPOSAL: ${proposal.title || "Untitled"} for ${proposal.agency || "Unknown Agency"}
SECTION: ${section.title} (Volume: ${section.volume})
PAGE LIMIT: ${section.page_limit || "Not specified"} pages

WIN THEMES:
${JSON.stringify(section.win_themes || proposal.win_themes || [])}

COMPLIANCE REQUIREMENTS:
${JSON.stringify(section.compliance_requirements || [])}

${outline ? `OUTLINE TO FOLLOW:\n${outline}\n` : ""}

COMPANY CAPABILITIES:
${companyInfo}

PAST PERFORMANCE REFERENCES:
${ppContext || "No CPARS records available — use general Envision capabilities"}

${ragContext ? `RELEVANT KNOWLEDGE BASE DOCUMENTS:\n${ragContext}` : ""}

Write the complete section draft now.`,
      },
    ];

    // Use streaming for real-time response
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullDraft = "";
    try {
      for await (const chunk of chatCompletionStream(messages, { max_tokens: 4096 })) {
        fullDraft += chunk;
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      }
    } catch (streamErr) {
      // Fallback to non-streaming
      const result = await chatCompletion(messages, { tier: "deep", max_tokens: 4096 });
      fullDraft = result.content;
      res.write(`data: ${JSON.stringify({ chunk: fullDraft })}\n\n`);
    }

    // Save draft
    const wc = fullDraft.trim().split(/\s+/).filter(Boolean).length;
    await pool.query(
      "UPDATE proposal_sections SET ai_draft = $1, word_count = $2, updated_at = now() WHERE id = $3",
      [fullDraft, wc, req.params.sectionId]
    );

    res.write(`data: ${JSON.stringify({ done: true, word_count: wc })}\n\n`);
    res.end();
  } catch (err) {
    log.error("generate_draft_error", { error: (err as Error).message });
    if (!res.headersSent) {
      return res.status(500).json(errorEnvelope(WF, "generate-draft", { code: "INTERNAL", message: (err as Error).message, detail: null }));
    }
    res.write(`data: ${JSON.stringify({ error: (err as Error).message })}\n\n`);
    res.end();
  }
});

// Enhance a section (single-call transforms)
router.post("/proposals/:id/sections/:sectionId/enhance", async (req: Request, res: Response) => {
  try {
    if (!isLLMAvailable()) return res.status(503).json(errorEnvelope(WF, "enhance-section", { code: "AI_UNAVAILABLE", message: "No AI model configured", detail: null }));
    const pool = getPool();
    if (!pool) return res.status(503).json(errorEnvelope(WF, "enhance-section", { code: "DB_UNAVAILABLE", message: "DB not configured", detail: null }));

    const { transform } = req.body;
    const validTransforms = ["expand", "add_past_performance", "strengthen_win_themes", "compliance_check", "adjust_tone_formal", "adjust_tone_executive", "shorten"];
    if (!transform || !validTransforms.includes(transform)) {
      return res.status(400).json(errorEnvelope(WF, "enhance-section", { code: "VALIDATION", message: `Invalid transform. Valid: ${validTransforms.join(", ")}`, detail: null }));
    }

    const { rows: secRows } = await pool.query("SELECT * FROM proposal_sections WHERE id = $1", [req.params.sectionId]);
    if (secRows.length === 0) return res.status(404).json(errorEnvelope(WF, "enhance-section", { code: "NOT_FOUND", message: "Section not found", detail: null }));

    const section = secRows[0];
    const currentText = section.content || section.ai_draft || "";
    if (!currentText.trim()) return res.status(400).json(errorEnvelope(WF, "enhance-section", { code: "VALIDATION", message: "Section has no content to enhance", detail: null }));

    const transformPrompts: Record<string, string> = {
      expand: "Expand this section with more detail, evidence, and specifics. Add concrete examples and quantitative data where possible. Maintain the same structure and tone.",
      add_past_performance: "Add relevant past performance references throughout this section. Reference specific contract names, agencies, quantitative achievements, and CPARS ratings. Make the references flow naturally into the existing text.",
      strengthen_win_themes: "Strengthen the win themes throughout this section. Make competitive discriminators more prominent, add ghost statements that subtly highlight competitor weaknesses, and emphasize Envision's unique advantages.",
      compliance_check: "Review this section for compliance with all solicitation requirements. Return a JSON object with: { 'compliant_items': [{requirement, evidence}], 'gaps': [{requirement, recommendation}], 'score': 0-100, 'summary': 'assessment' }",
      adjust_tone_formal: "Rewrite this section in a more formal, technical tone suitable for a government evaluation panel. Use precise language, avoid colloquialisms, maintain active voice.",
      adjust_tone_executive: "Rewrite this section as an executive summary — concise, high-level, focused on business impact and strategic value. Remove technical details in favor of outcomes and ROI.",
      shorten: "Shorten this section by 30-40% while preserving all key points and compliance elements. Remove redundancy, tighten prose, eliminate filler.",
    };

    const messages = [
      {
        role: "system" as const,
        content: `You are an expert government proposal editor for Envision Innovative Solutions. ${transformPrompts[transform]}`,
      },
      {
        role: "user" as const,
        content: `SECTION TITLE: ${section.title}\nVOLUME: ${section.volume}\n\nCURRENT TEXT:\n${currentText}`,
      },
    ];

    const isComplianceCheck = transform === "compliance_check";
    const result = await chatCompletion(messages, {
      tier: "deep",
      max_tokens: 4096,
      ...(isComplianceCheck ? { response_format: { type: "json_object" } } : {}),
    });

    // For non-compliance transforms, save the enhanced text
    if (!isComplianceCheck) {
      const wc = result.content.trim().split(/\s+/).filter(Boolean).length;
      await pool.query(
        "UPDATE proposal_sections SET ai_draft = $1, word_count = $2, updated_at = now() WHERE id = $3",
        [result.content, wc, req.params.sectionId]
      );
    }

    return res.json(successEnvelope(WF, "enhance-section", {
      result: result.content,
      transform,
      model: result.model,
      tier: result.tier,
    }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "enhance-section", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

// Ask AI about a specific section
router.post("/proposals/:id/sections/:sectionId/ask-ai", async (req: Request, res: Response) => {
  try {
    if (!isLLMAvailable()) return res.status(503).json(errorEnvelope(WF, "ask-ai", { code: "AI_UNAVAILABLE", message: "No AI model configured", detail: null }));
    const pool = getPool();
    if (!pool) return res.status(503).json(errorEnvelope(WF, "ask-ai", { code: "DB_UNAVAILABLE", message: "DB not configured", detail: null }));

    const { question } = req.body;
    if (!question) return res.status(400).json(errorEnvelope(WF, "ask-ai", { code: "VALIDATION", message: "question is required", detail: null }));

    const { rows: secRows } = await pool.query("SELECT * FROM proposal_sections WHERE id = $1", [req.params.sectionId]);
    const section = secRows[0] ?? {};

    const messages = [
      {
        role: "system" as const,
        content: `You are an expert government proposal assistant for Envision Innovative Solutions. Help the proposal writer with their question about this specific section. Be concise and actionable.`,
      },
      {
        role: "user" as const,
        content: `SECTION: ${section.title || "Unknown"} (Volume: ${section.volume || "Unknown"})
CURRENT CONTENT: ${(section.content || section.ai_draft || "No content yet").slice(0, 3000)}

QUESTION: ${question}`,
      },
    ];

    const result = await chatCompletion(messages, { tier: "fast", max_tokens: 1024 });

    // Save as AI suggestion comment
    if (secRows.length > 0) {
      await pool.query(
        `INSERT INTO proposal_comments (section_id, author, content, comment_type)
         VALUES ($1, 'AI Assistant', $2, 'ai_suggestion')`,
        [req.params.sectionId, result.content]
      );
    }

    return res.json(successEnvelope(WF, "ask-ai", {
      answer: result.content,
      model: result.model,
    }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "ask-ai", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

// ============================================================================
// ANSWER BANK
// ============================================================================

router.get("/answer-bank", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.json(successEnvelope(WF, "answer-bank-list", { entries: [] }));

    const { category, search } = req.query;
    let query = "SELECT * FROM answer_bank WHERE 1=1";
    const params: unknown[] = [];
    let idx = 1;

    if (category && typeof category === "string") {
      query += ` AND category = $${idx++}`;
      params.push(category);
    }
    if (search && typeof search === "string") {
      query += ` AND (question ILIKE $${idx} OR answer ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    query += " ORDER BY times_used DESC, created_at DESC";

    const { rows } = await pool.query(query, params);
    return res.json(successEnvelope(WF, "answer-bank-list", { entries: rows, total: rows.length }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "answer-bank-list", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

router.post("/answer-bank", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(503).json(errorEnvelope(WF, "create-answer", { code: "DB_UNAVAILABLE", message: "DB not configured", detail: null }));

    const { question, answer, category, tags } = req.body;
    if (!question || !answer) return res.status(400).json(errorEnvelope(WF, "create-answer", { code: "VALIDATION", message: "question and answer are required", detail: null }));

    const { rows } = await pool.query(
      `INSERT INTO answer_bank (question, answer, category, tags)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [question, answer, category ?? null, tags ?? []]
    );

    return res.json(successEnvelope(WF, "create-answer", { entry: rows[0] }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "create-answer", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

router.patch("/answer-bank/:id", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(503).json(errorEnvelope(WF, "update-answer", { code: "DB_UNAVAILABLE", message: "DB not configured", detail: null }));

    const { question, answer, category, tags } = req.body;
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (question !== undefined) { updates.push(`question = $${idx++}`); params.push(question); }
    if (answer !== undefined) { updates.push(`answer = $${idx++}`); params.push(answer); }
    if (category !== undefined) { updates.push(`category = $${idx++}`); params.push(category); }
    if (tags !== undefined) { updates.push(`tags = $${idx++}`); params.push(tags); }

    if (updates.length === 0) return res.status(400).json(errorEnvelope(WF, "update-answer", { code: "VALIDATION", message: "No fields to update", detail: null }));

    params.push(req.params.id);
    const { rows } = await pool.query(`UPDATE answer_bank SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`, params);

    if (rows.length === 0) return res.status(404).json(errorEnvelope(WF, "update-answer", { code: "NOT_FOUND", message: "Entry not found", detail: null }));

    return res.json(successEnvelope(WF, "update-answer", { entry: rows[0] }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "update-answer", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

router.delete("/answer-bank/:id", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(503).json(errorEnvelope(WF, "delete-answer", { code: "DB_UNAVAILABLE", message: "DB not configured", detail: null }));

    await pool.query("DELETE FROM answer_bank WHERE id = $1", [req.params.id]);
    return res.json(successEnvelope(WF, "delete-answer", { deleted: true }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "delete-answer", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

// ============================================================================
// AI-POWERED REVIEW
// ============================================================================

router.post("/proposals/:id/ai-review", async (req: Request, res: Response) => {
  try {
    if (!isLLMAvailable()) return res.status(503).json(errorEnvelope(WF, "ai-review", { code: "AI_UNAVAILABLE", message: "No AI model configured", detail: null }));
    const pool = getPool();
    if (!pool) return res.status(503).json(errorEnvelope(WF, "ai-review", { code: "DB_UNAVAILABLE", message: "DB not configured", detail: null }));

    const { review_type } = req.body;
    const validTypes = ["compliance_scan", "strength_weakness", "score_prediction"];
    if (!review_type || !validTypes.includes(review_type)) {
      return res.status(400).json(errorEnvelope(WF, "ai-review", { code: "VALIDATION", message: `Invalid review_type. Valid: ${validTypes.join(", ")}`, detail: null }));
    }

    // Gather all sections for this proposal
    const { rows: secRows } = await pool.query(
      "SELECT title, volume, content, ai_draft, compliance_requirements FROM proposal_sections WHERE proposal_id = $1 ORDER BY volume, section_number",
      [req.params.id]
    );

    const { rows: propRows } = await pool.query("SELECT * FROM proposals WHERE id = $1", [req.params.id]);
    const proposal = propRows[0] ?? {};

    const fullProposalText = secRows.map((s: Record<string, unknown>) =>
      `## ${s.volume} — ${s.title}\n\n${(s.content as string) || (s.ai_draft as string) || "(No content yet)"}`
    ).join("\n\n---\n\n");

    const allRequirements = secRows.flatMap((s: Record<string, unknown>) => {
      const reqs = s.compliance_requirements;
      return Array.isArray(reqs) ? reqs : [];
    });

    const reviewPrompts: Record<string, string> = {
      compliance_scan: `Perform a comprehensive compliance scan of this government proposal. Check every section against the listed requirements.

Return JSON:
{
  "overall_score": <0-100>,
  "summary": "<2-3 sentence assessment>",
  "findings": [
    { "type": "compliant" | "gap" | "partial", "requirement": "<requirement text>", "section": "<section where found/missing>", "detail": "<explanation>", "severity": "critical" | "major" | "minor" }
  ],
  "compliant_count": <number>,
  "gap_count": <number>,
  "partial_count": <number>
}`,
      strength_weakness: `Analyze this government proposal and identify strengths and weaknesses from an evaluator's perspective.

Return JSON:
{
  "overall_score": <0-100>,
  "summary": "<assessment>",
  "findings": [
    { "type": "strength" | "weakness" | "significant_strength" | "significant_weakness", "section": "<section>", "detail": "<specific finding>", "recommendation": "<if weakness, how to fix>" }
  ]
}`,
      score_prediction: `Predict how this proposal would score in a government best-value evaluation. Consider Technical Approach (40%), Management (25%), Past Performance (20%), and Cost (15%).

Return JSON:
{
  "overall_score": <0-100>,
  "summary": "<prediction>",
  "findings": [
    { "type": "score", "section": "<evaluation factor>", "detail": "<assessment>", "score": <0-100>, "weight": <percentage>, "rating": "Outstanding" | "Good" | "Acceptable" | "Marginal" | "Unacceptable" }
  ],
  "predicted_rating": "Outstanding" | "Good" | "Acceptable" | "Marginal" | "Unacceptable",
  "win_probability": <0-100>
}`,
    };

    const messages = [
      {
        role: "system" as const,
        content: `You are an expert government proposal evaluator. ${reviewPrompts[review_type]}`,
      },
      {
        role: "user" as const,
        content: `PROPOSAL: ${proposal.title || "Untitled"} (${proposal.agency || "Unknown Agency"})
WIN THEMES: ${JSON.stringify(proposal.win_themes || [])}

COMPLIANCE REQUIREMENTS:
${allRequirements.length > 0 ? JSON.stringify(allRequirements) : "Not specified"}

FULL PROPOSAL TEXT:
${fullProposalText.slice(0, 15000)}`,
      },
    ];

    const result = await chatCompletion(messages, { tier: "deep", max_tokens: 4096, response_format: { type: "json_object" } });

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(result.content);
    } catch {
      parsed = { overall_score: 0, summary: result.content, findings: [] };
    }

    const { rows } = await pool.query(
      `INSERT INTO ai_review_results (proposal_id, review_type, findings, overall_score, summary, model, tokens_used)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        req.params.id,
        review_type,
        JSON.stringify(parsed.findings ?? []),
        (parsed.overall_score as number) ?? 0,
        (parsed.summary as string) ?? "",
        result.model,
        result.usage.total_tokens,
      ]
    );

    return res.json(successEnvelope(WF, "ai-review", {
      review: { ...rows[0], ...parsed },
      model: result.model,
      tier: result.tier,
    }));
  } catch (err) {
    log.error("ai_review_error", { error: (err as Error).message });
    return res.status(500).json(errorEnvelope(WF, "ai-review", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

// Get AI review history for a proposal
router.get("/proposals/:id/ai-reviews", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.json(successEnvelope(WF, "ai-reviews-history", { reviews: [] }));

    const { rows } = await pool.query(
      "SELECT * FROM ai_review_results WHERE proposal_id = $1 ORDER BY created_at DESC",
      [req.params.id]
    );

    return res.json(successEnvelope(WF, "ai-reviews-history", { reviews: rows }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "ai-reviews-history", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

// AI fix suggestion for a specific finding
router.post("/proposals/:id/ai-review/suggest-fix", async (req: Request, res: Response) => {
  try {
    if (!isLLMAvailable()) return res.status(503).json(errorEnvelope(WF, "suggest-fix", { code: "AI_UNAVAILABLE", message: "No AI model configured", detail: null }));
    const pool = getPool();
    if (!pool) return res.status(503).json(errorEnvelope(WF, "suggest-fix", { code: "DB_UNAVAILABLE", message: "DB not configured", detail: null }));

    const { finding, section_title, current_text } = req.body;
    if (!finding) return res.status(400).json(errorEnvelope(WF, "suggest-fix", { code: "VALIDATION", message: "finding is required", detail: null }));

    const messages = [
      {
        role: "system" as const,
        content: `You are an expert government proposal editor. Suggest a specific text fix for the identified weakness or gap in this proposal section. Provide the exact revised text that should replace the problematic area.`,
      },
      {
        role: "user" as const,
        content: `FINDING: ${typeof finding === "string" ? finding : JSON.stringify(finding)}
SECTION: ${section_title || "Unknown"}
CURRENT TEXT: ${(current_text || "").slice(0, 3000)}

Suggest a specific fix. Return the revised text and explain the change.`,
      },
    ];

    const result = await chatCompletion(messages, { tier: "fast", max_tokens: 2048 });

    return res.json(successEnvelope(WF, "suggest-fix", {
      suggestion: result.content,
      model: result.model,
    }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "suggest-fix", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

// ============================================================================
// VOLUME MANAGEMENT
// ============================================================================

router.post("/proposals/:id/volumes", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(503).json(errorEnvelope(WF, "create-volume", { code: "DB_UNAVAILABLE", message: "DB not configured", detail: null }));

    const { volume_type, title } = req.body;
    if (!volume_type || !title) return res.status(400).json(errorEnvelope(WF, "create-volume", { code: "VALIDATION", message: "volume_type and title required", detail: null }));

    const { rows } = await pool.query(
      "INSERT INTO proposal_volumes (proposal_id, volume_type, title) VALUES ($1, $2, $3) RETURNING *",
      [req.params.id, volume_type, title]
    );

    return res.json(successEnvelope(WF, "create-volume", { volume: rows[0] }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "create-volume", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

router.patch("/proposals/:id/volumes/:volumeId", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(503).json(errorEnvelope(WF, "update-volume", { code: "DB_UNAVAILABLE", message: "DB not configured", detail: null }));

    const allowedFields = ["title", "page_count", "word_count", "compliance_score", "last_editor"];
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${idx++}`);
        params.push(req.body[field]);
      }
    }

    if (updates.length === 0) return res.status(400).json(errorEnvelope(WF, "update-volume", { code: "VALIDATION", message: "No fields to update", detail: null }));

    updates.push(`updated_at = now()`);
    params.push(req.params.volumeId);
    params.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE proposal_volumes SET ${updates.join(", ")} WHERE id = $${idx} AND proposal_id = $${idx + 1} RETURNING *`,
      params
    );

    if (rows.length === 0) return res.status(404).json(errorEnvelope(WF, "update-volume", { code: "NOT_FOUND", message: "Volume not found", detail: null }));

    return res.json(successEnvelope(WF, "update-volume", { volume: rows[0] }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "update-volume", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

// ============================================================================
// RED TEAM FINDINGS
// ============================================================================

router.post("/proposals/:id/findings", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(503).json(errorEnvelope(WF, "create-finding", { code: "DB_UNAVAILABLE", message: "DB not configured", detail: null }));

    const { severity, section, finding, recommendation, assigned_to } = req.body;
    if (!finding) return res.status(400).json(errorEnvelope(WF, "create-finding", { code: "VALIDATION", message: "finding is required", detail: null }));

    const { rows } = await pool.query(
      `INSERT INTO proposal_red_team_findings (proposal_id, severity, section, finding, recommendation, assigned_to)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.id, severity ?? "minor", section ?? null, finding, recommendation ?? null, assigned_to ?? null]
    );

    return res.json(successEnvelope(WF, "create-finding", { finding: rows[0] }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "create-finding", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

router.patch("/proposals/:id/findings/:findingId", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(503).json(errorEnvelope(WF, "update-finding", { code: "DB_UNAVAILABLE", message: "DB not configured", detail: null }));

    const { status, assigned_to, recommendation } = req.body;
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (status !== undefined) { updates.push(`status = $${idx++}`); params.push(status); }
    if (assigned_to !== undefined) { updates.push(`assigned_to = $${idx++}`); params.push(assigned_to); }
    if (recommendation !== undefined) { updates.push(`recommendation = $${idx++}`); params.push(recommendation); }
    if (status === "addressed") { updates.push(`resolved_at = now()`); }

    if (updates.length === 0) return res.status(400).json(errorEnvelope(WF, "update-finding", { code: "VALIDATION", message: "No fields to update", detail: null }));

    params.push(req.params.findingId);
    const { rows } = await pool.query(
      `UPDATE proposal_red_team_findings SET ${updates.join(", ")} WHERE id = $${idx} AND proposal_id = '${req.params.id}' RETURNING *`,
      params
    );

    if (rows.length === 0) return res.status(404).json(errorEnvelope(WF, "update-finding", { code: "NOT_FOUND", message: "Finding not found", detail: null }));

    return res.json(successEnvelope(WF, "update-finding", { finding: rows[0] }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "update-finding", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

// ============================================================================
// TIMELINE MANAGEMENT
// ============================================================================

router.patch("/proposals/:id/timeline/:milestoneId", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(503).json(errorEnvelope(WF, "update-milestone", { code: "DB_UNAVAILABLE", message: "DB not configured", detail: null }));

    const { milestone, due_date, status, owner, notes } = req.body;
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (milestone !== undefined) { updates.push(`milestone = $${idx++}`); params.push(milestone); }
    if (due_date !== undefined) { updates.push(`due_date = $${idx++}`); params.push(due_date); }
    if (status !== undefined) { updates.push(`status = $${idx++}`); params.push(status); }
    if (owner !== undefined) { updates.push(`owner = $${idx++}`); params.push(owner); }
    if (notes !== undefined) { updates.push(`notes = $${idx++}`); params.push(notes); }

    if (updates.length === 0) return res.status(400).json(errorEnvelope(WF, "update-milestone", { code: "VALIDATION", message: "No fields to update", detail: null }));

    params.push(req.params.milestoneId);
    params.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE proposal_timeline SET ${updates.join(", ")} WHERE id = $${idx} AND proposal_id = $${idx + 1} RETURNING *`,
      params
    );

    if (rows.length === 0) return res.status(404).json(errorEnvelope(WF, "update-milestone", { code: "NOT_FOUND", message: "Milestone not found", detail: null }));

    return res.json(successEnvelope(WF, "update-milestone", { milestone: rows[0] }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "update-milestone", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

// ============================================================================
// SCORECARD
// ============================================================================

router.post("/proposals/:id/scorecard", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(503).json(errorEnvelope(WF, "create-score", { code: "DB_UNAVAILABLE", message: "DB not configured", detail: null }));

    const { criteria, weight, score, max_score, notes, evaluator } = req.body;
    if (!criteria) return res.status(400).json(errorEnvelope(WF, "create-score", { code: "VALIDATION", message: "criteria is required", detail: null }));

    const { rows } = await pool.query(
      `INSERT INTO proposal_scorecard (proposal_id, criteria, weight, score, max_score, notes, evaluator)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.params.id, criteria, weight ?? 1, score ?? 0, max_score ?? 10, notes ?? "", evaluator ?? null]
    );

    return res.json(successEnvelope(WF, "create-score", { score: rows[0] }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "create-score", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

router.patch("/proposals/:id/scorecard/:scoreId", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(503).json(errorEnvelope(WF, "update-score", { code: "DB_UNAVAILABLE", message: "DB not configured", detail: null }));

    const { score, notes, evaluator } = req.body;
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (score !== undefined) { updates.push(`score = $${idx++}`); params.push(score); }
    if (notes !== undefined) { updates.push(`notes = $${idx++}`); params.push(notes); }
    if (evaluator !== undefined) { updates.push(`evaluator = $${idx++}`); params.push(evaluator); }

    if (updates.length === 0) return res.status(400).json(errorEnvelope(WF, "update-score", { code: "VALIDATION", message: "No fields to update", detail: null }));

    params.push(req.params.scoreId);
    const { rows } = await pool.query(`UPDATE proposal_scorecard SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`, params);

    if (rows.length === 0) return res.status(404).json(errorEnvelope(WF, "update-score", { code: "NOT_FOUND", message: "Score not found", detail: null }));

    return res.json(successEnvelope(WF, "update-score", { score: rows[0] }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "update-score", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

// ============================================================================
// PROPOSAL ENGINE SUMMARY (for dashboard cards)
// ============================================================================

router.get("/summary", async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.json(successEnvelope(WF, "engine-summary", {
      total_proposals: 0, active_proposals: 0, total_sections: 0, sections_complete: 0, go_no_go_count: 0, answer_bank_count: 0, ai_reviews_count: 0,
    }));

    const [propRes, secRes, gngRes, abRes, arRes] = await Promise.all([
      pool.query("SELECT count(*)::int as total, count(*) FILTER (WHERE status NOT IN ('submitted','archived'))::int as active FROM proposals").catch(() => ({ rows: [{ total: 0, active: 0 }] })),
      pool.query("SELECT count(*)::int as total, count(*) FILTER (WHERE status IN ('final','submitted'))::int as complete FROM proposal_sections").catch(() => ({ rows: [{ total: 0, complete: 0 }] })),
      pool.query("SELECT count(*)::int as cnt FROM go_no_go_assessments").catch(() => ({ rows: [{ cnt: 0 }] })),
      pool.query("SELECT count(*)::int as cnt FROM answer_bank").catch(() => ({ rows: [{ cnt: 0 }] })),
      pool.query("SELECT count(*)::int as cnt FROM ai_review_results").catch(() => ({ rows: [{ cnt: 0 }] })),
    ]);

    return res.json(successEnvelope(WF, "engine-summary", {
      total_proposals: propRes.rows[0].total,
      active_proposals: propRes.rows[0].active,
      total_sections: secRes.rows[0].total,
      sections_complete: secRes.rows[0].complete,
      go_no_go_count: gngRes.rows[0].cnt,
      answer_bank_count: abRes.rows[0].cnt,
      ai_reviews_count: arRes.rows[0].cnt,
    }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(WF, "engine-summary", { code: "INTERNAL", message: (err as Error).message, detail: null }));
  }
});

export default router;
