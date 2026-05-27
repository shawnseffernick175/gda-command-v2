// ---------------------------------------------------------------------------
// Universal Document Ingestion Gateway (F-038 Phase 2B)
// Single entry-point for all document uploads: magic-byte detection,
// extraction dispatch, chunking, embedding, status tracking.
// ---------------------------------------------------------------------------

import { getPool } from "./db";
import { log } from "./logger";
import { isExtractable, runExtractor, PLAIN_TEXT_MIMES } from "./extractors";
import { embedDocument } from "./embeddings";
import { resolveMimeType } from "./storage";

// ---------------------------------------------------------------------------
// Magic-byte MIME detection
// ---------------------------------------------------------------------------

interface FileTypeResult {
  ext: string;
  mime: string;
}

async function detectMime(buffer: Buffer, originalName: string): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fileType = require("file-type") as {
      fromBuffer: (buf: Buffer | Uint8Array) => Promise<FileTypeResult | undefined>;
    };
    const result = await fileType.fromBuffer(buffer);
    if (result) return result.mime;
  } catch {
    // file-type failed — fall through to extension-based
  }
  // Fallback: extension-based resolution (handles plain text, CSV, etc.)
  return resolveMimeType("application/octet-stream", originalName);
}

// ---------------------------------------------------------------------------
// Ingestion options & result
// ---------------------------------------------------------------------------

export interface IngestOptions {
  documentId: string;
  userId?: string;
  parentDocumentId?: string;
}

export interface IngestResult {
  documentId: string;
  detectedMime: string;
  extractionMethod: string;
  status: "processing" | "indexed" | "skipped" | "failed";
  statusReason: string | null;
  chunksCreated: number;
  textLength: number;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// ingestDocument — the universal gateway
// ---------------------------------------------------------------------------

export async function ingestDocument(
  buffer: Buffer,
  originalName: string,
  opts: IngestOptions,
): Promise<IngestResult> {
  const start = Date.now();
  const pool = getPool();
  const { documentId } = opts;

  // 1. Magic-byte detection
  const detectedMime = await detectMime(buffer, originalName);

  // 2. Check if extractable
  if (!isExtractable(detectedMime)) {
    const reason = `unsupported format: ${detectedMime}`;
    if (pool) {
      await pool.query(
        `UPDATE knowledge_documents
         SET status = 'skipped', status_reason = $2, extraction_method = NULL, updated_at = NOW()
         WHERE id = $1`,
        [documentId, reason],
      ).catch(() => {});
    }
    log.info("ingest_skipped", { documentId, mime: detectedMime, reason });
    return {
      documentId,
      detectedMime,
      extractionMethod: "none",
      status: "skipped",
      statusReason: reason,
      chunksCreated: 0,
      textLength: 0,
      durationMs: Date.now() - start,
    };
  }

  // 3. Mark as processing
  const extractionMethod = PLAIN_TEXT_MIMES.has(detectedMime) ? "native" : "native";
  if (pool) {
    await pool.query(
      `UPDATE knowledge_documents
       SET status = 'processing', extraction_method = $2, status_reason = NULL, updated_at = NOW()
       WHERE id = $1`,
      [documentId, extractionMethod],
    ).catch(() => {});
  }

  // 4. Extract text
  try {
    const result = await runExtractor(buffer, detectedMime);
    const text = result.text;

    if (!text || text.trim().length === 0) {
      const reason = "extraction returned empty text";
      if (pool) {
        await pool.query(
          `UPDATE knowledge_documents
           SET status = 'skipped', status_reason = $2, updated_at = NOW()
           WHERE id = $1`,
          [documentId, reason],
        ).catch(() => {});
      }
      log.warn("ingest_empty", { documentId, mime: detectedMime });
      return {
        documentId,
        detectedMime,
        extractionMethod,
        status: "skipped",
        statusReason: reason,
        chunksCreated: 0,
        textLength: 0,
        durationMs: Date.now() - start,
      };
    }

    // 5. Chunk + embed
    const embedResult = await embedDocument(documentId, text);
    if (pool) {
      await pool.query(
        `UPDATE knowledge_documents
         SET status = 'indexed', chunk_count = $2, status_reason = NULL, updated_at = NOW()
         WHERE id = $1`,
        [documentId, embedResult.chunksCreated],
      ).catch(() => {});
    }

    log.info("ingest_complete", {
      documentId,
      mime: detectedMime,
      textLen: text.length,
      chunks: embedResult.chunksCreated,
      ms: Date.now() - start,
    });

    return {
      documentId,
      detectedMime,
      extractionMethod,
      status: "indexed",
      statusReason: null,
      chunksCreated: embedResult.chunksCreated,
      textLength: text.length,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const reason = (err as Error).message || "extraction failed";
    if (pool) {
      await pool.query(
        `UPDATE knowledge_documents
         SET status = 'failed', status_reason = $2, updated_at = NOW()
         WHERE id = $1`,
        [documentId, reason.slice(0, 500)],
      ).catch(() => {});
    }
    log.error("ingest_failed", { documentId, mime: detectedMime, error: reason });
    return {
      documentId,
      detectedMime,
      extractionMethod,
      status: "failed",
      statusReason: reason,
      chunksCreated: 0,
      textLength: 0,
      durationMs: Date.now() - start,
    };
  }
}
