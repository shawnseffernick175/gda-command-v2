// ---------------------------------------------------------------------------
// pgvector write operations for the vector_embeddings table.
// Phase 2C — dual-write scaffolding. NO read functions (PR 2 adds those).
// ---------------------------------------------------------------------------

import { getPool } from "../db";
import { log } from "../logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VectorItem {
  id: string;
  content?: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// upsertEmbeddings — INSERT ... ON CONFLICT (id) DO UPDATE
// ---------------------------------------------------------------------------

export async function upsertEmbeddings(
  collection: string,
  items: VectorItem[],
): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("Database not available");

  for (const item of items) {
    const embeddingStr = `[${item.embedding.join(",")}]`;
    const documentId =
      (item.metadata?.document_id as string) ?? null;

    await pool.query(
      `INSERT INTO vector_embeddings (id, collection, document_id, content, embedding, metadata, updated_at)
       VALUES ($1, $2, $3, $4, $5::vector, $6, NOW())
       ON CONFLICT (id) DO UPDATE SET
         collection = EXCLUDED.collection,
         document_id = EXCLUDED.document_id,
         content = EXCLUDED.content,
         embedding = EXCLUDED.embedding,
         metadata = EXCLUDED.metadata,
         updated_at = NOW()`,
      [
        item.id,
        collection,
        documentId,
        item.content ?? null,
        embeddingStr,
        JSON.stringify(item.metadata ?? {}),
      ],
    );
  }

  log.info("pgvector_upsert", { collection, count: items.length });
}

// ---------------------------------------------------------------------------
// deleteEmbeddings — delete by collection + ids
// ---------------------------------------------------------------------------

export async function deleteEmbeddings(
  collection: string,
  ids: string[],
): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("Database not available");

  if (ids.length === 0) return;

  await pool.query(
    `DELETE FROM vector_embeddings WHERE collection = $1 AND id = ANY($2)`,
    [collection, ids],
  );

  log.info("pgvector_delete", { collection, count: ids.length });
}

// ---------------------------------------------------------------------------
// deleteByDocumentId — delete all vectors for a document in a collection
// ---------------------------------------------------------------------------

export async function deleteByDocumentId(
  collection: string,
  documentId: string,
): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("Database not available");

  const result = await pool.query(
    `DELETE FROM vector_embeddings WHERE collection = $1 AND document_id = $2`,
    [collection, documentId],
  );

  log.info("pgvector_delete_by_document", {
    collection,
    documentId,
    deleted: result.rowCount,
  });
}

// ---------------------------------------------------------------------------
// logDualWriteError — record a pgvector write failure
// ---------------------------------------------------------------------------

export async function logDualWriteError(
  collection: string | null,
  documentId: string | null,
  errorMessage: string,
): Promise<void> {
  try {
    const pool = getPool();
    if (!pool) return;

    await pool.query(
      `INSERT INTO dual_write_errors (collection, document_id, error_message)
       VALUES ($1, $2, $3)`,
      [collection, documentId, errorMessage],
    );
  } catch {
    // Best-effort logging — don't throw if the error table itself fails
    log.error("dual_write_error_log_failed", {
      collection,
      documentId,
      originalError: errorMessage,
    });
  }
}
