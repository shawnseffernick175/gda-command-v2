import { Router } from "express";
import { log } from "../lib/logger";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { requireRole } from "../lib/auth";
import { getPool } from "../lib/db";
import { randomUUID } from "crypto";

const router = Router();

router.get("/", async (req, res) => {
  let prompts: Array<Record<string, unknown>>;
  let source: "db" = "db";
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
        prompts = [];
      }
    } catch (err) {
      log.warn("prompts_fallback", { error: String(err) });
      prompts = [];
    }
  } else {
    prompts = [];
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
  return res.json(
    successEnvelope("GDA.prompts", "recent-usage", { usage: [], total: 0, source: "db" })
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
    } catch (err) { log.warn("prompts_fallback", { error: String(err) }); }
  }

  return res.status(404).json(
    errorEnvelope("GDA.prompts", "get", { code: "NOT_FOUND", message: `Prompt not found: ${id}`, detail: null })
  );
});

// ---------------------------------------------------------------------------
// POST /api/prompts — Create a new prompt
// ---------------------------------------------------------------------------
router.post("/", requireRole("admin", "bd_manager"), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json(errorEnvelope("GDA.prompts", "create", { code: "DB_UNAVAILABLE", message: "Database not available", detail: null }));

  const { name, category, description, template, variables, tags } = req.body as {
    name?: string; category?: string; description?: string;
    template?: string; variables?: string[]; tags?: string[];
  };

  if (!name || !template) {
    return res.status(400).json(errorEnvelope("GDA.prompts", "create", {
      code: "VALIDATION", message: "name and template are required", detail: null,
    }));
  }

  const id = `prompt-${randomUUID().slice(0, 8)}`;
  try {
    const user = (req as unknown as Record<string, unknown>).user as { email?: string } | undefined;
    await pool.query(
      `INSERT INTO prompts (id, name, category, description, template, variables, tags, is_active, version, usage_count, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, 1, 0, $8, NOW(), NOW())`,
      [id, name, category ?? "general", description ?? "", template, variables ?? [], tags ?? [], user?.email ?? "admin"],
    );
    const { rows } = await pool.query("SELECT * FROM prompts WHERE id = $1", [id]);
    const r = rows[0];
    const prompt = {
      id: r.id, title: r.name, name: r.name,
      category: r.category, description: r.description ?? "",
      template: r.template, variables: r.variables ?? [],
      tags: r.tags ?? [], version: r.version ?? 1,
      status: r.is_active ? "active" : "archived",
      starred: false, usageCount: 0,
      createdBy: r.created_by ?? "", createdAt: r.created_at, updatedAt: r.updated_at,
    };
    return res.status(201).json(successEnvelope("GDA.prompts", "create", { prompt }));
  } catch (e) {
    return res.status(500).json(errorEnvelope("GDA.prompts", "create", {
      code: "INTERNAL", message: (e as Error).message, detail: null,
    }));
  }
});

// ---------------------------------------------------------------------------
// PUT /api/prompts/:id — Update an existing prompt
// ---------------------------------------------------------------------------
router.put("/:id", requireRole("admin", "bd_manager"), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json(errorEnvelope("GDA.prompts", "update", { code: "DB_UNAVAILABLE", message: "Database not available", detail: null }));

  const { id } = req.params;
  const { name, category, description, template, variables, tags } = req.body as {
    name?: string; category?: string; description?: string;
    template?: string; variables?: string[]; tags?: string[];
  };

  try {
    const result = await pool.query(
      `UPDATE prompts SET
        name = COALESCE($2, name),
        category = COALESCE($3, category),
        description = COALESCE($4, description),
        template = COALESCE($5, template),
        variables = COALESCE($6, variables),
        tags = COALESCE($7, tags),
        version = version + 1,
        updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, name, category, description, template, variables, tags],
    );
    if (result.rows.length === 0) {
      return res.status(404).json(errorEnvelope("GDA.prompts", "update", { code: "NOT_FOUND", message: `Prompt ${id} not found`, detail: null }));
    }
    const r = result.rows[0];
    const prompt = {
      id: r.id, title: r.name, name: r.name,
      category: r.category, description: r.description ?? "",
      template: r.template, variables: r.variables ?? [],
      tags: r.tags ?? [], version: r.version ?? 1,
      status: r.is_active ? "active" : "archived",
      starred: false, usageCount: r.usage_count ?? 0,
      createdBy: r.created_by ?? "", createdAt: r.created_at, updatedAt: r.updated_at,
    };
    return res.json(successEnvelope("GDA.prompts", "update", { prompt }));
  } catch (e) {
    return res.status(500).json(errorEnvelope("GDA.prompts", "update", {
      code: "INTERNAL", message: (e as Error).message, detail: null,
    }));
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/prompts/:id — Soft-delete a prompt
// ---------------------------------------------------------------------------
router.delete("/:id", requireRole("admin"), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json(errorEnvelope("GDA.prompts", "delete", { code: "DB_UNAVAILABLE", message: "Database not available", detail: null }));

  const { id } = req.params;
  try {
    const result = await pool.query(
      "UPDATE prompts SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id",
      [id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json(errorEnvelope("GDA.prompts", "delete", { code: "NOT_FOUND", message: `Prompt ${id} not found`, detail: null }));
    }
    return res.json(successEnvelope("GDA.prompts", "delete", { id, deleted: true }));
  } catch (e) {
    return res.status(500).json(errorEnvelope("GDA.prompts", "delete", {
      code: "INTERNAL", message: (e as Error).message, detail: null,
    }));
  }
});

export default router;
