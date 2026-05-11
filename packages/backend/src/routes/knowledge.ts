import { Router, Request, Response } from "express";
import multer from "multer";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { requireRole } from "../lib/auth";
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
import { getPool } from "../lib/db";
import { log } from "../lib/logger";
import { generateStorageKey, saveFile, deleteFile, isAllowedMimeType, getMaxFileSize } from "../lib/storage";
import {
  isEmbeddingAvailable,
  vectorSearch,
  embedDocument,
  embedAllDocuments,
  getEmbeddingStats,
  type VectorSearchResult,
} from "../lib/embeddings";

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
// Uses pgvector when embeddings exist + OpenAI key available, else mock fallback.
// ---------------------------------------------------------------------------
router.get("/search", async (req, res) => {
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

    // Try real vector search first
    if (isEmbeddingAvailable()) {
      try {
        const vectorResults = await vectorSearch(q.trim(), maxResults);
        if (vectorResults.length > 0) {
          const results = vectorResults.map((vr) => ({
            document_id: vr.document_id,
            document_title: vr.document_title,
            document_type: vr.document_type,
            collection: vr.collection,
            relevance_score: vr.similarity,
            highlight: vr.chunk_text.slice(0, 200),
            chunks: [{
              chunk_id: `${vr.document_id}-chunk-${vr.chunk_index}`,
              text: vr.chunk_text,
              page: vr.page_number,
              section: vr.section_title ?? "Content",
              similarity_score: vr.similarity,
            }],
          }));

          return res.json(
            successEnvelope("gda-knowledge", "search", {
              query: q.trim(),
              results,
              total_results: results.length,
              source: "pgvector",
            }),
          );
        }
      } catch (vectorErr) {
        log.warn("vector_search_fallback", { error: (vectorErr as Error).message });
      }
    }

    // Fallback to mock keyword search
    const results = mockSemanticSearch(q.trim(), maxResults);

    return res.json(
      successEnvelope("gda-knowledge", "search", {
        query: q.trim(),
        results,
        total_results: results.length,
        source: "mock",
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
router.post("/chat", requireRole("admin", "bd_manager", "capture_lead", "analyst"), async (req, res) => {
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
    // Try real vector search first, fall back to mock
    let sourceDocs: Array<{document_id: string; document_title: string; chunk_text: string; page: number | null; relevance: number}> = [];
    let ragContext = "";
    let searchSource = "mock";

    if (isEmbeddingAvailable()) {
      try {
        const vectorResults = await vectorSearch(message.trim(), 5);
        if (vectorResults.length > 0) {
          searchSource = "pgvector";
          sourceDocs = vectorResults.map((vr) => ({
            document_id: vr.document_id,
            document_title: vr.document_title,
            chunk_text: vr.chunk_text,
            page: vr.page_number,
            relevance: vr.similarity,
          }));
          ragContext = vectorResults
            .map(
              (vr, i) =>
                `[Document ${i + 1}: "${vr.document_title}" (${Math.round(vr.similarity * 100)}% relevance)]\n${vr.chunk_text}`,
            )
            .join("\n\n---\n\n");
        }
      } catch (e) {
        log.warn("rag_vector_fallback", { error: (e as Error).message });
      }
    }

    if (sourceDocs.length === 0) {
      const searchResults = mockSemanticSearch(message.trim(), 5);
      sourceDocs = searchResults.map((r) => ({
        document_id: r.document_id,
        document_title: r.document_title,
        chunk_text: r.chunks[0]?.text ?? "",
        page: r.chunks[0]?.page ?? null,
        relevance: r.relevance_score,
      }));
      ragContext = searchResults
        .map(
          (r, i) =>
            `[Document ${i + 1}: "${r.document_title}" (${Math.round(r.relevance_score * 100)}% relevance)]\n${r.highlight}\n${r.chunks.map((c) => c.text).join("\n")}`,
        )
        .join("\n\n---\n\n");
    }

    if (isLLMAvailable() && sourceDocs.length > 0) {
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
      content: `Based on your knowledge base, I found ${sourceDocs.length} relevant document${sourceDocs.length === 1 ? "" : "s"} related to "${message.trim()}".\n\n${
        sourceDocs.length > 0
          ? sourceDocs
              .map(
                (r, i) =>
                  `**${i + 1}. ${r.document_title}** (${Math.round(r.relevance * 100)}% relevance)\n${r.chunk_text.slice(0, 200)}`,
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
// Multer config for knowledge uploads
// ---------------------------------------------------------------------------
const knowledgeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: getMaxFileSize() },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedMimeType(file.mimetype)) {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
      return;
    }
    cb(null, true);
  },
});

// ---------------------------------------------------------------------------
// POST /api/knowledge/upload — upload document (real file upload)
// ---------------------------------------------------------------------------
router.post(
  "/upload",
  requireRole("admin", "bd_manager", "capture_lead"),
  knowledgeUpload.single("file"),
  async (req: Request, res: Response) => {
    let storageKey: string | undefined;
    try {
      const file = req.file;
      const { document_type, collection, tags } = req.body as {
        document_type?: string;
        collection?: string;
        tags?: string;
      };

      // Support both file upload and legacy JSON-only mode
      if (!file) {
        // Legacy dry-run mode (backward compat)
        const { file_name } = req.body as { file_name?: string };
        if (!file_name || typeof file_name !== "string") {
          res.status(400).json(
            errorEnvelope("gda-knowledge", "upload", {
              code: "BAD_REQUEST",
              message: "No file provided. Send a multipart form with field name 'file', or provide file_name for dry-run.",
              detail: null,
            }),
          );
          return;
        }
        res.json(
          successEnvelope("gda-knowledge", "upload", {
            id: `doc-${Date.now()}`,
            file_name,
            document_type: document_type ?? "memo",
            collection: collection ?? "col-contracts",
            tags: tags ? (typeof tags === "string" ? tags.split(",").map((t: string) => t.trim()).filter(Boolean) : tags) : [],
            status: "pending",
            message: "Document queued for processing (dry-run).",
            estimated_processing_time: "2-5 minutes",
            pipeline: "GDA.batch.doc-ingest → GDA.api.embed-and-store",
          }, {}, true),
        );
        return;
      }

      // Real file upload
      storageKey = generateStorageKey(file.originalname);
      saveFile(storageKey, file.buffer);

      const parsedTags = tags
        ? (typeof tags === "string" ? tags.split(",").map((t: string) => t.trim()).filter(Boolean) : Array.isArray(tags) ? tags : [])
        : [];
      const docType = document_type ?? "memo";
      const collectionId = collection ?? "col-contracts";
      const docId = `doc-${Date.now()}`;
      const fileId = `file-${Date.now()}`;

      const pool = getPool();
      if (pool) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          // Insert uploaded_files record
          await client.query(
            `INSERT INTO uploaded_files (id, original_name, storage_key, mime_type, size_bytes, uploaded_by)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [fileId, file.originalname, storageKey, file.mimetype, file.size, req.user?.userId ?? null],
          );

          // Insert knowledge_documents record linked to file
          await client.query(
            `INSERT INTO knowledge_documents
               (id, collection_id, title, doc_type, file_name, file_size_bytes, page_count, chunk_count, status, tags, metadata, file_id, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 'pending', $7, $8, $9, NOW(), NOW())`,
            [
              docId,
              collectionId,
              file.originalname.replace(/\.[^.]+$/, ""),
              docType,
              file.originalname,
              file.size,
              parsedTags,
              JSON.stringify({ mime_type: file.mimetype, storage_key: storageKey }),
              fileId,
            ],
          );

          await client.query("COMMIT");
        } catch (txErr) {
          await client.query("ROLLBACK");
          // Clean up orphaned file on disk
          try { deleteFile(storageKey); } catch { /* best effort */ }
          throw txErr;
        } finally {
          client.release();
        }

        log.info("knowledge_document_uploaded", {
          docId,
          fileId,
          fileName: file.originalname,
          sizeBytes: file.size,
          collection: collectionId,
          uploadedBy: req.user?.userId,
        });
      }

      res.json(
        successEnvelope("gda-knowledge", "upload", {
          id: docId,
          file_id: fileId,
          file_name: file.originalname,
          document_type: docType,
          collection: collectionId,
          tags: parsedTags,
          size_bytes: file.size,
          mime_type: file.mimetype,
          status: "pending",
          download_url: `/api/files/${fileId}/download`,
          message: "Document uploaded and queued for processing.",
        }),
      );
    } catch (err) {
      // Clean up orphaned file if it was saved to disk before the error
      if (storageKey) {
        try { deleteFile(storageKey); } catch { /* best effort */ }
      }
      log.error("knowledge_upload_error", { error: (err as Error).message });
      res.status(500).json(
        errorEnvelope("gda-knowledge", "upload", {
          code: "INTERNAL",
          message: (err as Error).message || "Upload failed",
          detail: null,
        }),
      );
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/knowledge/embeddings/stats — embedding statistics
// ---------------------------------------------------------------------------
router.get("/embeddings/stats", async (_req, res) => {
  try {
    const stats = await getEmbeddingStats();
    return res.json(
      successEnvelope("gda-knowledge", "embedding-stats", stats),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-knowledge", "embedding-stats", {
        code: "INTERNAL",
        message: err instanceof Error ? err.message : "Unknown error",
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/knowledge/embeddings/generate — embed all unembedded docs (admin)
// ---------------------------------------------------------------------------
router.post("/embeddings/generate", requireRole("admin"), async (_req, res) => {
  try {
    if (!isEmbeddingAvailable()) {
      return res.status(400).json(
        errorEnvelope("gda-knowledge", "embed", {
          code: "NOT_CONFIGURED",
          message: "OPENAI_API_KEY not configured — embeddings unavailable",
          detail: null,
        }),
      );
    }

    const result = await embedAllDocuments();
    return res.json(
      successEnvelope("gda-knowledge", "embed", result),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-knowledge", "embed", {
        code: "INTERNAL",
        message: err instanceof Error ? err.message : "Unknown error",
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/knowledge/embeddings/document/:id — embed a single document (admin)
// ---------------------------------------------------------------------------
router.post("/embeddings/document/:id", requireRole("admin"), async (req, res) => {
  try {
    if (!isEmbeddingAvailable()) {
      return res.status(400).json(
        errorEnvelope("gda-knowledge", "embed-doc", {
          code: "NOT_CONFIGURED",
          message: "OPENAI_API_KEY not configured — embeddings unavailable",
          detail: null,
        }),
      );
    }

    const pool = getPool();
    if (!pool) {
      return res.status(500).json(
        errorEnvelope("gda-knowledge", "embed-doc", {
          code: "NO_DB",
          message: "Database not available",
          detail: null,
        }),
      );
    }

    const docId = req.params.id;
    const { rows } = await pool.query(
      `SELECT id, title, doc_type, tags, metadata FROM knowledge_documents WHERE id = $1`,
      [docId],
    );

    if (rows.length === 0) {
      return res.status(404).json(
        errorEnvelope("gda-knowledge", "embed-doc", {
          code: "NOT_FOUND",
          message: `Document ${docId} not found`,
          detail: null,
        }),
      );
    }

    const doc = rows[0];
    const textParts: string[] = [doc.title];
    if (doc.doc_type) textParts.push(`Document type: ${doc.doc_type}`);
    if (doc.tags?.length) textParts.push(`Tags: ${doc.tags.join(", ")}`);

    const meta = doc.metadata ?? {};
    if (meta.summary) textParts.push(meta.summary);
    if (meta.description) textParts.push(meta.description);
    if (meta.content) textParts.push(meta.content);

    const fullText = textParts.join("\n\n");
    const result = await embedDocument(docId, fullText);

    return res.json(
      successEnvelope("gda-knowledge", "embed-doc", result),
    );
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("gda-knowledge", "embed-doc", {
        code: "INTERNAL",
        message: err instanceof Error ? err.message : "Unknown error",
        detail: null,
      }),
    );
  }
});

export default router;
