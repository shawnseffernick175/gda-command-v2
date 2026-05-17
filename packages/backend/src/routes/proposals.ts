import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { chatCompletion, isLLMAvailable, SYSTEM_PROMPTS } from "../lib/llm";
import type { Proposal, ProposalStatus, ProposalSection } from "@gda/shared";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/proposals — list proposals with filters
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.json(
        successEnvelope("GDA.proposals", "list", {
          proposals: [],
          total: 0,
          filtered: 0,
          summary: { statusCounts: {}, totalValue: 0, avgCompliance: 0, totalRedTeamOpen: 0, agencies: [] },
          source: "db" as const,
        }),
      );
    }

    const { status, agency, search } = req.query;

    let query = `SELECT * FROM proposals`;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (status && typeof status === "string") {
      conditions.push(`status = $${idx++}`);
      params.push(status);
    }
    if (agency && typeof agency === "string") {
      conditions.push(`agency = $${idx++}`);
      params.push(agency);
    }
    if (search && typeof search === "string") {
      conditions.push(`(title ILIKE $${idx} OR solicitation_title ILIKE $${idx} OR agency ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(" AND ");
    }
    query += ` ORDER BY updated_at DESC`;

    const result = await pool.query(query, params);
    const items = result.rows.map(rowToProposal);

    // Summary from full set
    const allResult = await pool.query(`SELECT * FROM proposals`);
    const all = allResult.rows.map(rowToProposal);

    const statusCounts: Record<string, number> = {};
    for (const p of all) {
      statusCounts[p.status] = (statusCounts[p.status] ?? 0) + 1;
    }
    const totalValue = all.reduce((sum, p) => sum + p.value_estimated, 0);
    const activeProposals = all.filter((p) => !["submitted", "archived"].includes(p.status));
    const avgCompliance =
      activeProposals.length > 0
        ? Math.round(activeProposals.reduce((sum, p) => sum + p.compliance_score, 0) / activeProposals.length)
        : 0;
    const totalRedTeamOpen = all.reduce(
      (sum, p) => sum + (p.red_team_findings ?? []).filter((f) => f.status === "open").length,
      0,
    );
    const agencies = Array.from(new Set(all.map((p) => p.agency)));

    res.json(
      successEnvelope("GDA.proposals", "list", {
        proposals: items,
        total: all.length,
        filtered: items.length,
        summary: { statusCounts, totalValue, avgCompliance, totalRedTeamOpen, agencies },
        source: "db" as const,
      }),
    );
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.proposals", "list", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// GET /api/proposals/:id — single proposal detail + sections
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.status(404).json(
        errorEnvelope("GDA.proposals", "get-detail", { code: "NOT_FOUND", message: "Database unavailable", detail: null }),
      );
    }

    const result = await pool.query(`SELECT * FROM proposals WHERE id = $1`, [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json(
        errorEnvelope("GDA.proposals", "get-detail", { code: "NOT_FOUND", message: `Proposal ${req.params.id} not found`, detail: null }),
      );
    }

    const proposal = rowToProposal(result.rows[0]);

    // Fetch sections
    const sectionsResult = await pool.query(
      `SELECT * FROM proposal_sections WHERE proposal_id = $1 ORDER BY volume_type, sort_order`,
      [req.params.id],
    );
    const sections: ProposalSection[] = sectionsResult.rows.map(rowToSection);

    res.json(successEnvelope("GDA.proposals", "get-detail", { proposal, sections, source: "db" as const }));
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.proposals", "get-detail", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// POST /api/proposals — create a new proposal
// ---------------------------------------------------------------------------
router.post("/", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.status(500).json(errorEnvelope("GDA.proposals", "create", { code: "DB_UNAVAILABLE", message: "Database unavailable", detail: null }));
    }

    const {
      title,
      solicitation_id,
      solicitation_title,
      agency,
      value_estimated,
      due_date,
      capture_manager,
      proposal_manager,
      win_themes,
      win_theme_details,
      linked_opportunity_id,
      linked_shred_job_id,
    } = req.body;

    if (!title || !agency) {
      return res.status(400).json(errorEnvelope("GDA.proposals", "create", { code: "VALIDATION", message: "Title and agency are required", detail: null }));
    }

    const id = `PROP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await pool.query(
      `INSERT INTO proposals (id, title, solicitation_id, solicitation_title, agency, status, value_estimated, due_date, capture_manager, proposal_manager, win_themes, win_theme_details, linked_opportunity_id, linked_shred_job_id, volumes, red_team_findings, scorecard, timeline, compliance_score, overall_score)
       VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9, $10, $11, $12, $13, '[]', '[]', '[]', '[]', 0, 0)`,
      [id, title, solicitation_id ?? null, solicitation_title ?? null, agency, value_estimated ?? 0, due_date ?? null, capture_manager ?? null, proposal_manager ?? null, win_themes ?? [], JSON.stringify(win_theme_details ?? []), linked_opportunity_id ?? null, linked_shred_job_id ?? null],
    );

    const result = await pool.query(`SELECT * FROM proposals WHERE id = $1`, [id]);
    const proposal = rowToProposal(result.rows[0]);

    res.status(201).json(successEnvelope("GDA.proposals", "create", { proposal, source: "db" as const }));
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.proposals", "create", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// PUT /api/proposals/:id — update a proposal
// ---------------------------------------------------------------------------
router.put("/:id", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.status(500).json(errorEnvelope("GDA.proposals", "update", { code: "DB_UNAVAILABLE", message: "Database unavailable", detail: null }));
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    const allowed = ["title", "solicitation_id", "solicitation_title", "agency", "status", "value_estimated", "due_date", "submission_date", "capture_manager", "proposal_manager", "compliance_score", "overall_score"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        params.push(req.body[key]);
      }
    }

    // JSON fields
    const jsonFields = ["win_themes", "win_theme_details", "volumes", "red_team_findings", "scorecard", "timeline", "storyboard", "outline"];
    for (const key of jsonFields) {
      if (req.body[key] !== undefined) {
        if (key === "win_themes") {
          fields.push(`${key} = $${idx++}`);
          params.push(req.body[key]);
        } else {
          fields.push(`${key} = $${idx++}`);
          params.push(JSON.stringify(req.body[key]));
        }
      }
    }

    if (fields.length === 0) {
      return res.status(400).json(errorEnvelope("GDA.proposals", "update", { code: "VALIDATION", message: "No fields to update", detail: null }));
    }

    fields.push(`updated_at = NOW()`);
    params.push(req.params.id);

    await pool.query(`UPDATE proposals SET ${fields.join(", ")} WHERE id = $${idx}`, params);

    const result = await pool.query(`SELECT * FROM proposals WHERE id = $1`, [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json(errorEnvelope("GDA.proposals", "update", { code: "NOT_FOUND", message: "Proposal not found", detail: null }));
    }

    res.json(successEnvelope("GDA.proposals", "update", { proposal: rowToProposal(result.rows[0]), source: "db" as const }));
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.proposals", "update", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/proposals/:id
// ---------------------------------------------------------------------------
router.delete("/:id", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.status(500).json(errorEnvelope("GDA.proposals", "delete", { code: "DB_UNAVAILABLE", message: "Database unavailable", detail: null }));
    }

    const result = await pool.query(`DELETE FROM proposals WHERE id = $1 RETURNING id`, [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json(errorEnvelope("GDA.proposals", "delete", { code: "NOT_FOUND", message: "Proposal not found", detail: null }));
    }

    res.json(successEnvelope("GDA.proposals", "delete", { deleted: req.params.id }));
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.proposals", "delete", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// POST /api/proposals/:id/sections — create a section
// ---------------------------------------------------------------------------
router.post("/:id/sections", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.status(500).json(errorEnvelope("GDA.proposals", "create-section", { code: "DB_UNAVAILABLE", message: "Database unavailable", detail: null }));
    }

    const { volume_type, title, content, sort_order, assigned_to, compliance_req_ids, status } = req.body;
    if (!title) {
      return res.status(400).json(errorEnvelope("GDA.proposals", "create-section", { code: "VALIDATION", message: "Title is required", detail: null }));
    }

    const id = `SEC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const wordCount = (content ?? "").split(/\s+/).filter(Boolean).length;

    await pool.query(
      `INSERT INTO proposal_sections (id, proposal_id, volume_type, title, sort_order, content, status, word_count, assigned_to, compliance_req_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, req.params.id, volume_type ?? "technical", title, sort_order ?? 0, content ?? "", status ?? "outline", wordCount, assigned_to ?? null, compliance_req_ids ?? []],
    );

    const result = await pool.query(`SELECT * FROM proposal_sections WHERE id = $1`, [id]);
    res.status(201).json(successEnvelope("GDA.proposals", "create-section", { section: rowToSection(result.rows[0]) }));
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.proposals", "create-section", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// PUT /api/proposals/:id/sections/:sectionId — update a section
// ---------------------------------------------------------------------------
router.put("/:id/sections/:sectionId", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.status(500).json(errorEnvelope("GDA.proposals", "update-section", { code: "DB_UNAVAILABLE", message: "Database unavailable", detail: null }));
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    const allowed = ["title", "volume_type", "sort_order", "content", "status", "notes", "assigned_to"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        params.push(req.body[key]);
      }
    }

    if (req.body.compliance_req_ids !== undefined) {
      fields.push(`compliance_req_ids = $${idx++}`);
      params.push(req.body.compliance_req_ids);
    }

    // Recalculate word count if content changed
    if (req.body.content !== undefined) {
      fields.push(`word_count = $${idx++}`);
      params.push(req.body.content.split(/\s+/).filter(Boolean).length);
    }

    if (fields.length === 0) {
      return res.status(400).json(errorEnvelope("GDA.proposals", "update-section", { code: "VALIDATION", message: "No fields to update", detail: null }));
    }

    fields.push(`updated_at = NOW()`);
    params.push(req.params.sectionId);
    params.push(req.params.id);

    await pool.query(`UPDATE proposal_sections SET ${fields.join(", ")} WHERE id = $${idx} AND proposal_id = $${idx + 1}`, params);

    const result = await pool.query(`SELECT * FROM proposal_sections WHERE id = $1`, [req.params.sectionId]);
    if (result.rows.length === 0) {
      return res.status(404).json(errorEnvelope("GDA.proposals", "update-section", { code: "NOT_FOUND", message: "Section not found", detail: null }));
    }

    res.json(successEnvelope("GDA.proposals", "update-section", { section: rowToSection(result.rows[0]) }));
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.proposals", "update-section", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/proposals/:id/sections/:sectionId
// ---------------------------------------------------------------------------
router.delete("/:id/sections/:sectionId", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.status(500).json(errorEnvelope("GDA.proposals", "delete-section", { code: "DB_UNAVAILABLE", message: "Database unavailable", detail: null }));
    }

    const result = await pool.query(`DELETE FROM proposal_sections WHERE id = $1 AND proposal_id = $2 RETURNING id`, [req.params.sectionId, req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json(errorEnvelope("GDA.proposals", "delete-section", { code: "NOT_FOUND", message: "Section not found", detail: null }));
    }

    res.json(successEnvelope("GDA.proposals", "delete-section", { deleted: req.params.sectionId }));
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.proposals", "delete-section", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/proposals/:id/sections — bulk-delete all sections for a proposal
// ---------------------------------------------------------------------------
router.delete("/:id/sections", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.status(500).json(errorEnvelope("GDA.proposals", "delete-all-sections", { code: "DB_UNAVAILABLE", message: "Database unavailable", detail: null }));
    }

    const result = await pool.query(`DELETE FROM proposal_sections WHERE proposal_id = $1`, [req.params.id]);
    res.json(successEnvelope("GDA.proposals", "delete-all-sections", { deleted: result.rowCount }));
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.proposals", "delete-all-sections", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// POST /api/proposals/:id/generate-outline — AI generates outline
// ---------------------------------------------------------------------------
router.post("/:id/generate-outline", async (req, res) => {
  try {
    if (!isLLMAvailable()) {
      return res.status(503).json(errorEnvelope("GDA.proposals", "generate-outline", { code: "AI_UNAVAILABLE", message: "No AI model configured", detail: null }));
    }

    const pool = getPool();
    if (!pool) {
      return res.status(500).json(errorEnvelope("GDA.proposals", "generate-outline", { code: "DB_UNAVAILABLE", message: "Database unavailable", detail: null }));
    }

    const proposalResult = await pool.query(`SELECT * FROM proposals WHERE id = $1`, [req.params.id]);
    if (proposalResult.rows.length === 0) {
      return res.status(404).json(errorEnvelope("GDA.proposals", "generate-outline", { code: "NOT_FOUND", message: "Proposal not found", detail: null }));
    }

    const proposal = rowToProposal(proposalResult.rows[0]);

    // Gather context: opportunity data, shredded requirements, win themes
    let opportunityContext = "";
    if (proposal.linked_opportunity_id) {
      const oppResult = await pool.query(`SELECT title, agency, naics, set_aside FROM opportunities WHERE id = $1`, [proposal.linked_opportunity_id]);
      if (oppResult.rows.length > 0) {
        const opp = oppResult.rows[0];
        opportunityContext = `\nOpportunity: ${opp.title}\nAgency: ${opp.agency}\nNAICS: ${opp.naics ?? "N/A"}\nSet-Aside: ${opp.set_aside ?? "Full and Open"}`;
      }
    }

    let requirementsContext = "";
    if (proposal.linked_shred_job_id) {
      const reqResult = await pool.query(`SELECT requirement_text AS text, requirement_type AS type FROM extracted_requirements WHERE shred_job_id = $1 LIMIT 30`, [proposal.linked_shred_job_id]);
      if (reqResult.rows.length > 0) {
        const reqList = reqResult.rows;
        requirementsContext = `\nExtracted Requirements (${reqList.length}):\n` + reqList.map((r: { text?: string; type?: string }, i: number) => `${i + 1}. [${r.type ?? "SHALL"}] ${r.text ?? ""}`).join("\n");
      }
    }

    const winThemesContext = proposal.win_themes.length > 0 ? `\nWin Themes: ${proposal.win_themes.join(", ")}` : "";

    const llmResponse = await chatCompletion(
      [
        {
          role: "system",
          content: SYSTEM_PROMPTS.proposalOutline,
        },
        {
          role: "user",
          content: `Generate a proposal outline for:\n\nTitle: ${proposal.title}\nAgency: ${proposal.agency}\nSolicitation: ${proposal.solicitation_title ?? "N/A"}\nEstimated Value: $${proposal.value_estimated?.toLocaleString() ?? "TBD"}\nDue Date: ${proposal.due_date ?? "TBD"}${opportunityContext}${requirementsContext}${winThemesContext}\n\nReturn a JSON array of outline entries. Each entry should have: volume_type (executive_summary, technical, management, past_performance, cost_price), title, and sections (array of {title, description}).`,
        },
      ],
      { tier: "deep", max_tokens: 4096, response_format: { type: "json_object" } },
    );

    let outline;
    try {
      const parsed = JSON.parse(llmResponse.content);
      outline = parsed.outline ?? parsed;
    } catch {
      outline = [];
    }

    // Save outline to proposal
    await pool.query(`UPDATE proposals SET outline = $1, updated_at = NOW() WHERE id = $2`, [JSON.stringify(outline), req.params.id]);

    res.json(successEnvelope("GDA.proposals", "generate-outline", { outline, model: llmResponse.model, tier: llmResponse.tier }));
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.proposals", "generate-outline", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// POST /api/proposals/:id/sections/:sectionId/generate — AI writes section
// ---------------------------------------------------------------------------
router.post("/:id/sections/:sectionId/generate", async (req, res) => {
  try {
    if (!isLLMAvailable()) {
      return res.status(503).json(errorEnvelope("GDA.proposals", "generate-section", { code: "AI_UNAVAILABLE", message: "No AI model configured", detail: null }));
    }

    const pool = getPool();
    if (!pool) {
      return res.status(500).json(errorEnvelope("GDA.proposals", "generate-section", { code: "DB_UNAVAILABLE", message: "Database unavailable", detail: null }));
    }

    const proposalResult = await pool.query(`SELECT * FROM proposals WHERE id = $1`, [req.params.id]);
    if (proposalResult.rows.length === 0) {
      return res.status(404).json(errorEnvelope("GDA.proposals", "generate-section", { code: "NOT_FOUND", message: "Proposal not found", detail: null }));
    }

    const sectionResult = await pool.query(`SELECT * FROM proposal_sections WHERE id = $1 AND proposal_id = $2`, [req.params.sectionId, req.params.id]);
    if (sectionResult.rows.length === 0) {
      return res.status(404).json(errorEnvelope("GDA.proposals", "generate-section", { code: "NOT_FOUND", message: "Section not found", detail: null }));
    }

    const proposal = rowToProposal(proposalResult.rows[0]);
    const section = rowToSection(sectionResult.rows[0]);
    const { instructions } = req.body;

    const winThemesContext = proposal.win_themes.length > 0 ? `\nWin Themes to incorporate: ${proposal.win_themes.join(", ")}` : "";

    const llmResponse = await chatCompletion(
      [
        {
          role: "system",
          content: SYSTEM_PROMPTS.proposalWriter,
        },
        {
          role: "user",
          content: `Write the following proposal section:\n\nProposal: ${proposal.title}\nAgency: ${proposal.agency}\nSolicitation: ${proposal.solicitation_title ?? "N/A"}\n\nSection: ${section.title}\nVolume: ${section.volume_type}\n${instructions ? `\nSpecific Instructions: ${instructions}` : ""}${winThemesContext}\n${section.content ? `\nExisting Content (build on this):\n${section.content}` : "\nThis is a blank section — write a comprehensive first draft."}\n\nWrite professional government proposal content. Be specific, quantitative, and compliant.`,
        },
      ],
      { tier: "deep", max_tokens: 4096 },
    );

    const content = llmResponse.content;
    const wordCount = content.split(/\s+/).filter(Boolean).length;

    // Save generated content
    await pool.query(
      `UPDATE proposal_sections SET content = $1, word_count = $2, ai_generated = true, status = 'draft', updated_at = NOW() WHERE id = $3`,
      [content, wordCount, req.params.sectionId],
    );

    res.json(successEnvelope("GDA.proposals", "generate-section", { content, wordCount, model: llmResponse.model, tier: llmResponse.tier }));
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.proposals", "generate-section", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// POST /api/proposals/:id/sections/:sectionId/transform — AI transforms text
// ---------------------------------------------------------------------------
router.post("/:id/sections/:sectionId/transform", async (req, res) => {
  try {
    if (!isLLMAvailable()) {
      return res.status(503).json(errorEnvelope("GDA.proposals", "transform-section", { code: "AI_UNAVAILABLE", message: "No AI model configured", detail: null }));
    }

    const pool = getPool();
    if (!pool) {
      return res.status(500).json(errorEnvelope("GDA.proposals", "transform-section", { code: "DB_UNAVAILABLE", message: "Database unavailable", detail: null }));
    }

    const sectionResult = await pool.query(`SELECT * FROM proposal_sections WHERE id = $1 AND proposal_id = $2`, [req.params.sectionId, req.params.id]);
    if (sectionResult.rows.length === 0) {
      return res.status(404).json(errorEnvelope("GDA.proposals", "transform-section", { code: "NOT_FOUND", message: "Section not found", detail: null }));
    }

    const section = rowToSection(sectionResult.rows[0]);
    const { action, custom_prompt } = req.body;

    const transformPrompts: Record<string, string> = {
      expand: "Expand this section with more detail, specific examples, and quantitative evidence. Maintain the professional government proposal tone.",
      shorten: "Condense this section while preserving all key points and compliance requirements. Remove redundancy and tighten language.",
      add_past_performance: "Enhance this section by incorporating relevant past performance references. Add specific contract examples, performance metrics, CPARS ratings, and lessons learned.",
      add_win_themes: "Weave win themes throughout this section. Ensure each key discriminator is explicitly stated and supported with evidence.",
      make_compliant: "Review this section for compliance with government proposal standards. Ensure all SHALL/MUST requirements are addressed. Add compliance language where missing.",
      executive_tone: "Rewrite this section in an executive summary tone — concise, outcome-focused, with BLUF (Bottom Line Up Front) structure.",
      technical_tone: "Rewrite this section in a detailed technical tone — specific methodologies, tools, standards, and technical approaches.",
    };

    const prompt = custom_prompt ?? transformPrompts[action] ?? transformPrompts.expand;

    const llmResponse = await chatCompletion(
      [
        {
          role: "system",
          content: "You are an expert government proposal writer. Transform the provided section content according to the instructions. Return only the transformed content — no preamble or explanation.",
        },
        {
          role: "user",
          content: `Transform this proposal section:\n\nSection: ${section.title}\nVolume: ${section.volume_type}\n\nCurrent Content:\n${section.content}\n\nTransformation: ${prompt}`,
        },
      ],
      { tier: "deep", max_tokens: 4096 },
    );

    const content = llmResponse.content;
    const wordCount = content.split(/\s+/).filter(Boolean).length;

    await pool.query(
      `UPDATE proposal_sections SET content = $1, word_count = $2, updated_at = NOW() WHERE id = $3`,
      [content, wordCount, req.params.sectionId],
    );

    res.json(successEnvelope("GDA.proposals", "transform-section", { content, wordCount, action, model: llmResponse.model }));
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.proposals", "transform-section", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// POST /api/proposals/:id/generate-storyboard — AI creates storyboard
// ---------------------------------------------------------------------------
router.post("/:id/generate-storyboard", async (req, res) => {
  try {
    if (!isLLMAvailable()) {
      return res.status(503).json(errorEnvelope("GDA.proposals", "generate-storyboard", { code: "AI_UNAVAILABLE", message: "No AI model configured", detail: null }));
    }

    const pool = getPool();
    if (!pool) {
      return res.status(500).json(errorEnvelope("GDA.proposals", "generate-storyboard", { code: "DB_UNAVAILABLE", message: "Database unavailable", detail: null }));
    }

    const proposalResult = await pool.query(`SELECT * FROM proposals WHERE id = $1`, [req.params.id]);
    if (proposalResult.rows.length === 0) {
      return res.status(404).json(errorEnvelope("GDA.proposals", "generate-storyboard", { code: "NOT_FOUND", message: "Proposal not found", detail: null }));
    }

    const proposal = rowToProposal(proposalResult.rows[0]);
    const sectionsResult = await pool.query(`SELECT * FROM proposal_sections WHERE proposal_id = $1 ORDER BY volume_type, sort_order`, [req.params.id]);
    const sections = sectionsResult.rows.map(rowToSection);

    const llmResponse = await chatCompletion(
      [
        {
          role: "system",
          content: "You are a Shipley-trained proposal strategist. Create a storyboard that shows how win themes thread through each section. Return JSON array of storyboard entries with: section_id, section_title, volume_type, win_themes (relevant themes for this section), key_points (3-5 bullets), compliance_reqs (which requirements this section addresses), status.",
        },
        {
          role: "user",
          content: `Create a storyboard for:\n\nProposal: ${proposal.title}\nAgency: ${proposal.agency}\nWin Themes: ${proposal.win_themes.join(", ") || "None set"}\n\nSections:\n${sections.map((s) => `- [${s.volume_type}] ${s.title} (${s.status})`).join("\n")}\n\nReturn a JSON object with a "storyboard" array.`,
        },
      ],
      { tier: "deep", max_tokens: 4096, response_format: { type: "json_object" } },
    );

    let storyboard;
    try {
      const parsed = JSON.parse(llmResponse.content);
      storyboard = parsed.storyboard ?? parsed;
    } catch {
      storyboard = [];
    }

    await pool.query(`UPDATE proposals SET storyboard = $1, updated_at = NOW() WHERE id = $2`, [JSON.stringify(storyboard), req.params.id]);

    res.json(successEnvelope("GDA.proposals", "generate-storyboard", { storyboard, model: llmResponse.model }));
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.proposals", "generate-storyboard", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToProposal(row: Record<string, unknown>): Proposal {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    solicitation_id: String(row.solicitation_id ?? ""),
    solicitation_title: String(row.solicitation_title ?? ""),
    agency: String(row.agency ?? ""),
    status: String(row.status ?? "draft") as ProposalStatus,
    value_estimated: Number(row.value_estimated ?? 0),
    due_date: row.due_date ? String(row.due_date) : "",
    submission_date: row.submission_date ? String(row.submission_date) : null,
    capture_manager: String(row.capture_manager ?? ""),
    proposal_manager: String(row.proposal_manager ?? ""),
    volumes: parseJsonb(row.volumes, []),
    red_team_findings: parseJsonb(row.red_team_findings, []),
    scorecard: parseJsonb(row.scorecard, []),
    timeline: parseJsonb(row.timeline, []),
    compliance_score: Number(row.compliance_score ?? 0),
    overall_score: Number(row.overall_score ?? 0),
    win_themes: Array.isArray(row.win_themes) ? row.win_themes.map(String) : [],
    created_at: row.created_at ? String(row.created_at) : new Date().toISOString(),
    updated_at: row.updated_at ? String(row.updated_at) : new Date().toISOString(),
    win_theme_details: parseJsonb(row.win_theme_details, []),
    storyboard: parseJsonb(row.storyboard, []),
    outline: parseJsonb(row.outline, []),
    linked_opportunity_id: row.linked_opportunity_id ? String(row.linked_opportunity_id) : null,
    linked_shred_job_id: row.linked_shred_job_id ? String(row.linked_shred_job_id) : null,
  };
}

function rowToSection(row: Record<string, unknown>): ProposalSection {
  return {
    id: String(row.id),
    proposal_id: String(row.proposal_id),
    volume_type: String(row.volume_type ?? "technical") as ProposalSection["volume_type"],
    title: String(row.title ?? ""),
    sort_order: Number(row.sort_order ?? 0),
    content: String(row.content ?? ""),
    ai_generated: Boolean(row.ai_generated),
    status: String(row.status ?? "outline") as ProposalSection["status"],
    word_count: Number(row.word_count ?? 0),
    notes: row.notes ? String(row.notes) : null,
    assigned_to: row.assigned_to ? String(row.assigned_to) : null,
    compliance_req_ids: Array.isArray(row.compliance_req_ids) ? row.compliance_req_ids.map(String) : [],
    created_at: row.created_at ? String(row.created_at) : new Date().toISOString(),
    updated_at: row.updated_at ? String(row.updated_at) : new Date().toISOString(),
  };
}

function parseJsonb<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "string") {
    try { return JSON.parse(val) as T; } catch { return fallback; }
  }
  return val as T;
}

export default router;
