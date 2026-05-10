import { Router } from "express";
import {
  getMockPrompts,
  getMockPromptById,
  getMockPromptVersions,
  getMockPromptUsage,
  getMockRecentUsage,
} from "../data/prompts-mock";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";

const router = Router();

router.get("/", (req, res) => {
  let prompts = getMockPrompts();
  const { search, category, status, tag, sortBy, sortDir } = req.query;

  if (typeof search === "string" && search.trim()) {
    const q = search.toLowerCase();
    prompts = prompts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  if (typeof category === "string" && category) {
    prompts = prompts.filter((p) => p.category === category);
  }

  if (typeof status === "string" && status) {
    prompts = prompts.filter((p) => p.status === status);
  }

  if (typeof tag === "string" && tag) {
    prompts = prompts.filter((p) => p.tags.includes(tag));
  }

  const field = typeof sortBy === "string" ? sortBy : "usageCount";
  const dir = sortDir === "asc" ? 1 : -1;

  prompts.sort((a, b) => {
    const av = a[field as keyof typeof a];
    const bv = b[field as keyof typeof b];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
    return 0;
  });

  const categories = [...new Set(getMockPrompts().map((p) => p.category))];
  const allTags = [...new Set(getMockPrompts().flatMap((p) => p.tags))].sort();

  return res.json(
    successEnvelope("GDA.prompts", "list", {
      prompts,
      summary: {
        total: getMockPrompts().length,
        filtered: prompts.length,
        active: getMockPrompts().filter((p) => p.status === "active").length,
        draft: getMockPrompts().filter((p) => p.status === "draft").length,
        archived: getMockPrompts().filter((p) => p.status === "archived").length,
        starred: getMockPrompts().filter((p) => p.starred).length,
        categories,
        tags: allTags,
      },
      source: "mock" as const,
    })
  );
});

router.get("/usage", (_req, res) => {
  const usage = getMockRecentUsage();
  return res.json(
    successEnvelope("GDA.prompts", "recent-usage", {
      usage,
      total: usage.length,
      source: "mock" as const,
    })
  );
});

router.get("/:id", (req, res) => {
  const { id } = req.params;
  const prompt = getMockPromptById(id);

  if (!prompt) {
    return res.status(404).json(
      errorEnvelope("GDA.prompts", "get", {
        code: "NOT_FOUND",
        message: `Prompt not found: ${id}`,
        detail: null,
      })
    );
  }

  const versions = getMockPromptVersions(id);
  const usage = getMockPromptUsage(id);

  return res.json(
    successEnvelope("GDA.prompts", "get", {
      prompt,
      versions,
      usage,
      source: "mock" as const,
    })
  );
});

export default router;
