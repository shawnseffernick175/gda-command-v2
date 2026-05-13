import { Router, Request, Response } from "express";
import multer from "multer";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { requireRole } from "../lib/auth";
type DocumentType = string;
type DocumentStatus = string;
interface KnowledgeDocument { id: string; title: string; collection: string; doc_type: DocumentType; status: DocumentStatus; chunks_indexed: number; access_count: number; created_at: string; tags: string[]; summary?: string; metadata?: Record<string, string>; file_size_bytes?: number; uploaded_at?: string; [key: string]: unknown }
interface ChatMessage { role: string; content: string; [key: string]: unknown }
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
router.get("/summary", async (_req, res) => {
  try {
    const pool = getPool();
    let summary = { total_documents: 0, indexed_count: 0, processing_count: 0, total_chunks: 0, total_access_count: 0, collection_count: 0, top_documents: [] as Record<string, unknown>[] };
    if (pool) {
      try {
        const [docRes, collRes, topRes] = await Promise.all([
          pool.query(`SELECT count(*)::int as total, count(*) FILTER (WHERE status='indexed')::int as indexed, count(*) FILTER (WHERE status='processing')::int as processing, coalesce(sum(chunk_count),0)::int as chunks, coalesce(sum(CASE WHEN status='indexed' THEN 1 ELSE 0 END),0)::int as access FROM knowledge_documents`),
          pool.query(`SELECT count(*)::int as cnt FROM knowledge_collections`),
          pool.query(`SELECT id, title, doc_type, status, chunk_count, created_at FROM knowledge_documents ORDER BY created_at DESC LIMIT 5`),
        ]);
        const d = docRes.rows[0];
        summary = {
          total_documents: d.total,
          indexed_count: d.indexed,
          processing_count: d.processing,
          total_chunks: d.chunks,
          total_access_count: d.access,
          collection_count: collRes.rows[0].cnt,
          top_documents: topRes.rows,
        };
      } catch { /* tables may not exist */ }
    }
    return res.json(successEnvelope("gda-knowledge", "summary", summary));
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
router.get("/collections", async (_req, res) => {
  try {
    const pool = getPool();
    let collections: Record<string, unknown>[] = [];
    if (pool) {
      try {
        const { rows } = await pool.query(`SELECT id, name, description, document_count, total_chunks, created_at FROM knowledge_collections ORDER BY name`);
        collections = rows;
      } catch { /* table may not exist */ }
    }
    return res.json(successEnvelope("gda-knowledge", "collections", collections));
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
router.get("/documents", async (req, res) => {
  try {
    const pool = getPool();
    let results: KnowledgeDocument[] = [];
    if (pool) {
      try {
        const { collection, type, status, search } = req.query;
        let query = `SELECT id, collection_id as collection, title, doc_type, file_name, file_size_bytes, page_count as pages, chunk_count as chunks_indexed, status, tags, metadata, indexed_at, created_at as uploaded_at, updated_at FROM knowledge_documents WHERE 1=1`;
        const params: unknown[] = [];
        let idx = 1;
        if (collection && typeof collection === "string") { query += ` AND collection_id = $${idx++}`; params.push(collection); }
        if (type && typeof type === "string") { query += ` AND doc_type = $${idx++}`; params.push(type); }
        if (status && typeof status === "string") { query += ` AND status = $${idx++}`; params.push(status); }
        if (search && typeof search === "string") { query += ` AND (title ILIKE $${idx} OR array_to_string(tags,',') ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
        query += ` ORDER BY created_at DESC`;
        const { rows } = await pool.query(query, params);
        results = rows.map((r: Record<string, unknown>) => ({
          id: r.id as string, title: r.title as string, collection: r.collection as string,
          doc_type: r.doc_type as DocumentType, status: r.status as DocumentStatus,
          chunks_indexed: (r.chunks_indexed as number) ?? 0, access_count: 0,
          created_at: r.uploaded_at as string, tags: (r.tags as string[]) ?? [],
          file_size_bytes: r.file_size_bytes as number, uploaded_at: r.uploaded_at as string,
        })) as KnowledgeDocument[];
      } catch { /* table may not exist */ }
    }
    return res.json(
      successEnvelope("gda-knowledge", "documents", results, { total: results.length }),
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
router.get("/documents/:id", async (req, res) => {
  try {
    const pool = getPool();
    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT id, collection_id as collection, title, doc_type, file_name, file_size_bytes, page_count as pages, chunk_count as chunks_indexed, status, tags, metadata, indexed_at, created_at as uploaded_at, updated_at FROM knowledge_documents WHERE id = $1`,
          [req.params.id]
        );
        if (rows.length > 0) {
          return res.json(successEnvelope("gda-knowledge", "document-detail", rows[0]));
        }
      } catch { /* table may not exist */ }
    }
    return res.status(404).json(
      errorEnvelope("gda-knowledge", "document-detail", {
        code: "NOT_FOUND",
        message: `Document ${req.params.id} not found`,
        detail: null,
      }),
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

    return res.json(
      successEnvelope("gda-knowledge", "search", {
        query: q.trim(),
        results: [],
        total_results: 0,
        source: "db",
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
    return res.json(
      successEnvelope("gda-knowledge", "chat-sessions", []),
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
    return res.status(404).json(
      errorEnvelope("gda-knowledge", "chat-session", {
        code: "NOT_FOUND",
        message: `Chat session ${req.params.id} not found`,
        detail: null,
      }),
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
    let searchSource = "db";

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

    /* No mock fallback for search results */

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

// ---------------------------------------------------------------------------
// POST /api/knowledge/quick-create — create a knowledge document (Quick Entry)
// ---------------------------------------------------------------------------
router.post("/quick-create", requireRole("admin", "bd_manager", "capture_lead", "analyst"), async (req: Request, res: Response) => {
  const { title, content, tags } = req.body as {
    title?: string;
    content?: string;
    tags?: string[];
  };

  if (!title) {
    return res.status(400).json(
      errorEnvelope("gda-knowledge", "quick-create", { code: "BAD_REQUEST", message: "title is required", detail: null }),
    );
  }

  const pool = getPool();
  if (!pool) {
    return res.status(500).json(
      errorEnvelope("gda-knowledge", "quick-create", { code: "DB_UNAVAILABLE", message: "Database not available", detail: null }),
    );
  }

  try {
    const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO knowledge_documents (id, title, doc_type, status, tags, metadata, created_at, updated_at)
       VALUES ($1, $2, 'note', 'indexed', $3, $4, $5, $5)`,
      [id, title, tags ?? [], JSON.stringify({ content: content ?? "", source: "quick-entry" }), now],
    );
    res.json(successEnvelope("gda-knowledge", "quick-create", { id, title }));
  } catch (e) {
    res.status(500).json(
      errorEnvelope("gda-knowledge", "quick-create", { code: "INTERNAL", message: (e as Error).message, detail: null }),
    );
  }
});

export default router;
