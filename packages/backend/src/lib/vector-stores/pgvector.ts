// ---------------------------------------------------------------------------
// pgvector operations for the document_embeddings table.
// Phase 2C — n8n workflows use these via /api/internal/vector-* endpoints.
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

export interface VectorQueryResult {
  id: string;
  document_id: string | null;
  chunk_index: number;
  chunk_text: string;
  page_number: number | null;
  section_title: string | null;
  similarity: number;
  metadata: Record<string, unknown>;
}

export interface VectorFetchResult {
  id: string;
  document_id: string | null;
  chunk_index: number;
  chunk_text: string;
  page_number: number | null;
  section_title: string | null;
  metadata: Record<string, unknown>;
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

// ---------------------------------------------------------------------------
// queryEmbeddings — cosine similarity search
// ---------------------------------------------------------------------------

export async function queryEmbeddings(
  collection: string,
  queryEmbedding: number[],
  topK: number,
  filter?: Record<string, unknown>,
): Promise<VectorQueryResult[]> {
  const pool = getPool();
  if (!pool) throw new Error("Database not available");

  const clampedK = Math.max(1, Math.min(50, topK));
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  let sql = `SELECT id, document_id, chunk_index, chunk_text, page_number, section_title,
       (1 - (embedding <=> $1::vector)) AS similarity, metadata
     FROM document_embeddings
     WHERE collection = $2`;
  const params: unknown[] = [embeddingStr, collection];

  if (filter && Object.keys(filter).length > 0) {
    params.push(JSON.stringify(filter));
    sql += ` AND metadata @> $${params.length}::jsonb`;
  }

  sql += ` ORDER BY embedding <=> $1::vector LIMIT $${params.length + 1}`;
  params.push(clampedK);

  const result = await pool.query(sql, params);

  return result.rows.map((row) => ({
    id: row.id,
    document_id: row.document_id,
    chunk_index: row.chunk_index ?? 0,
    chunk_text: row.chunk_text ?? "",
    page_number: row.page_number,
    section_title: row.section_title,
    similarity: parseFloat(row.similarity),
    metadata: row.metadata ?? {},
  }));
}

// ---------------------------------------------------------------------------
// fetchEmbeddingsById — fetch specific vectors by id array
// ---------------------------------------------------------------------------

export async function fetchEmbeddingsById(
  ids: string[],
): Promise<VectorFetchResult[]> {
  const pool = getPool();
  if (!pool) throw new Error("Database not available");

  if (ids.length === 0) return [];

  const result = await pool.query(
    `SELECT id, document_id, chunk_index, chunk_text, page_number, section_title, metadata
     FROM document_embeddings WHERE id = ANY($1)
     ORDER BY chunk_index ASC`,
    [ids],
  );

  return result.rows.map((row) => ({
    id: row.id,
    document_id: row.document_id,
    chunk_index: row.chunk_index ?? 0,
    chunk_text: row.chunk_text ?? "",
    page_number: row.page_number,
    section_title: row.section_title,
    metadata: row.metadata ?? {},
  }));
}

// ---------------------------------------------------------------------------
// listEmbeddingsByDocument — list all vector ids for a document in a collection
// ---------------------------------------------------------------------------

export async function listEmbeddingsByDocument(
  collection: string,
  documentId: string,
): Promise<{ id: string; chunk_index: number }[]> {
  const pool = getPool();
  if (!pool) throw new Error("Database not available");

  const result = await pool.query(
    `SELECT id, chunk_index FROM document_embeddings
     WHERE collection = $1 AND document_id = $2
     ORDER BY chunk_index ASC`,
    [collection, documentId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    chunk_index: row.chunk_index ?? 0,
  }));
}
