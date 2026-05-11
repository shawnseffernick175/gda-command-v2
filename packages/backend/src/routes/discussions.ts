import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { requireRole } from "../lib/auth";
import { MOCK_THREADS, MOCK_MESSAGES } from "../data/discussions-mock";
import type { DiscussionThread } from "../data/discussions-mock";
import type { DiscussionEntityType } from "@gda/shared";

const router = Router();

function rowToThread(r: Record<string, unknown>): DiscussionThread {
  return {
    id: r.id as string,
    entity_type: r.entity_type as DiscussionEntityType,
    entity_id: (r.entity_id as string) ?? "",
    entity_title: (r.entity_title as string) ?? "",
    title: r.title as string,
    created_by: r.created_by as string,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
    message_count: Number(r.message_count),
    last_message_at: r.last_message_at instanceof Date ? r.last_message_at.toISOString() : r.last_message_at ? String(r.last_message_at) : "",
    participants: (r.participants as string[]) ?? [],
    is_resolved: Boolean(r.is_resolved),
    tags: (r.tags as string[]) ?? [],
  };
}

router.get("/summary", async (_req, res) => {
  try {
    const pool = getPool();
    let all: DiscussionThread[];

    if (pool) {
      try {
        const result = await pool.query("SELECT * FROM discussion_threads");
        all = result.rows.map(rowToThread);
      } catch {
        all = MOCK_THREADS;
      }
    } else {
      all = MOCK_THREADS;
    }

    const active = all.filter((t) => !t.is_resolved).length;
    const resolved = all.filter((t) => t.is_resolved).length;
    const totalMessages = all.reduce((s, t) => s + t.message_count, 0);
    const uniqueParticipants = new Set(all.flatMap((t) => t.participants)).size;
    const entities = {
      opportunity: all.filter((t) => t.entity_type === "opportunity").length,
      proposal: all.filter((t) => t.entity_type === "proposal").length,
      capture_plan: all.filter((t) => t.entity_type === "capture_plan").length,
      compliance: all.filter((t) => t.entity_type === "compliance").length,
      general: all.filter((t) => t.entity_type === "general").length,
    };

    return res.json(
      successEnvelope("gda-discussions", "summary", {
        total_threads: all.length, active, resolved, total_messages: totalMessages,
        participants: uniqueParticipants, by_entity: entities,
      }),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-discussions", "summary", { code: "INTERNAL", message: (err as Error).message, detail: null }),
    );
  }
});

router.get("/threads", async (req, res) => {
  try {
    const pool = getPool();
    let items: DiscussionThread[];

    if (pool) {
      try {
        const result = await pool.query("SELECT * FROM discussion_threads ORDER BY last_message_at DESC NULLS LAST");
        items = result.rows.map(rowToThread);
      } catch {
        items = [...MOCK_THREADS];
      }
    } else {
      items = [...MOCK_THREADS];
    }

    const { entity_type, resolved, search } = req.query;

    if (entity_type && typeof entity_type === "string") items = items.filter((t) => t.entity_type === entity_type);
    if (resolved && typeof resolved === "string") items = items.filter((t) => t.is_resolved === (resolved === "true"));
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      items = items.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        t.entity_title.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }

    items.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());

    return res.json(
      successEnvelope("gda-discussions", "threads", items, { total: items.length }),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-discussions", "threads", { code: "INTERNAL", message: (err as Error).message, detail: null }),
    );
  }
});

router.get("/threads/:id", async (req, res) => {
  const pool = getPool();

  if (pool) {
    try {
      const result = await pool.query("SELECT * FROM discussion_threads WHERE id = $1", [req.params.id]);
      if (result.rows.length > 0) {
        return res.json(successEnvelope("gda-discussions", "thread-detail", rowToThread(result.rows[0])));
      }
    } catch { /* fall through */ }
  }

  const thread = MOCK_THREADS.find((t) => t.id === req.params.id);
  if (!thread) {
    return res.status(404).json(
      errorEnvelope("gda-discussions", "thread-detail", { code: "NOT_FOUND", message: `Thread ${req.params.id} not found`, detail: null }),
    );
  }
  return res.json(successEnvelope("gda-discussions", "thread-detail", thread));
});

router.get("/threads/:id/messages", async (req, res) => {
  const pool = getPool();

  if (pool) {
    try {
      const result = await pool.query(
        "SELECT * FROM discussion_messages WHERE thread_id = $1 ORDER BY created_at ASC",
        [req.params.id],
      );
      if (result.rows.length > 0) {
        const messages = result.rows.map((r) => ({
          ...r,
          created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
          edited_at: r.edited_at instanceof Date ? r.edited_at.toISOString() : r.edited_at,
        }));
        return res.json(
          successEnvelope("gda-discussions", "messages", messages, { total: messages.length }),
        );
      }
    } catch { /* fall through */ }
  }

  const messages = MOCK_MESSAGES[req.params.id] ?? [];
  return res.json(
    successEnvelope("gda-discussions", "messages", messages, { total: messages.length }),
  );
});

// ---------------------------------------------------------------------------
// POST /api/discussions/threads/:id/messages — real DB write
// ---------------------------------------------------------------------------
router.post("/threads/:id/messages", requireRole("admin", "bd_manager", "capture_lead", "analyst"), async (req, res) => {
  const { content, author } = req.body as { content?: string; author?: string };
  const threadId = req.params.id;
  const resolvedAuthor = author ?? (req as unknown as { user?: { email?: string } }).user?.email ?? "system";

  if (!content) {
    return res.status(400).json(
      errorEnvelope("gda-discussions", "post-message", { code: "BAD_REQUEST", message: "content is required", detail: null }),
    );
  }

  const pool = getPool();
  if (pool) {
    try {
      const threadCheck = await pool.query("SELECT id FROM discussion_threads WHERE id = $1", [threadId]);
      if (threadCheck.rows.length === 0) {
        return res.status(404).json(
          errorEnvelope("gda-discussions", "post-message", { code: "NOT_FOUND", message: `Thread ${threadId} not found`, detail: null }),
        );
      }

      const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const now = new Date().toISOString();

      await pool.query(
        `INSERT INTO discussion_messages (id, thread_id, author, content, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [msgId, threadId, resolvedAuthor, content, now],
      );

      await pool.query(
        `UPDATE discussion_threads
         SET message_count = message_count + 1,
             last_message_at = $1,
             updated_at = $1,
             participants = array(SELECT DISTINCT unnest(participants || ARRAY[$2]::text[]))
         WHERE id = $3`,
        [now, resolvedAuthor, threadId],
      );

      return res.json(
        successEnvelope("gda-discussions", "post-message", {
          message_id: msgId,
          thread_id: threadId,
          author: resolvedAuthor,
          content,
          created_at: now,
        }),
      );
    } catch (err) {
      process.stderr.write(`[discussions] post-message error: ${(err as Error).message}\n`);
      return res.status(500).json(
        errorEnvelope("gda-discussions", "post-message", { code: "DB_ERROR", message: "Failed to post message", detail: null }),
      );
    }
  }

  // Mock fallback
  return res.json(
    successEnvelope("gda-discussions", "post-message", {
      thread_id: threadId,
      message: "Message posted (dry-run). Connect DB for persistence.",
    }, {}, true),
  );
});

// ---------------------------------------------------------------------------
// POST /api/discussions/threads — create thread, real DB write
// ---------------------------------------------------------------------------
router.post("/threads", requireRole("admin", "bd_manager", "capture_lead", "analyst"), async (req, res) => {
  const { title, entity_type, entity_id, entity_title, tags } = req.body as {
    title?: string;
    entity_type?: string;
    entity_id?: string;
    entity_title?: string;
    tags?: string[];
  };
  const createdBy = (req as unknown as { user?: { email?: string } }).user?.email ?? "system";

  if (!title || !entity_type) {
    return res.status(400).json(
      errorEnvelope("gda-discussions", "create-thread", { code: "BAD_REQUEST", message: "title and entity_type are required", detail: null }),
    );
  }

  const pool = getPool();
  if (pool) {
    try {
      const threadId = `thread-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const now = new Date().toISOString();

      await pool.query(
        `INSERT INTO discussion_threads (id, entity_type, entity_id, entity_title, title, created_by, created_at, updated_at, participants, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9)`,
        [threadId, entity_type, entity_id ?? null, entity_title ?? null, title, createdBy, now, [createdBy], tags ?? []],
      );

      return res.json(
        successEnvelope("gda-discussions", "create-thread", {
          thread_id: threadId,
          title,
          entity_type,
          entity_id: entity_id ?? null,
          created_by: createdBy,
          created_at: now,
        }),
      );
    } catch (err) {
      process.stderr.write(`[discussions] create-thread error: ${(err as Error).message}\n`);
      return res.status(500).json(
        errorEnvelope("gda-discussions", "create-thread", { code: "DB_ERROR", message: "Failed to create thread", detail: null }),
      );
    }
  }

  // Mock fallback
  return res.json(
    successEnvelope("gda-discussions", "create-thread", {
      message: "Thread created (dry-run). Connect DB for persistence.",
    }, {}, true),
  );
});

export default router;
