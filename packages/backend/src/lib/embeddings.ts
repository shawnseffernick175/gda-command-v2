// ---------------------------------------------------------------------------
// Embedding Service — OpenAI text-embedding-3-small + pgvector storage
// Provides document chunking, embedding generation, and vector similarity search.
// Falls back gracefully when OPENAI_API_KEY is not set.
// ---------------------------------------------------------------------------

import OpenAI from "openai";
import { getPool } from "./db";
import { log } from "./logger";
import {
  upsertEmbeddings as pgvectorUpsert,
  deleteByDocumentId as pgvectorDeleteByDoc,
  logDualWriteError,
} from "./vector-stores/pgvector";
import type { VectorItem } from "./vector-stores/pgvector";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const MAX_CHUNK_TOKENS = 500; // ~2000 chars per chunk
const CHUNK_OVERLAP_CHARS = 200;
const MAX_CHARS_PER_CHUNK = 2000;
const BATCH_SIZE = 20; // OpenAI supports up to 2048 inputs per call
const DUAL_WRITE_COLLECTION = "knowledge";
const DUAL_WRITE_ENABLED =
  (process.env.DUAL_WRITE_PGVECTOR ?? "true").toLowerCase() !== "false";

export function isDualWriteEnabled(): boolean {
  return DUAL_WRITE_ENABLED;
}

// ---------------------------------------------------------------------------
// Dual-write helper — fire-and-forget pgvector mirror write
// ---------------------------------------------------------------------------

function dualWriteToPgvector(
  collection: string,
  documentId: string,
  items: VectorItem[],
): void {
  // Delete existing + upsert new, all in background
  pgvectorDeleteByDoc(collection, documentId)
    .then(() => pgvectorUpsert(collection, items))
    .then(() => {
      log.info("dual_write_pgvector_ok", {
        collection,
        documentId,
        count: items.length,
      });
    })
    .catch((err: Error) => {
      log.warn("dual_write_pgvector_failed", {
        collection,
        documentId,
        error: err.message,
      });
      logDualWriteError(collection, documentId, err.message).catch(() => {});
    });
}

// ---------------------------------------------------------------------------
// OpenAI client (reuses the same key as LLM service)
// ---------------------------------------------------------------------------

let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  _client = new OpenAI({ apiKey: key });
  return _client;
}

export function isEmbeddingAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

// ---------------------------------------------------------------------------
// Text chunking — split document text into overlapping chunks
// ---------------------------------------------------------------------------

export interface TextChunk {
  text: string;
  chunkIndex: number;
  page?: number;
  section?: string;
}

export function chunkText(
  fullText: string,
  opts?: { maxChars?: number; overlapChars?: number },
): TextChunk[] {
  const maxChars = opts?.maxChars ?? MAX_CHARS_PER_CHUNK;
  const overlap = opts?.overlapChars ?? CHUNK_OVERLAP_CHARS;

  if (!fullText || fullText.trim().length === 0) return [];

  const chunks: TextChunk[] = [];

  // Split by paragraph boundaries first
  const paragraphs = fullText.split(/\n{2,}/);
  let currentChunk = "";
  let chunkIndex = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // If a single paragraph exceeds maxChars, split it into windows
    if (trimmed.length > maxChars) {
      // Flush any buffered content first
      if (currentChunk.trim()) {
        chunks.push({ text: currentChunk.trim(), chunkIndex: chunkIndex++ });
        currentChunk = "";
      }
      for (let i = 0; i < trimmed.length; i += maxChars - overlap) {
        chunks.push({
          text: trimmed.slice(i, i + maxChars).trim(),
          chunkIndex: chunkIndex++,
        });
      }
      continue;
    }

    if (currentChunk.length + trimmed.length + 2 > maxChars && currentChunk.length > 0) {
      chunks.push({ text: currentChunk.trim(), chunkIndex: chunkIndex++ });

      // Keep overlap from end of previous chunk
      const overlapStart = Math.max(0, currentChunk.length - overlap);
      currentChunk = currentChunk.slice(overlapStart).trim() + "\n\n" + trimmed;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + trimmed;
    }
  }

  if (currentChunk.trim()) {
    chunks.push({ text: currentChunk.trim(), chunkIndex: chunkIndex++ });
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Generate embeddings via OpenAI API
// ---------------------------------------------------------------------------

export async function generateEmbeddings(
  texts: string[],
): Promise<number[][]> {
  const client = getClient();
  if (!client) throw new Error("OPENAI_API_KEY not configured");

  const results: number[][] = [];

  // Process in batches
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    const sorted = [...response.data].sort((a, b) => a.index - b.index);
    for (const item of sorted) {
      results.push(item.embedding);
    }

    // Rate limit between batches
    if (i + BATCH_SIZE < texts.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return results;
}

/** Generate a single embedding for a query string. */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const [embedding] = await generateEmbeddings([query]);
  return embedding;
}

// ---------------------------------------------------------------------------
// Embed a document — chunk text, generate embeddings, store in pgvector
// ---------------------------------------------------------------------------

export interface EmbedDocumentResult {
  documentId: string;
  chunksCreated: number;
  tokensUsed: number;
  durationMs: number;
}

export async function embedDocument(
  documentId: string,
  fullText: string,
  metadata?: { pages?: number },
): Promise<EmbedDocumentResult> {
  const start = Date.now();
  const pool = getPool();
  if (!pool) throw new Error("Database not available");

  // Mark as processing
  await pool.query(
    `UPDATE knowledge_documents SET embedding_status = 'processing' WHERE id = $1`,
    [documentId],
  );

  try {
    const chunks = chunkText(fullText);
    if (chunks.length === 0) {
      await pool.query(
        `UPDATE knowledge_documents SET embedding_status = 'skipped', embedded_at = NOW() WHERE id = $1`,
        [documentId],
      );
      return { documentId, chunksCreated: 0, tokensUsed: 0, durationMs: Date.now() - start };
    }

    // Generate embeddings
    const chunkTexts = chunks.map((c) => c.text);
    const embeddings = await generateEmbeddings(chunkTexts);

    // Delete any existing embeddings for this document (re-embed support)
    await pool.query(`DELETE FROM document_embeddings WHERE document_id = $1`, [documentId]);

    // Insert embeddings into document_embeddings (primary store)
    let tokensUsed = 0;
    const dualWriteItems: VectorItem[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      const tokenCount = Math.ceil(chunk.text.length / 4); // rough estimate
      tokensUsed += tokenCount;

      const embId = `emb-${documentId}-${i}`;
      const embeddingStr = `[${embedding.join(",")}]`;
      await pool.query(
        `INSERT INTO document_embeddings (id, document_id, chunk_index, chunk_text, page_number, section_title, embedding, token_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8)`,
        [
          embId,
          documentId,
          chunk.chunkIndex,
          chunk.text,
          chunk.page ?? null,
          chunk.section ?? null,
          embeddingStr,
          tokenCount,
        ],
      );

      dualWriteItems.push({
        id: embId,
        content: chunk.text,
        embedding,
        metadata: {
          document_id: documentId,
          chunk_index: chunk.chunkIndex,
          page_number: chunk.page ?? null,
          section_title: chunk.section ?? null,
          token_count: tokenCount,
        },
      });
    }

    // Dual-write to vector_embeddings (pgvector mirror) — fire-and-forget
    if (DUAL_WRITE_ENABLED && dualWriteItems.length > 0) {
      dualWriteToPgvector(DUAL_WRITE_COLLECTION, documentId, dualWriteItems);
    }

    // Update document status
    await pool.query(
      `UPDATE knowledge_documents SET embedding_status = 'completed', embedding_count = $2, embedded_at = NOW() WHERE id = $1`,
      [documentId, chunks.length],
    );

    log.info("document_embedded", { documentId, chunks: chunks.length, tokensUsed });

    return {
      documentId,
      chunksCreated: chunks.length,
      tokensUsed,
      durationMs: Date.now() - start,
    };
  } catch (e) {
    await pool.query(
      `UPDATE knowledge_documents SET embedding_status = 'failed' WHERE id = $1`,
      [documentId],
    ).catch(() => {});

    log.error("document_embed_failed", { documentId, error: (e as Error).message });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Embed all unembedded documents (bulk operation)
// ---------------------------------------------------------------------------

export async function embedAllDocuments(): Promise<{
  total: number;
  embedded: number;
  failed: number;
  skipped: number;
}> {
  const pool = getPool();
  if (!pool) throw new Error("Database not available");

  const { rows } = await pool.query(
    `SELECT id, title, doc_type, tags, metadata
     FROM knowledge_documents
     WHERE embedding_status IN ('pending', 'failed')
     ORDER BY created_at ASC`,
  );

  let embedded = 0;
  let failed = 0;
  let skipped = 0;

  for (const doc of rows) {
    try {
      // Build text from document metadata (title + tags + any stored content)
      const textParts: string[] = [doc.title];
      if (doc.doc_type) textParts.push(`Document type: ${doc.doc_type}`);
      if (doc.tags?.length) textParts.push(`Tags: ${doc.tags.join(", ")}`);

      const meta = doc.metadata ?? {};
      if (meta.summary) textParts.push(meta.summary);
      if (meta.description) textParts.push(meta.description);
      if (meta.content) textParts.push(meta.content);

      // Read linked file content if available (text-based files only)
      const TEXT_MIME_TYPES = new Set(["text/plain", "text/csv", "text/markdown"]);
      try {
        const fileResult = await pool.query(
          `SELECT uf.storage_key, uf.mime_type FROM uploaded_files uf
           JOIN knowledge_documents kd ON kd.file_id = uf.id
           WHERE kd.id = $1`,
          [doc.id],
        );
        if (fileResult.rows.length > 0) {
          const { storage_key, mime_type } = fileResult.rows[0];
          if (TEXT_MIME_TYPES.has(mime_type)) {
            const fs = await import("fs");
            const path = await import("path");
            const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
            const filePath = path.join(uploadDir, storage_key);
            if (fs.existsSync(filePath)) {
              const content = fs.readFileSync(filePath, "utf-8");
              if (content.trim().length > 0) {
                textParts.push(content);
              }
            }
          }
        }
      } catch {
        // File read failed — continue with metadata only
      }

      const fullText = textParts.join("\n\n");

      if (fullText.trim().length < 20) {
        await pool.query(
          `UPDATE knowledge_documents SET embedding_status = 'skipped', embedded_at = NOW() WHERE id = $1`,
          [doc.id],
        );
        skipped++;
        continue;
      }

      await embedDocument(doc.id, fullText);
      embedded++;
    } catch (e) {
      failed++;
      log.warn("embed_all_doc_failed", { id: doc.id, error: (e as Error).message });
    }
  }

  return { total: rows.length, embedded, failed, skipped };
}

// ---------------------------------------------------------------------------
// Vector similarity search — the core semantic search function
// ---------------------------------------------------------------------------

export interface VectorSearchResult {
  document_id: string;
  document_title: string;
  document_type: string;
  collection: string | null;
  chunk_text: string;
  chunk_index: number;
  page_number: number | null;
  section_title: string | null;
  similarity: number; // 0-1, higher = more similar
}

export async function vectorSearch(
  query: string,
  limit = 10,
  minSimilarity = 0.3,
): Promise<VectorSearchResult[]> {
  const pool = getPool();
  if (!pool) throw new Error("Database not available");

  // Check if we have any embeddings
  const countResult = await pool.query(`SELECT COUNT(*)::int AS cnt FROM document_embeddings`);
  if (countResult.rows[0].cnt === 0) {
    return [];
  }

  const queryEmbedding = await generateQueryEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  const { rows } = await pool.query(
    `SELECT
       de.document_id,
       kd.title AS document_title,
       kd.doc_type AS document_type,
       kd.collection_id AS collection,
       de.chunk_text,
       de.chunk_index,
       de.page_number,
       de.section_title,
       1 - (de.embedding <=> $1::vector) AS similarity
     FROM document_embeddings de
     JOIN knowledge_documents kd ON kd.id = de.document_id
     WHERE 1 - (de.embedding <=> $1::vector) >= $2
     ORDER BY de.embedding <=> $1::vector
     LIMIT $3`,
    [embeddingStr, minSimilarity, limit],
  );

  return rows;
}

// ---------------------------------------------------------------------------
// Get embedding stats for display
// ---------------------------------------------------------------------------

export interface EmbeddingStats {
  totalDocuments: number;
  embeddedDocuments: number;
  pendingDocuments: number;
  failedDocuments: number;
  totalChunks: number;
  embeddingAvailable: boolean;
}

export async function getEmbeddingStats(): Promise<EmbeddingStats> {
  const pool = getPool();
  if (!pool) {
    return {
      totalDocuments: 0, embeddedDocuments: 0, pendingDocuments: 0,
      failedDocuments: 0, totalChunks: 0, embeddingAvailable: isEmbeddingAvailable(),
    };
  }

  const docStats = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE embedding_status = 'completed')::int AS embedded,
      COUNT(*) FILTER (WHERE embedding_status IN ('pending', 'processing'))::int AS pending,
      COUNT(*) FILTER (WHERE embedding_status = 'failed')::int AS failed
    FROM knowledge_documents
  `);

  const chunkCount = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM document_embeddings`,
  );

  const stats = docStats.rows[0];
  return {
    totalDocuments: stats.total,
    embeddedDocuments: stats.embedded,
    pendingDocuments: stats.pending,
    failedDocuments: stats.failed,
    totalChunks: chunkCount.rows[0].cnt,
    embeddingAvailable: isEmbeddingAvailable(),
  };
}
