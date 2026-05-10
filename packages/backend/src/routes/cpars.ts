import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { MOCK_CPARS_RECORDS } from "../data/cpars-mock";
import type { CPARSRecord } from "../data/cpars-mock";

const router = Router();

router.get("/summary", (_req, res) => {
  try {
    const all = MOCK_CPARS_RECORDS;
    const finalized = all.filter((r) => r.status === "finalized").length;
    const draft = all.filter((r) => r.status === "draft").length;
    const inReview = all.filter((r) => r.status === "in_review").length;
    const submitted = all.filter((r) => r.status === "submitted").length;
    const totalValue = all.reduce((s, r) => s + r.contract_value, 0);
    const rated = all.filter((r) => r.overall_rating);
    const exceptional = rated.filter((r) => r.overall_rating === "Exceptional").length;
    const veryGood = rated.filter((r) => r.overall_rating === "Very Good").length;
    const aiGenerated = all.filter((r) => r.ai_generated_narrative).length;

    return res.json(
      successEnvelope("gda-cpars", "summary", {
        total: all.length,
        finalized,
        draft,
        in_review: inReview,
        submitted,
        total_value: totalValue,
        exceptional,
        very_good: veryGood,
        ai_generated: aiGenerated,
      }),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-cpars", "summary", { code: "INTERNAL", message: (err as Error).message, detail: null }),
    );
  }
});

router.get("/records", (req, res) => {
  try {
    let items: CPARSRecord[] = [...MOCK_CPARS_RECORDS];
    const { status, rating, search } = req.query;

    if (status && typeof status === "string") items = items.filter((r) => r.status === status);
    if (rating && typeof rating === "string") items = items.filter((r) => r.overall_rating === rating);
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      items = items.filter((r) =>
        r.contract_title.toLowerCase().includes(q) ||
        r.agency.toLowerCase().includes(q) ||
        r.contract_number.toLowerCase().includes(q) ||
        r.relevance_tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    items.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    return res.json(
      successEnvelope("gda-cpars", "list", items, { total: items.length }),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-cpars", "list", { code: "INTERNAL", message: (err as Error).message, detail: null }),
    );
  }
});

router.get("/records/:id", (req, res) => {
  const item = MOCK_CPARS_RECORDS.find((r) => r.id === req.params.id);
  if (!item) {
    return res.status(404).json(
      errorEnvelope("gda-cpars", "detail", { code: "NOT_FOUND", message: `CPARS record ${req.params.id} not found`, detail: null }),
    );
  }
  return res.json(successEnvelope("gda-cpars", "detail", item));
});

router.post("/records/:id/generate-narrative", (req, res) => {
  const item = MOCK_CPARS_RECORDS.find((r) => r.id === req.params.id);
  if (!item) {
    return res.status(404).json(
      errorEnvelope("gda-cpars", "generate", { code: "NOT_FOUND", message: `CPARS record ${req.params.id} not found`, detail: null }),
    );
  }
  return res.json(
    successEnvelope("gda-cpars", "generate-narrative", {
      id: item.id,
      message: `AI narrative generation triggered for "${item.contract_title}" (dry-run). In production, this uses GDA.api.agentic-chat + RAG knowledge base to generate CPARS-ready past performance narratives.`,
      estimated_time: "30-60 seconds",
    }, {}, true),
  );
});

router.post("/match-opportunities", (_req, res) => {
  return res.json(
    successEnvelope("gda-cpars", "match-opportunities", {
      message: "Past performance matching triggered (dry-run). In production, this cross-references CPARS records with active opportunities via semantic similarity.",
      matches_found: 12,
    }, {}, true),
  );
});

export default router;
