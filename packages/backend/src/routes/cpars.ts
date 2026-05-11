import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { requireRole } from "../lib/auth";
import { MOCK_CPARS_RECORDS } from "../data/cpars-mock";
import { getPool } from "../lib/db";
import type { CPARSRecord } from "../data/cpars-mock";
import { isLLMAvailable, chatCompletion, SYSTEM_PROMPTS } from "../lib/llm";

const router = Router();

async function loadRecords(): Promise<{ items: CPARSRecord[]; source: "db" | "mock" }> {
  const pool = getPool();
  if (pool) {
    try {
      const { rows } = await pool.query("SELECT * FROM cpars_records ORDER BY updated_at DESC");
      if (rows.length > 0) return { items: rows as CPARSRecord[], source: "db" };
    } catch { /* fall through */ }
  }
  return { items: [...MOCK_CPARS_RECORDS], source: "mock" };
}

router.get("/summary", async (_req, res) => {
  try {
    const { items: all, source } = await loadRecords();
    const finalized = all.filter((r) => r.status === "finalized").length;
    const draft = all.filter((r) => r.status === "draft").length;
    const inReview = all.filter((r) => r.status === "in_review").length;
    const submitted = all.filter((r) => r.status === "submitted").length;
    const totalValue = all.reduce((s, r) => s + (r.contract_value ?? 0), 0);
    const rated = all.filter((r) => r.overall_rating);
    const exceptional = rated.filter((r) => r.overall_rating === "Exceptional").length;
    const veryGood = rated.filter((r) => r.overall_rating === "Very Good").length;
    const aiGenerated = all.filter((r) => r.ai_generated_narrative).length;

    return res.json(
      successEnvelope("gda-cpars", "summary", {
        total: all.length, finalized, draft, in_review: inReview, submitted,
        total_value: totalValue, exceptional, very_good: veryGood, ai_generated: aiGenerated, source,
      }),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-cpars", "summary", { code: "INTERNAL", message: (err as Error).message, detail: null }),
    );
  }
});

router.get("/records", async (req, res) => {
  try {
    const { items: all, source } = await loadRecords();
    let items = [...all];
    const { status, rating, search } = req.query;

    if (status && typeof status === "string") items = items.filter((r) => r.status === status);
    if (rating && typeof rating === "string") items = items.filter((r) => r.overall_rating === rating);
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      items = items.filter((r) =>
        r.contract_title.toLowerCase().includes(q) ||
        r.agency.toLowerCase().includes(q) ||
        r.contract_number.toLowerCase().includes(q) ||
        (r.relevance_tags ?? []).some((t: string) => t.toLowerCase().includes(q)),
      );
    }

    items.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    return res.json(
      successEnvelope("gda-cpars", "list", items, { total: items.length, source }),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-cpars", "list", { code: "INTERNAL", message: (err as Error).message, detail: null }),
    );
  }
});

router.get("/records/:id", async (req, res) => {
  const pool = getPool();
  if (pool) {
    try {
      const { rows } = await pool.query("SELECT * FROM cpars_records WHERE id = $1", [req.params.id]);
      if (rows.length > 0) return res.json(successEnvelope("gda-cpars", "detail", rows[0]));
    } catch { /* fall through */ }
  }
  const item = MOCK_CPARS_RECORDS.find((r) => r.id === req.params.id);
  if (!item) {
    return res.status(404).json(
      errorEnvelope("gda-cpars", "detail", { code: "NOT_FOUND", message: `CPARS record ${req.params.id} not found`, detail: null }),
    );
  }
  return res.json(successEnvelope("gda-cpars", "detail", item));
});

router.post("/records/:id/generate-narrative", requireRole("admin", "bd_manager", "capture_lead", "analyst"), async (req, res) => {
  try {
    let item: CPARSRecord | undefined;
    const pool = getPool();
    if (pool) {
      try {
        const { rows } = await pool.query("SELECT * FROM cpars_records WHERE id = $1", [req.params.id]);
        if (rows.length > 0) item = rows[0] as CPARSRecord;
      } catch { /* fall through */ }
    }
    if (!item) item = MOCK_CPARS_RECORDS.find((r) => r.id === req.params.id);

    if (!item) {
      return res.status(404).json(
        errorEnvelope("gda-cpars", "generate", { code: "NOT_FOUND", message: `CPARS record ${req.params.id} not found`, detail: null }),
      );
    }

    if (!isLLMAvailable()) {
      return res.json(
        successEnvelope("gda-cpars", "generate-narrative", {
          id: item.id,
          message: `AI narrative generation triggered for "${item.contract_title}" — set OPENAI_API_KEY to enable real narrative generation.`,
          estimated_time: "30-60 seconds",
        }, {}, true),
      );
    }

    const contractContext = [
      `Contract: ${item.contract_title}`,
      `Agency: ${item.agency}`,
      `Contract Number: ${item.contract_number}`,
      `Period: ${item.period_of_performance}`,
      `Value: $${((item.contract_value ?? 0) / 1_000_000).toFixed(1)}M`,
      `Overall Rating: ${item.overall_rating ?? "Not yet rated"}`,
      `Quality: ${item.quality_rating ?? "N/A"}`,
      `Schedule: ${item.schedule_rating ?? "N/A"}`,
      `Cost: ${item.cost_rating ?? "N/A"}`,
      `Management: ${item.management_rating ?? "N/A"}`,
      item.narrative ? `Existing Narrative: ${item.narrative}` : "",
      (item.key_accomplishments ?? []).length > 0
        ? `Key Accomplishments:\n${item.key_accomplishments.map((a: string) => `- ${a}`).join("\n")}`
        : "",
    ].filter(Boolean).join("\n");

    const llmResponse = await chatCompletion(
      [
        { role: "system", content: SYSTEM_PROMPTS.cparsNarrative },
        { role: "user", content: `Generate a CPARS-ready past performance narrative for the following contract:\n\n${contractContext}` },
      ],
      { temperature: 0.4, max_tokens: 1000 },
    );

    return res.json(
      successEnvelope("gda-cpars", "generate-narrative", {
        id: item.id,
        narrative: llmResponse.content,
        ai: { model: llmResponse.model, tokens: llmResponse.usage.total_tokens },
      }),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-cpars", "generate-narrative", { code: "INTERNAL", message: err instanceof Error ? err.message : "Unknown error", detail: null }),
    );
  }
});

router.post("/match-opportunities", requireRole("admin", "bd_manager", "capture_lead", "analyst"), (_req, res) => {
  return res.json(
    successEnvelope("gda-cpars", "match-opportunities", {
      message: "Past performance matching triggered (dry-run). In production, this cross-references CPARS records with active opportunities via semantic similarity.",
      matches_found: 12,
    }, {}, true),
  );
});

export default router;
