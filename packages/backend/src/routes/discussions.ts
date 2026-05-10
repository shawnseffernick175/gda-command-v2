import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { MOCK_THREADS, MOCK_MESSAGES } from "../data/discussions-mock";
import type { DiscussionThread } from "../data/discussions-mock";

const router = Router();

router.get("/summary", (_req, res) => {
  try {
    const all = MOCK_THREADS;
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
        total_threads: all.length,
        active,
        resolved,
        total_messages: totalMessages,
        participants: uniqueParticipants,
        by_entity: entities,
      }),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-discussions", "summary", { code: "INTERNAL", message: (err as Error).message, detail: null }),
    );
  }
});

router.get("/threads", (req, res) => {
  try {
    let items: DiscussionThread[] = [...MOCK_THREADS];
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

router.get("/threads/:id", (req, res) => {
  const thread = MOCK_THREADS.find((t) => t.id === req.params.id);
  if (!thread) {
    return res.status(404).json(
      errorEnvelope("gda-discussions", "thread-detail", { code: "NOT_FOUND", message: `Thread ${req.params.id} not found`, detail: null }),
    );
  }
  return res.json(successEnvelope("gda-discussions", "thread-detail", thread));
});

router.get("/threads/:id/messages", (req, res) => {
  const messages = MOCK_MESSAGES[req.params.id] ?? [];
  return res.json(
    successEnvelope("gda-discussions", "messages", messages, { total: messages.length }),
  );
});

router.post("/threads/:id/messages", (req, res) => {
  return res.json(
    successEnvelope("gda-discussions", "post-message", {
      thread_id: req.params.id,
      message: "Message posted (dry-run). In production, this sends via GDA.api.discussions.",
    }, {}, true),
  );
});

router.post("/threads", (_req, res) => {
  return res.json(
    successEnvelope("gda-discussions", "create-thread", {
      message: "Thread created (dry-run). In production, this creates via GDA.api.discussions.",
    }, {}, true),
  );
});

export default router;
