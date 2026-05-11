import { Router } from "express";
import {
  getMockPrompts,
  getMockPromptById,
  getMockPromptVersions,
  getMockPromptUsage,
  getMockRecentUsage,
} from "../data/prompts-mock";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";

const router = Router();

router.get("/", async (req, res) => {
  let prompts: Array<Record<string, unknown>>;
  let source: "db" | "mock" = "mock";
  const pool = getPool();

  if (pool) {
    try {
      const { rows } = await pool.query("SELECT * FROM prompts ORDER BY usage_count DESC, name");
      if (rows.length > 0) {
        prompts = rows.map((r) => ({
          id: r.id, title: r.name, name: r.name,
          category: r.category, description: r.description ?? "",
          template: r.template, variables: r.variables ?? [],
          tags: r.tags ?? [], version: r.version ?? 1,
          status: r.is_active ? "active" : "archived",
          starred: false, usageCount: r.usage_count ?? 0,
          lastUsed: r.last_used, createdBy: r.created_by ?? "",
          createdAt: r.created_at, updatedAt: r.updated_at,
        }));
        source = "db";
      } else {
        prompts = getMockPrompts() as unknown as Array<Record<string, unknown>>;
      }
    } catch {
      prompts = getMockPrompts() as unknown as Array<Record<string, unknown>>;
    }
  } else {
    prompts = getMockPrompts() as unknown as Array<Record<string, unknown>>;
  }

  const allPrompts = [...prompts];
  const { search, category, status, tag, sortBy, sortDir } = req.query;

  if (typeof search === "string" && search.trim()) {
    const q = search.toLowerCase();
    prompts = prompts.filter(
      (p) =>
        String(p.title ?? "").toLowerCase().includes(q) ||
        String(p.description ?? "").toLowerCase().includes(q) ||
        (Array.isArray(p.tags) && p.tags.some((t: string) => t.toLowerCase().includes(q)))
    );
  }
  if (typeof category === "string" && category) {
    prompts = prompts.filter((p) => p.category === category);
  }
  if (typeof status === "string" && status) {
    prompts = prompts.filter((p) => p.status === status);
  }
  if (typeof tag === "string" && tag) {
    prompts = prompts.filter((p) => Array.isArray(p.tags) && p.tags.includes(tag));
  }

  const field = typeof sortBy === "string" ? sortBy : "usageCount";
  const dir = sortDir === "asc" ? 1 : -1;
  prompts.sort((a, b) => {
    const av = a[field]; const bv = b[field];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
    return 0;
  });

  const categories = [...new Set(allPrompts.map((p) => String(p.category)))];
  const allTags = [...new Set(allPrompts.flatMap((p) => (Array.isArray(p.tags) ? p.tags : []) as string[]))].sort();

  return res.json(
    successEnvelope("GDA.prompts", "list", {
      prompts,
      summary: {
        total: allPrompts.length, filtered: prompts.length,
        active: allPrompts.filter((p) => p.status === "active").length,
        draft: allPrompts.filter((p) => p.status === "draft").length,
        archived: allPrompts.filter((p) => p.status === "archived").length,
        starred: allPrompts.filter((p) => p.starred).length,
        categories, tags: allTags,
      },
      source,
    })
  );
});

router.get("/usage", (_req, res) => {
  const usage = getMockRecentUsage();
  return res.json(
    successEnvelope("GDA.prompts", "recent-usage", { usage, total: usage.length, source: "mock" })
  );
});

router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const pool = getPool();

  if (pool) {
    try {
      const { rows } = await pool.query("SELECT * FROM prompts WHERE id = $1", [id]);
      if (rows.length > 0) {
        const r = rows[0];
        const prompt = {
          id: r.id, title: r.name, name: r.name,
          category: r.category, description: r.description ?? "",
          template: r.template, variables: r.variables ?? [],
          tags: r.tags ?? [], version: r.version ?? 1,
          status: r.is_active ? "active" : "archived",
          starred: false, usageCount: r.usage_count ?? 0,
          lastUsed: r.last_used, createdBy: r.created_by ?? "",
          createdAt: r.created_at, updatedAt: r.updated_at,
        };
        return res.json(successEnvelope("GDA.prompts", "get", { prompt, versions: [], usage: [], source: "db" }));
      }
    } catch { /* fall through */ }
  }

  const prompt = getMockPromptById(id);
  if (!prompt) {
    return res.status(404).json(
      errorEnvelope("GDA.prompts", "get", { code: "NOT_FOUND", message: `Prompt not found: ${id}`, detail: null })
    );
  }
  const versions = getMockPromptVersions(id);
  const usage = getMockPromptUsage(id);
  return res.json(successEnvelope("GDA.prompts", "get", { prompt, versions, usage, source: "mock" }));
});

export default router;
