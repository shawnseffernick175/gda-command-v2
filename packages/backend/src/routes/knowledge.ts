import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import {
  MOCK_DOCUMENTS,
  MOCK_COLLECTIONS,
  MOCK_CHAT_SESSIONS,
  mockSemanticSearch,
} from "../data/knowledge-mock";
import type {
  KnowledgeDocument,
  DocumentType,
  DocumentStatus,
  ChatMessage,
} from "../data/knowledge-mock";
import { isLLMAvailable, chatCompletion, SYSTEM_PROMPTS } from "../lib/llm";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/knowledge/summary — top-line summary cards
// ---------------------------------------------------------------------------
router.get("/summary", (_req, res) => {
  try {
    const indexed = MOCK_DOCUMENTS.filter((d) => d.status === "indexed");
    const processing = MOCK_DOCUMENTS.filter((d) => d.status === "processing");

    const totalChunks = MOCK_DOCUMENTS.reduce((sum, d) => sum + d.chunks_indexed, 0);
    const totalAccess = MOCK_DOCUMENTS.reduce((sum, d) => sum + d.access_count, 0);

    // Most accessed documents
    const topDocs = [...indexed]
      .sort((a, b) => b.access_count - a.access_count)
      .slice(0, 5)
      .map((d) => ({ id: d.id, title: d.title, access_count: d.access_count }));

    return res.json(
      successEnvelope("gda-knowledge", "summary", {
        total_documents: MOCK_DOCUMENTS.length,
        indexed_count: indexed.length,
        processing_count: processing.length,
        total_chunks: totalChunks,
        total_access_count: totalAccess,
        collection_count: MOCK_COLLECTIONS.length,
        top_documents: topDocs,
      }),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-knowledge", "summary", {
        code: "INTERNAL",
        message: err instanceof Error ? err.message : "Unknown error",
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/knowledge/collections — list all collections with stats
// ---------------------------------------------------------------------------
router.get("/collections", (_req, res) => {
  try {
    return res.json(
      successEnvelope("gda-knowledge", "collections", MOCK_COLLECTIONS),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-knowledge", "collections", {
        code: "INTERNAL",
        message: err instanceof Error ? err.message : "Unknown error",
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/knowledge/documents — list documents with filtering
// ---------------------------------------------------------------------------
router.get("/documents", (req, res) => {
  try {
    let results: KnowledgeDocument[] = [...MOCK_DOCUMENTS];

    const { collection, type, status, search, sort } = req.query;

    if (collection && typeof collection === "string") {
      results = results.filter((d) => d.collection === collection);
    }

    if (type && typeof type === "string") {
      results = results.filter((d) => d.type === (type as DocumentType));
    }

    if (status && typeof status === "string") {
      results = results.filter((d) => d.status === (status as DocumentStatus));
    }

    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      results = results.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.summary.toLowerCase().includes(q) ||
          d.tags.some((t) => t.toLowerCase().includes(q)) ||
          (d.metadata.agency && d.metadata.agency.toLowerCase().includes(q)),
      );
    }

    // Sort
    const sortBy = typeof sort === "string" ? sort : "recent";
    if (sortBy === "accessed") {
      results.sort((a, b) => b.access_count - a.access_count);
    } else if (sortBy === "name") {
      results.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === "size") {
      results.sort((a, b) => b.file_size_bytes - a.file_size_bytes);
    } else {
      // "recent" — sort by uploaded_at descending
      results.sort(
        (a, b) =>
          new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime(),
      );
    }

    return res.json(
      successEnvelope("gda-knowledge", "documents", results, {
        total: results.length,
      }),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-knowledge", "documents", {
        code: "INTERNAL",
        message: err instanceof Error ? err.message : "Unknown error",
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/knowledge/documents/:id — single document detail
// ---------------------------------------------------------------------------
router.get("/documents/:id", (req, res) => {
  try {
    const doc = MOCK_DOCUMENTS.find((d) => d.id === req.params.id);
    if (!doc) {
      return res.status(404).json(
        errorEnvelope("gda-knowledge", "document-detail", {
          code: "NOT_FOUND",
          message: `Document ${req.params.id} not found`,
          detail: null,
        }),
      );
    }

    return res.json(
      successEnvelope("gda-knowledge", "document-detail", doc),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-knowledge", "document-detail", {
        code: "INTERNAL",
        message: err instanceof Error ? err.message : "Unknown error",
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/knowledge/search — semantic search across knowledge base
// ---------------------------------------------------------------------------
router.get("/search", (req, res) => {
  try {
    const { q, limit } = req.query;

    if (!q || typeof q !== "string" || q.trim().length === 0) {
      return res.status(400).json(
        errorEnvelope("gda-knowledge", "search", {
          code: "BAD_REQUEST",
          message: "Query parameter 'q' is required",
          detail: null,
        }),
      );
    }

    const limitRaw =
      limit && typeof limit === "string" ? parseInt(limit, 10) : 10;
    const maxResults = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 20) : 10;

    const results = mockSemanticSearch(q.trim(), maxResults);

    return res.json(
      successEnvelope("gda-knowledge", "search", {
        query: q.trim(),
        results,
        total_results: results.length,
      }),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-knowledge", "search", {
        code: "INTERNAL",
        message: err instanceof Error ? err.message : "Unknown error",
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/knowledge/chat/sessions — list chat sessions
// ---------------------------------------------------------------------------
router.get("/chat/sessions", (_req, res) => {
  try {
    const sessions = MOCK_CHAT_SESSIONS.map((s) => ({
      id: s.id,
      title: s.title,
      message_count: s.messages.length,
      created_at: s.created_at,
      last_message: s.messages[s.messages.length - 1]?.content.slice(0, 100) ?? "",
    }));

    return res.json(
      successEnvelope("gda-knowledge", "chat-sessions", sessions),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-knowledge", "chat-sessions", {
        code: "INTERNAL",
        message: err instanceof Error ? err.message : "Unknown error",
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/knowledge/chat/sessions/:id — get full chat session
// ---------------------------------------------------------------------------
router.get("/chat/sessions/:id", (req, res) => {
  try {
    const session = MOCK_CHAT_SESSIONS.find((s) => s.id === req.params.id);
    if (!session) {
      return res.status(404).json(
        errorEnvelope("gda-knowledge", "chat-session", {
          code: "NOT_FOUND",
          message: `Chat session ${req.params.id} not found`,
          detail: null,
        }),
      );
    }

    return res.json(
      successEnvelope("gda-knowledge", "chat-session", session),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-knowledge", "chat-session", {
        code: "INTERNAL",
        message: err instanceof Error ? err.message : "Unknown error",
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/knowledge/chat — send a message (LLM-powered with RAG context)
// ---------------------------------------------------------------------------
router.post("/chat", async (req, res) => {
  try {
    const { message, session_id } = req.body as {
      message?: string;
      session_id?: string;
    };

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json(
        errorEnvelope("gda-knowledge", "chat", {
          code: "BAD_REQUEST",
          message: "Message body is required",
          detail: null,
        }),
      );
    }

    // Retrieve relevant document context via semantic search
    const searchResults = mockSemanticSearch(message.trim(), 5);

    const sourceDocs = searchResults.map((r) => ({
      document_id: r.document_id,
      document_title: r.document_title,
      chunk_text: r.chunks[0]?.text ?? "",
      page: r.chunks[0]?.page ?? null,
      relevance: r.relevance_score,
    }));

    // Build RAG context from retrieved documents
    const ragContext = searchResults
      .map(
        (r, i) =>
          `[Document ${i + 1}: "${r.document_title}" (${Math.round(r.relevance_score * 100)}% relevance)]\n${r.highlight}\n${r.chunks.map((c) => c.text).join("\n")}`,
      )
      .join("\n\n---\n\n");

    if (isLLMAvailable() && searchResults.length > 0) {
      // Real LLM call with RAG context
      const llmResponse = await chatCompletion(
        [
          { role: "system", content: SYSTEM_PROMPTS.ragChat },
          {
            role: "user",
            content: `Here are the relevant documents from the GDA knowledge base:\n\n${ragContext}\n\n---\n\nUser question: ${message.trim()}`,
          },
        ],
        { temperature: 0.3, max_tokens: 1500 },
      );

      const response: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: llmResponse.content,
        timestamp: new Date().toISOString(),
        sources: sourceDocs,
      };

      return res.json(
        successEnvelope("gda-knowledge", "chat", {
          session_id: session_id ?? `chat-${Date.now()}`,
          message: response,
          ai: { model: llmResponse.model, tokens: llmResponse.usage.total_tokens },
        }),
      );
    }

    // Fallback: mock response when LLM is not available
    const response: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "assistant",
      content: `Based on your knowledge base, I found ${searchResults.length} relevant document${searchResults.length === 1 ? "" : "s"} related to "${message.trim()}".\n\n${
        searchResults.length > 0
          ? searchResults
              .map(
                (r, i) =>
                  `**${i + 1}. ${r.document_title}** (${Math.round(r.relevance_score * 100)}% relevance)\n${r.highlight}`,
              )
              .join("\n\n")
          : "No directly relevant documents were found. Try rephrasing your query or uploading relevant documents to the knowledge base."
      }\n\n*Set OPENAI_API_KEY for AI-powered responses with source citations.*`,
      timestamp: new Date().toISOString(),
      sources: sourceDocs,
    };

    return res.json(
      successEnvelope("gda-knowledge", "chat", {
        session_id: session_id ?? `chat-${Date.now()}`,
        message: response,
      }, {}, true),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-knowledge", "chat", {
        code: "INTERNAL",
        message: err instanceof Error ? err.message : "Unknown error",
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/knowledge/upload — upload document (dry-run)
// ---------------------------------------------------------------------------
router.post("/upload", (req, res) => {
  try {
    const { file_name, document_type, collection, tags } = req.body as {
      file_name?: string;
      document_type?: string;
      collection?: string;
      tags?: string[];
    };

    if (!file_name || typeof file_name !== "string") {
      return res.status(400).json(
        errorEnvelope("gda-knowledge", "upload", {
          code: "BAD_REQUEST",
          message: "file_name is required",
          detail: null,
        }),
      );
    }

    return res.json(
      successEnvelope(
        "gda-knowledge",
        "upload",
        {
          id: `doc-${Date.now()}`,
          file_name,
          document_type: document_type ?? "memo",
          collection: collection ?? "col-contracts",
          tags: tags ?? [],
          status: "pending",
          message: "Document queued for processing. Will be sent to n8n doc-ingest pipeline.",
          estimated_processing_time: "2-5 minutes",
          pipeline: "GDA.batch.doc-ingest → GDA.api.embed-and-store",
        },
        {},
        true,
      ),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-knowledge", "upload", {
        code: "INTERNAL",
        message: err instanceof Error ? err.message : "Unknown error",
        detail: null,
      }),
    );
  }
});

export default router;
