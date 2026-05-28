// ---------------------------------------------------------------------------
// Universal Document Ingestion Gateway (F-038 Phase 2B)
// Single entry-point for all document uploads: magic-byte detection,
// extraction dispatch, chunking, embedding, status tracking.
// ---------------------------------------------------------------------------

import crypto from "crypto";
import { getPool } from "./db";
import { log } from "./logger";
import { isExtractable, runExtractor, PLAIN_TEXT_MIMES } from "./extractors";
import { embedDocument } from "./embeddings";
import { resolveMimeType, saveFile, generateStorageKey, deleteFile } from "./storage";

const MAX_RECURSION_DEPTH = 3;

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
  depth?: number;
  collectionId?: string;
  tags?: string[];
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
  childrenCreated?: number;
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
  const depth = opts.depth ?? 0;

  // Depth guard
  if (depth > MAX_RECURSION_DEPTH) {
    const reason = "recursion depth exceeded";
    if (pool) {
      await pool.query(
        `UPDATE knowledge_documents
         SET status = 'skipped', status_reason = $2, extraction_method = NULL, updated_at = NOW()
         WHERE id = $1`,
        [documentId, reason],
      ).catch(() => {});
    }
    log.warn("ingest_depth_exceeded", { documentId, depth });
    return {
      documentId,
      detectedMime: "unknown",
      extractionMethod: "none",
      status: "skipped",
      statusReason: reason,
      chunksCreated: 0,
      textLength: 0,
      durationMs: Date.now() - start,
    };
  }

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
  let extractionMethod = "native";
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

    // Honor extractor-provided extraction_method (e.g. 'ocr' from pdf/image)
    if (result.metadata.extraction_method && typeof result.metadata.extraction_method === "string") {
      extractionMethod = result.metadata.extraction_method;
      if (pool) {
        await pool.query(
          `UPDATE knowledge_documents SET extraction_method = $2, updated_at = NOW() WHERE id = $1`,
          [documentId, extractionMethod],
        ).catch(() => {});
      }
    }

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

    // 6. Process children (email attachments, etc.) — fire-and-forget
    let childrenCreated = 0;
    if (result.children && result.children.length > 0 && pool) {
      childrenCreated = await processChildren(
        result.children,
        documentId,
        opts,
        depth,
      );
    }

    log.info("ingest_complete", {
      documentId,
      mime: detectedMime,
      textLen: text.length,
      chunks: embedResult.chunksCreated,
      childrenCreated,
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
      childrenCreated,
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

// ---------------------------------------------------------------------------
// Child document processing (email attachments, archive members)
// ---------------------------------------------------------------------------

async function processChildren(
  children: { name: string; buffer: Buffer; mimeType: string }[],
  parentDocumentId: string,
  parentOpts: IngestOptions,
  parentDepth: number,
): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;

  let created = 0;
  const collectionId = parentOpts.collectionId ?? "col-contracts";
  const tags = parentOpts.tags ?? [];

  for (const child of children) {
    const childDocId = `doc-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const childFileId = `file-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const storageKey = generateStorageKey(child.name);
    let fileSaved = false;

    try {
      // Persist child file to disk
      saveFile(storageKey, child.buffer);
      fileSaved = true;

      // Transactional insert: uploaded_files + knowledge_documents
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        await client.query(
          `INSERT INTO uploaded_files (id, original_name, storage_key, mime_type, size_bytes, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [childFileId, child.name, storageKey, child.mimeType, child.buffer.length, parentOpts.userId ?? null],
        );

        await client.query(
          `INSERT INTO knowledge_documents
             (id, collection_id, title, doc_type, file_name, file_size_bytes, page_count, chunk_count,
              status, tags, metadata, file_id, parent_document_id, created_at, updated_at)
           VALUES ($1, $2, $3, 'attachment', $4, $5, 0, 0, 'pending', $6, $7, $8, $9, NOW(), NOW())`,
          [
            childDocId,
            collectionId,
            child.name.replace(/\.[^.]+$/, ""),
            child.name,
            child.buffer.length,
            tags,
            JSON.stringify({ mime_type: child.mimeType, storage_key: storageKey, parent_file: parentDocumentId }),
            childFileId,
            parentDocumentId,
          ],
        );

        await client.query("COMMIT");
      } catch (txErr) {
        await client.query("ROLLBACK");
        throw txErr;
      } finally {
        client.release();
      }

      created++;

      // Fire-and-forget: ingest the child document
      ingestDocument(child.buffer, child.name, {
        documentId: childDocId,
        userId: parentOpts.userId,
        parentDocumentId,
        depth: parentDepth + 1,
        collectionId,
        tags,
      }).catch((err) => {
        log.error("ingest_child_error", {
          parentId: parentDocumentId,
          childId: childDocId,
          error: (err as Error).message,
        });
      });

      log.info("ingest_child_created", {
        parentId: parentDocumentId,
        childId: childDocId,
        depth: parentDepth + 1,
      });
    } catch (err) {
      // Clean up orphaned file on disk if DB transaction failed
      if (fileSaved) {
        try { deleteFile(storageKey); } catch (delErr) { log.warn("ingest_child_cleanup_error", { error: String(delErr) }); }
      }
      log.error("ingest_child_create_error", {
        parentId: parentDocumentId,
        childName: child.name,
        error: (err as Error).message,
      });
    }
  }

  return created;
}
