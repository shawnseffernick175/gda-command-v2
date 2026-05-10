import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { MOCK_COLOR_REVIEWS } from "../data/color-review-mock";
import type { ColorReviewPhase, ColorReviewStatus } from "@gda/shared";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/color-review — list reviews with filters
// ---------------------------------------------------------------------------
router.get("/", (req, res) => {
  try {
    let items = [...MOCK_COLOR_REVIEWS];
    const { phase, status, proposal_id, search } = req.query;

    if (phase && typeof phase === "string") {
      items = items.filter((r) => r.phase === (phase as ColorReviewPhase));
    }
    if (status && typeof status === "string") {
      items = items.filter((r) => r.status === (status as ColorReviewStatus));
    }
    if (proposal_id && typeof proposal_id === "string") {
      items = items.filter((r) => r.proposal_id === proposal_id);
    }
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      items = items.filter(
        (r) =>
          r.proposal_title.toLowerCase().includes(q) ||
          r.agency.toLowerCase().includes(q) ||
          r.summary.toLowerCase().includes(q),
      );
    }

    const all = MOCK_COLOR_REVIEWS;
    const phaseCounts: Record<string, number> = {};
    const statusCounts: Record<string, number> = {};
    for (const r of all) {
      phaseCounts[r.phase] = (phaseCounts[r.phase] ?? 0) + 1;
      statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
    }

    const completed = all.filter((r) => r.status === "completed");
    const avgScore = completed.length > 0
      ? Math.round(completed.reduce((s, r) => s + r.overall_score, 0) / completed.length)
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
        summary: {
          phaseCounts,
          statusCounts,
          avgScore,
          goCount,
          conditionalGoCount,
          noGoCount,
          proposalsReviewed,
        },
        source: "mock" as const,
      }),
    );
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.color-review", "list", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// GET /api/color-review/:id — single review detail
// ---------------------------------------------------------------------------
router.get("/:id", (req, res) => {
  try {
    const review = MOCK_COLOR_REVIEWS.find((r) => r.id === req.params.id);
    if (!review) {
      return res.status(404).json(
        errorEnvelope("GDA.color-review", "get-detail", {
          code: "NOT_FOUND",
          message: `Color review ${req.params.id} not found`,
          detail: null,
        }),
      );
    }
    res.json(successEnvelope("GDA.color-review", "get-detail", { review, source: "mock" as const }));
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.color-review", "get-detail", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// POST /api/color-review/run — dry-run: initiate a new color review
// ---------------------------------------------------------------------------
router.post("/run", (req, res) => {
  try {
    const { proposal_id, phase } = req.body ?? {};
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
    res.json(
      successEnvelope(
        "GDA.color-review",
        "run",
        {
          correlationId,
          proposal_id,
          phase,
          status: "queued",
          message: `Color review (${phase} team) queued for proposal ${proposal_id}. Connect n8n pipeline for live execution.`,
        },
        {},
        true,
      ),
    );
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.color-review", "run", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

export default router;
