// ---------------------------------------------------------------------------
// pgvector write operations for the document_embeddings table.
// Phase 2C — n8n writer workflows call these via /api/internal/vector-upsert.
// NO read functions (PR 2 adds those).
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
// Maps incoming VectorItem fields into document_embeddings columns.
// ---------------------------------------------------------------------------

export async function upsertEmbeddings(
  collection: string,
  items: VectorItem[],
): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("Database not available");

  for (const item of items) {
    const embeddingStr = `[${item.embedding.join(",")}]`;
    const meta = item.metadata ?? {};
    const documentId = (meta.document_id as string) ?? null;
    const chunkIndex =
      typeof meta.chunk_index === "number" ? meta.chunk_index : 0;
    const pageNumber =
      typeof meta.page_number === "number" ? meta.page_number : null;
    const sectionTitle =
      typeof meta.section_title === "string" ? meta.section_title : null;
    const tokenCount =
      typeof meta.token_count === "number" ? meta.token_count : null;

    // Build remaining metadata (strip fields that have dedicated columns)
    const remaining = { ...meta };
    delete remaining.document_id;
    delete remaining.chunk_index;
    delete remaining.page_number;
    delete remaining.section_title;
    delete remaining.token_count;

    await pool.query(
      `INSERT INTO document_embeddings
         (id, document_id, chunk_index, chunk_text, page_number, section_title,
          embedding, token_count, collection, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         document_id = EXCLUDED.document_id,
         chunk_index = EXCLUDED.chunk_index,
         chunk_text = EXCLUDED.chunk_text,
         page_number = EXCLUDED.page_number,
         section_title = EXCLUDED.section_title,
         embedding = EXCLUDED.embedding,
         token_count = EXCLUDED.token_count,
         collection = EXCLUDED.collection,
         metadata = EXCLUDED.metadata`,
      [
        item.id,
        documentId,
        chunkIndex,
        item.content ?? "",
        pageNumber,
        sectionTitle,
        embeddingStr,
        tokenCount,
        collection,
        JSON.stringify(remaining),
      ],
    );
  }

  log.info("pgvector_upsert", { collection, count: items.length });
}

// ---------------------------------------------------------------------------
// deleteEmbeddings — delete by ids
// ---------------------------------------------------------------------------

export async function deleteEmbeddings(ids: string[]): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("Database not available");

  if (ids.length === 0) return;

  await pool.query(
    `DELETE FROM document_embeddings WHERE id = ANY($1)`,
    [ids],
  );

  log.info("pgvector_delete", { count: ids.length });
}

// ---------------------------------------------------------------------------
// deleteByDocumentId — delete all vectors for a document
// ---------------------------------------------------------------------------

export async function deleteByDocumentId(
  documentId: string,
): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("Database not available");

  const result = await pool.query(
    `DELETE FROM document_embeddings WHERE document_id = $1`,
    [documentId],
  );

  log.info("pgvector_delete_by_document", {
    documentId,
    deleted: result.rowCount,
  });
}
