// ---------------------------------------------------------------------------
// Internal vector endpoints for n8n workflows.
// POST /api/internal/vector-upsert
// POST /api/internal/vector-delete
// POST /api/internal/vector-delete-by-document
// POST /api/internal/vector-ingest-url
// POST /api/internal/vector-query          (Phase 2C PR 2)
// POST /api/internal/vector-query-compare  (Phase 2C PR 2 — parity debugging)
// POST /api/internal/vector-fetch          (Phase 2C PR 2 — fetch by ids)
// POST /api/internal/vector-list-document  (Phase 2C PR 2 — list by doc)
//
// Auth: x-gda-key header (same as ingest endpoints).
// ---------------------------------------------------------------------------

import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { log } from "../lib/logger";
import {
  upsertEmbeddings,
  deleteEmbeddings,
  deleteByDocumentId,
  queryEmbeddings,
  fetchEmbeddingsById,
  listEmbeddingsByDocument,
} from "../lib/vector-stores/pgvector";
import type { VectorItem } from "../lib/vector-stores/pgvector";
import { chunkText, generateEmbeddings } from "../lib/embeddings";

const router = Router();

function verifyInternalKey(
  req: import("express").Request,
  res: import("express").Response,
): boolean {
  const key = process.env.GDA_WEBHOOK_KEY;
  if (!key) {
    res.status(503).json(
      errorEnvelope("vector-internal", "auth", {
        code: "NOT_CONFIGURED",
        message: "GDA_WEBHOOK_KEY not set",
        detail: null,
      }),
    );
    return false;
  }
  const provided = req.headers["x-gda-key"] as string;
  if (provided !== key) {
    res.status(401).json(
      errorEnvelope("vector-internal", "auth", {
        code: "UNAUTHORIZED",
        message: "Invalid or missing x-gda-key header",
        detail: null,
      }),
    );
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// POST /api/internal/vector-upsert
// Body: { collection: string, items: VectorItem[] }
// ---------------------------------------------------------------------------

router.post("/vector-upsert", async (req, res) => {
  if (!verifyInternalKey(req, res)) return;

  try {
    const { collection, items } = req.body as {
      collection?: string;
      items?: VectorItem[];
    };

    if (!collection || typeof collection !== "string") {
      return res.status(400).json(
        errorEnvelope("vector-internal", "upsert", {
          code: "INVALID_COLLECTION",
          message: "collection is required and must be a string",
          detail: null,
        }),
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json(
        errorEnvelope("vector-internal", "upsert", {
          code: "INVALID_ITEMS",
          message: "items must be a non-empty array",
          detail: null,
        }),
      );
    }

    // Validate each item has id + embedding
    for (const item of items) {
      if (!item.id || !Array.isArray(item.embedding) || item.embedding.length === 0) {
        return res.status(400).json(
          errorEnvelope("vector-internal", "upsert", {
            code: "INVALID_ITEM",
            message: `Each item must have id (string) and embedding (number[])`,
            detail: item.id ?? null,
          }),
        );
      }
    }

    await upsertEmbeddings(collection, items);

    log.info("vector_internal_upsert", {
      collection,
      count: items.length,
    });

    return res.json(
      successEnvelope("vector-internal", "upsert", {
        upserted: items.length,
        collection,
      }),
    );
  } catch (e) {
    log.error("vector_internal_upsert_failed", {
      error: (e as Error).message,
    });
    return res.status(500).json(
      errorEnvelope("vector-internal", "upsert", {
        code: "INTERNAL_ERROR",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/internal/vector-delete
// Body: { ids: string[] }
// ---------------------------------------------------------------------------

router.post("/vector-delete", async (req, res) => {
  if (!verifyInternalKey(req, res)) return;

  try {
    const { ids } = req.body as { ids?: string[] };

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json(
        errorEnvelope("vector-internal", "delete", {
          code: "INVALID_IDS",
          message: "ids must be a non-empty string array",
          detail: null,
        }),
      );
    }

    await deleteEmbeddings(ids);

    return res.json(
      successEnvelope("vector-internal", "delete", {
        deleted: ids.length,
      }),
    );
  } catch (e) {
    return res.status(500).json(
      errorEnvelope("vector-internal", "delete", {
        code: "INTERNAL_ERROR",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/internal/vector-delete-by-document
// Body: { documentId: string }
// ---------------------------------------------------------------------------

router.post("/vector-delete-by-document", async (req, res) => {
  if (!verifyInternalKey(req, res)) return;

  try {
    const { documentId } = req.body as { documentId?: string };

    if (!documentId || typeof documentId !== "string") {
      return res.status(400).json(
        errorEnvelope("vector-internal", "delete-by-document", {
          code: "INVALID_DOCUMENT_ID",
          message: "documentId is required",
          detail: null,
        }),
      );
    }

    await deleteByDocumentId(documentId);

    return res.json(
      successEnvelope("vector-internal", "delete-by-document", {
        documentId,
      }),
    );
  } catch (e) {
    return res.status(500).json(
      errorEnvelope("vector-internal", "delete-by-document", {
        code: "INTERNAL_ERROR",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/internal/vector-ingest-url
// Body: { url: string, collection: string, document_id?: string }
// Downloads file from URL, extracts text, chunks, embeds, upserts.
// Used by workflow 3 (ai-agent-upload) where embeddings are generated by
// the langchain Pinecone node internally and not accessible for dual-write.
// ---------------------------------------------------------------------------

router.post("/vector-ingest-url", async (req, res) => {
  if (!verifyInternalKey(req, res)) return;

  try {
    const { url, collection, document_id } = req.body as {
      url?: string;
      collection?: string;
      document_id?: string;
    };

    if (!url || typeof url !== "string") {
      return res.status(400).json(
        errorEnvelope("vector-internal", "ingest-url", {
          code: "INVALID_URL",
          message: "url is required and must be a string",
          detail: null,
        }),
      );
    }

    if (!collection || typeof collection !== "string") {
      return res.status(400).json(
        errorEnvelope("vector-internal", "ingest-url", {
          code: "INVALID_COLLECTION",
          message: "collection is required and must be a string",
          detail: null,
        }),
      );
    }

    // URL host allowlist validation
    const allowedHostsRaw = process.env.URL_INGEST_ALLOWED_HOSTS;
    if (allowedHostsRaw) {
      const allowedHosts = allowedHostsRaw.split(",").map((h) => h.trim().toLowerCase());
      let hostname: string;
      try {
        hostname = new URL(url).hostname.toLowerCase();
      } catch {
        return res.status(400).json(
          errorEnvelope("vector-internal", "ingest-url", {
            code: "INVALID_URL",
            message: "url is not a valid URL",
            detail: url,
          }),
        );
      }
      if (!allowedHosts.includes(hostname)) {
        return res.status(403).json(
          errorEnvelope("vector-internal", "ingest-url", {
            code: "HOST_NOT_ALLOWED",
            message: `Host '${hostname}' is not in URL_INGEST_ALLOWED_HOSTS`,
            detail: null,
          }),
        );
      }
    }

    const maxBytes = parseInt(process.env.MAX_INGEST_URL_BYTES || "209715200", 10);
    const fetchTimeoutMs = 60_000;

    const docId = document_id || `ingest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Download file with timeout and size limit
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch (fetchErr) {
      clearTimeout(timeout);
      const msg = (fetchErr as Error).name === "AbortError"
        ? "Download timed out (60s)"
        : `Download failed: ${(fetchErr as Error).message}`;
      return res.status(400).json(
        errorEnvelope("vector-internal", "ingest-url", {
          code: "DOWNLOAD_FAILED",
          message: msg,
          detail: url,
        }),
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return res.status(400).json(
        errorEnvelope("vector-internal", "ingest-url", {
          code: "DOWNLOAD_FAILED",
          message: `Failed to download file: ${response.status} ${response.statusText}`,
          detail: url,
        }),
      );
    }

    // Check Content-Length header if available
    const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
    if (contentLength > maxBytes) {
      return res.status(413).json(
        errorEnvelope("vector-internal", "ingest-url", {
          code: "FILE_TOO_LARGE",
          message: `File size ${contentLength} exceeds MAX_INGEST_URL_BYTES (${maxBytes})`,
          detail: null,
        }),
      );
    }

    // Stream body and enforce size limit
    const bufParts: Buffer[] = [];
    let totalBytes = 0;
    for await (const part of response.body as AsyncIterable<Uint8Array>) {
      totalBytes += part.length;
      if (totalBytes > maxBytes) {
        return res.status(413).json(
          errorEnvelope("vector-internal", "ingest-url", {
            code: "FILE_TOO_LARGE",
            message: `Download exceeded MAX_INGEST_URL_BYTES (${maxBytes})`,
            detail: null,
          }),
        );
      }
      bufParts.push(Buffer.from(part));
    }
    const buffer = Buffer.concat(bufParts);

    // Extract text from PDF using pdf-parse (same lib as F-038 ingestion)
    let text = "";
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("pdf") || url.toLowerCase().endsWith(".pdf")) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfMod = require("pdf-parse") as {
          PDFParse: new (opts: { data: Buffer | Uint8Array }) => {
            getText: () => Promise<{ text: string }>;
            destroy: () => Promise<void>;
          };
        };
        const parser = new pdfMod.PDFParse({ data: buffer });
        try {
          const result = await parser.getText();
          text = result.text;
        } finally {
          await parser.destroy().catch(() => {});
        }
      } catch (pdfErr) {
        // Fallback: try as plain text
        text = buffer.toString("utf-8");
      }
    } else {
      text = buffer.toString("utf-8");
    }

    if (!text || text.trim().length === 0) {
      return res.status(400).json(
        errorEnvelope("vector-internal", "ingest-url", {
          code: "NO_TEXT",
          message: "Could not extract text from file",
          detail: null,
        }),
      );
    }

    // Chunk text
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      return res.json(
        successEnvelope("vector-internal", "ingest-url", {
          document_id: docId,
          chunks: 0,
          collection,
        }),
      );
    }

    // Generate embeddings
    const chunkTexts = chunks.map((c) => c.text);
    const embeddings = await generateEmbeddings(chunkTexts);

    // Build VectorItems
    const items: VectorItem[] = chunks.map((chunk, i) => ({
      id: `${docId}_chunk_${chunk.chunkIndex}`,
      content: chunk.text,
      embedding: embeddings[i],
      metadata: {
        document_id: docId,
        chunk_index: chunk.chunkIndex,
        page_number: chunk.page ?? null,
        section_title: chunk.section ?? null,
        source: url,
      },
    }));

    await upsertEmbeddings(collection, items);

    log.info("vector_internal_ingest_url", {
      collection,
      document_id: docId,
      chunks: chunks.length,
    });

    return res.json(
      successEnvelope("vector-internal", "ingest-url", {
        document_id: docId,
        chunks: chunks.length,
        collection,
      }),
    );
  } catch (e) {
    log.error("vector_internal_ingest_url_failed", {
      error: (e as Error).message,
    });
    return res.status(500).json(
      errorEnvelope("vector-internal", "ingest-url", {
        code: "INTERNAL_ERROR",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/internal/vector-query
// Body: { collection: string, embedding: number[], topK?: number, filter?: object }
// ---------------------------------------------------------------------------

router.post("/vector-query", async (req, res) => {
  if (!verifyInternalKey(req, res)) return;

  try {
    const { collection, embedding, topK, filter } = req.body as {
      collection?: string;
      embedding?: number[];
      topK?: number;
      filter?: Record<string, unknown>;
    };

    if (!collection || typeof collection !== "string") {
      return res.status(400).json(
        errorEnvelope("vector-internal", "query", {
          code: "INVALID_COLLECTION",
          message: "collection is required and must be a string",
          detail: null,
        }),
      );
    }

    if (!Array.isArray(embedding) || embedding.length !== 1536) {
      return res.status(400).json(
        errorEnvelope("vector-internal", "query", {
          code: "INVALID_EMBEDDING",
          message: "embedding must be a number[] of length 1536",
          detail: null,
        }),
      );
    }

    const k = topK ?? 10;
    if (typeof k !== "number" || k < 1 || k > 50) {
      return res.status(400).json(
        errorEnvelope("vector-internal", "query", {
          code: "INVALID_TOPK",
          message: "topK must be between 1 and 50",
          detail: null,
        }),
      );
    }

    const results = await queryEmbeddings(collection, embedding, k, filter);

    return res.json(
      successEnvelope("vector-internal", "query", { results }),
    );
  } catch (e) {
    log.error("vector_internal_query_failed", {
      error: (e as Error).message,
    });
    return res.status(500).json(
      errorEnvelope("vector-internal", "query", {
        code: "INTERNAL_ERROR",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/internal/vector-query-compare
// Calls BOTH pgvector and Pinecone, returns overlap metrics.
// Debugging surface only — not consumed by n8n workflows.
// ---------------------------------------------------------------------------

router.post("/vector-query-compare", async (req, res) => {
  if (!verifyInternalKey(req, res)) return;

  try {
    const { collection, embedding, topK } = req.body as {
      collection?: string;
      embedding?: number[];
      topK?: number;
    };

    if (!collection || typeof collection !== "string") {
      return res.status(400).json(
        errorEnvelope("vector-internal", "query-compare", {
          code: "INVALID_COLLECTION",
          message: "collection is required",
          detail: null,
        }),
      );
    }

    if (!Array.isArray(embedding) || embedding.length !== 1536) {
      return res.status(400).json(
        errorEnvelope("vector-internal", "query-compare", {
          code: "INVALID_EMBEDDING",
          message: "embedding must be a number[] of length 1536",
          detail: null,
        }),
      );
    }

    const k = Math.max(1, Math.min(50, topK ?? 10));

    // pgvector query
    const pgResults = await queryEmbeddings(collection, embedding, k);

    // Pinecone query via HTTP (same pattern as n8n workflows)
    const pineconeHost = process.env.PINECONE_HOST
      || "https://ai-assistant-ezysp85.svc.aped-4627-b74a.pinecone.io";
    const pineconeKey = process.env.PINECONE_API_KEY || "";

    let pineconeResults: { id: string; score: number; metadata: Record<string, unknown> }[] = [];
    if (pineconeKey) {
      try {
        const pineconeResp = await fetch(`${pineconeHost}/query`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Api-Key": pineconeKey,
          },
          body: JSON.stringify({
            namespace: (collection === "ai-agent-attachments" || collection === "knowledge") ? "" : collection,
            topK: k,
            vector: embedding,
            includeMetadata: true,
          }),
        });
        if (pineconeResp.ok) {
          const pineconeData = await pineconeResp.json() as {
            matches?: { id: string; score: number; metadata?: Record<string, unknown> }[];
          };
          pineconeResults = (pineconeData.matches || []).map((m) => ({
            id: m.id,
            score: m.score,
            metadata: m.metadata || {},
          }));
        }
      } catch (pineconeErr) {
        log.warn("vector_query_compare_pinecone_failed", {
          error: (pineconeErr as Error).message,
        });
      }
    }

    // Compute overlap
    const pgIds = pgResults.slice(0, 10).map((r) => r.id);
    const pcIds = pineconeResults.slice(0, 10).map((r) => r.id);
    const top1Match = pgIds.length > 0 && pcIds.length > 0 && pgIds[0] === pcIds[0];
    const top5Overlap = pgIds.slice(0, 5).filter((id) => pcIds.slice(0, 5).includes(id)).length;
    const top10Overlap = pgIds.filter((id) => pcIds.includes(id)).length;

    return res.json(
      successEnvelope("vector-internal", "query-compare", {
        pgvector: pgResults,
        pinecone: pineconeResults,
        overlap: {
          top1_match: top1Match,
          top5_overlap: top5Overlap,
          top10_overlap: top10Overlap,
        },
      }),
    );
  } catch (e) {
    log.error("vector_internal_query_compare_failed", {
      error: (e as Error).message,
    });
    return res.status(500).json(
      errorEnvelope("vector-internal", "query-compare", {
        code: "INTERNAL_ERROR",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/internal/vector-fetch
// Body: { ids: string[] }
// Returns full vector records by id (for doc-compare workflow)
// ---------------------------------------------------------------------------

router.post("/vector-fetch", async (req, res) => {
  if (!verifyInternalKey(req, res)) return;

  try {
    const { ids } = req.body as { ids?: string[] };

    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) {
      return res.status(400).json(
        errorEnvelope("vector-internal", "fetch", {
          code: "INVALID_IDS",
          message: "ids must be a non-empty string array (max 100)",
          detail: null,
        }),
      );
    }

    const results = await fetchEmbeddingsById(ids);

    return res.json(
      successEnvelope("vector-internal", "fetch", { vectors: results }),
    );
  } catch (e) {
    return res.status(500).json(
      errorEnvelope("vector-internal", "fetch", {
        code: "INTERNAL_ERROR",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/internal/vector-list-document
// Body: { collection: string, documentId: string }
// Lists vector ids for a given document (for doc-compare workflow)
// ---------------------------------------------------------------------------

router.post("/vector-list-document", async (req, res) => {
  if (!verifyInternalKey(req, res)) return;

  try {
    const { collection, documentId } = req.body as {
      collection?: string;
      documentId?: string;
    };

    if (!collection || typeof collection !== "string") {
      return res.status(400).json(
        errorEnvelope("vector-internal", "list-document", {
          code: "INVALID_COLLECTION",
          message: "collection is required",
          detail: null,
        }),
      );
    }

    if (!documentId || typeof documentId !== "string") {
      return res.status(400).json(
        errorEnvelope("vector-internal", "list-document", {
          code: "INVALID_DOCUMENT_ID",
          message: "documentId is required",
          detail: null,
        }),
      );
    }

    const vectors = await listEmbeddingsByDocument(collection, documentId);

    return res.json(
      successEnvelope("vector-internal", "list-document", { vectors }),
    );
  } catch (e) {
    return res.status(500).json(
      errorEnvelope("vector-internal", "list-document", {
        code: "INTERNAL_ERROR",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

export default router;
