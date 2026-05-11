import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { MOCK_COLOR_REVIEWS } from "../data/color-review-mock";
import { getPool } from "../lib/db";
import type { ColorReviewPhase, ColorReviewStatus } from "@gda/shared";
import { isLLMAvailable, chatCompletion, SYSTEM_PROMPTS } from "../lib/llm";

const router = Router();

type ReviewItem = Record<string, unknown> & { phase: string; status: string; proposal_id: string; proposal_title: string; agency: string; overall_score: number; go_no_go?: string; summary?: string };

async function loadReviews(): Promise<{ items: ReviewItem[]; source: "db" | "mock" }> {
  const pool = getPool();
  if (pool) {
    try {
      const { rows } = await pool.query("SELECT * FROM color_reviews ORDER BY review_date DESC");
      if (rows.length > 0) {
        return { items: rows.map((r) => ({
          ...r,
          findings: typeof r.findings === "string" ? JSON.parse(r.findings) : (r.findings ?? []),
          strengths: typeof r.strengths === "string" ? JSON.parse(r.strengths) : (r.strengths ?? []),
          weaknesses: typeof r.weaknesses === "string" ? JSON.parse(r.weaknesses) : (r.weaknesses ?? []),
          action_items: typeof r.action_items === "string" ? JSON.parse(r.action_items) : (r.action_items ?? []),
        })) as ReviewItem[], source: "db" };
      }
    } catch { /* fall through */ }
  }
  return { items: [...MOCK_COLOR_REVIEWS] as unknown as ReviewItem[], source: "mock" };
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
            findings: typeof r.findings === "string" ? JSON.parse(r.findings) : (r.findings ?? []),
            strengths: typeof r.strengths === "string" ? JSON.parse(r.strengths) : (r.strengths ?? []),
            weaknesses: typeof r.weaknesses === "string" ? JSON.parse(r.weaknesses) : (r.weaknesses ?? []),
            action_items: typeof r.action_items === "string" ? JSON.parse(r.action_items) : (r.action_items ?? []),
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
// POST /api/color-review/run — initiate a color review (LLM-powered)
// ---------------------------------------------------------------------------
router.post("/run", async (req, res) => {
  try {
    const { proposal_id, phase, proposal_text } = req.body ?? {};
    if (!proposal_id || !phase) {
      return res.status(400).json(
        errorEnvelope("GDA.color-review", "run", {
          code: "VALIDATION",
          message: "proposal_id and phase are required",
          detail: null,
        }),
      );
    }
    const correlationId = `GDA-CR-${Date.now()}`;

    if (!isLLMAvailable() || !proposal_text) {
      return res.json(
        successEnvelope(
          "GDA.color-review",
          "run",
          {
            correlationId,
            proposal_id,
            phase,
            status: "queued",
            message: proposal_text
              ? `Set OPENAI_API_KEY to enable AI-powered ${phase} team review.`
              : `Color review (${phase} team) queued for proposal ${proposal_id}. Provide proposal_text for AI review, or connect the n8n pipeline.`,
          },
          {},
          true,
        ),
      );
    }

    const truncatedText = proposal_text.slice(0, 10000);
    const llmResponse = await chatCompletion(
      [
        { role: "system", content: SYSTEM_PROMPTS.colorReview },
        {
          role: "user",
          content: `Perform a ${phase} team review on the following proposal section.\n\nProposal ID: ${proposal_id}\nReview Phase: ${phase}\n\n--- PROPOSAL TEXT ---\n${truncatedText}\n\n---\n\nProvide your review as a JSON object with: { "phase": "${phase}", "overall_score": <0-100>, "verdict": "pass|fail|conditional", "checks": [{ "name": "...", "verdict": "pass|fail|warning", "detail": "..." }], "summary": "..." }`,
        },
      ],
      { temperature: 0.3, max_tokens: 2000, response_format: { type: "json_object" } },
    );

    let reviewResult: Record<string, unknown> = {};
    try {
      reviewResult = JSON.parse(llmResponse.content);
    } catch {
      reviewResult = { raw_response: llmResponse.content };
    }

    res.json(
      successEnvelope("GDA.color-review", "run", {
        correlationId,
        proposal_id,
        phase,
        status: "completed",
        review: reviewResult,
        ai: { model: llmResponse.model, tokens: llmResponse.usage.total_tokens },
      }),
    );
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.color-review", "run", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

export default router;
