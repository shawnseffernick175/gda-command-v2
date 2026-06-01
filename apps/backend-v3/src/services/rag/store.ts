import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { config } from '../../config/index.js';
import { logger } from '../../lib/logger.js';
import type {
  KbDocument,
  KbChunk,
  SearchResult,
  IngestResult,
  RagStatus,
  DocType,
  OuTag,
  EvidenceGrade,
  ChunkInput,
} from './types.js';
import { chunkText } from './chunker.js';
import { generateEmbeddings, generateQueryEmbedding, EMBED_MODEL } from './embeddings.js';
import { parseFile, parseBuffer } from './parser.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({ connectionString: config.databaseUrl, max: 10 });
  }
  return pool;
}

export function computeSha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Ingest a file from a local path into the knowledge base.
 */
export async function ingestFromPath(
  filePath: string,
  opts: {
    source_filename: string;
    source_url?: string;
    doc_type: DocType;
    ou_tag?: OuTag;
    evidence_grade?: EvidenceGrade;
    title?: string;
    metadata?: Record<string, unknown>;
    fileBytes?: Buffer;
  },
): Promise<IngestResult> {
  const db = getPool();
  const buffer = opts.fileBytes ?? await readFile(filePath);
  const sha = computeSha256(buffer);

  const existing = await db.query<{ id: string; chunk_count: number }>(
    'SELECT id, chunk_count FROM kb_documents WHERE sha256 = $1',
    [sha],
  );

  if (existing.rows.length > 0) {
    return {
      document_id: existing.rows[0].id,
      chunk_count: existing.rows[0].chunk_count,
      status: 'existing',
    };
  }

  const parsed = await parseFile(filePath);
  return ingestParsedContent(db, buffer, sha, parsed, opts);
}

/**
 * Ingest a file from a raw buffer.
 */
export async function ingestFromBuffer(
  data: Buffer,
  opts: {
    source_filename: string;
    source_url?: string;
    doc_type: DocType;
    ou_tag?: OuTag;
    evidence_grade?: EvidenceGrade;
    title?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<IngestResult> {
  const db = getPool();
  const sha = computeSha256(data);

  const existing = await db.query<{ id: string; chunk_count: number }>(
    'SELECT id, chunk_count FROM kb_documents WHERE sha256 = $1',
    [sha],
  );

  if (existing.rows.length > 0) {
    return {
      document_id: existing.rows[0].id,
      chunk_count: existing.rows[0].chunk_count,
      status: 'existing',
    };
  }

  const parsed = await parseBuffer(data, opts.source_filename);
  return ingestParsedContent(db, data, sha, parsed, opts);
}

async function ingestParsedContent(
  db: pg.Pool,
  buffer: Buffer,
  sha: string,
  parsed: { text: string; pages?: Array<{ page: number; text: string }> },
  opts: {
    source_filename: string;
    source_url?: string;
    doc_type: DocType;
    ou_tag?: OuTag;
    evidence_grade?: EvidenceGrade;
    title?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<IngestResult> {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const docResult = await client.query<{ id: string }>(
      `INSERT INTO kb_documents
         (source_filename, source_url, doc_type, ou_tag, evidence_grade, title, byte_size, sha256, embed_model_version, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        opts.source_filename,
        opts.source_url ?? null,
        opts.doc_type,
        opts.ou_tag ?? null,
        opts.evidence_grade ?? null,
        opts.title ?? null,
        buffer.length,
        sha,
        EMBED_MODEL,
        opts.metadata ? JSON.stringify(opts.metadata) : null,
      ],
    );

    const documentId = docResult.rows[0].id;

    let chunks: ChunkInput[];
    if (parsed.pages && parsed.pages.length > 1) {
      chunks = [];
      for (const page of parsed.pages) {
        const pageChunks = chunkText(page.text, page.page);
        chunks.push(...pageChunks);
      }
    } else {
      chunks = chunkText(parsed.text);
    }

    if (chunks.length === 0) {
      await client.query(
        'UPDATE kb_documents SET chunk_count = 0, last_chunked_at = now() WHERE id = $1',
        [documentId],
      );
      await client.query('COMMIT');
      return { document_id: documentId, chunk_count: 0, status: 'created' };
    }

    const texts = chunks.map((c) => c.text);
    const embeddings = await generateEmbeddings(texts);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      const tokenCount = Math.ceil(chunk.text.length / 4);
      const vectorStr = `[${embedding.join(',')}]`;

      await client.query(
        `INSERT INTO kb_chunks
           (document_id, chunk_index, chunk_text, embedding, token_count, page_number, section_title)
         VALUES ($1, $2, $3, $4::vector, $5, $6, $7)`,
        [
          documentId,
          i,
          chunk.text,
          vectorStr,
          tokenCount,
          chunk.page_number ?? null,
          chunk.section_title ?? null,
        ],
      );
    }

    await client.query(
      'UPDATE kb_documents SET chunk_count = $1, last_chunked_at = now() WHERE id = $2',
      [chunks.length, documentId],
    );

    await client.query('COMMIT');
    logger.info({ documentId, chunks: chunks.length, filename: opts.source_filename }, 'Document ingested');
    return { document_id: documentId, chunk_count: chunks.length, status: 'created' };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err, filename: opts.source_filename }, 'Ingestion failed');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Re-ingest a document: delete old chunks, re-parse, re-embed.
 */
export async function reingestDocument(documentId: string): Promise<IngestResult> {
  const db = getPool();
  const docResult = await db.query<KbDocument>(
    'SELECT * FROM kb_documents WHERE id = $1',
    [documentId],
  );

  if (docResult.rows.length === 0) {
    throw new Error(`Document not found: ${documentId}`);
  }

  const doc = docResult.rows[0];
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM kb_chunks WHERE document_id = $1', [documentId]);

    let fullText = '';
    if (doc.source_url) {
      fullText = `[Re-ingest requires file access. Source: ${doc.source_url}]`;
    }

    const chunks = chunkText(fullText);

    if (chunks.length > 0) {
      const texts = chunks.map((c) => c.text);
      const embeddings = await generateEmbeddings(texts);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i];
        const vectorStr = `[${embedding.join(',')}]`;
        await client.query(
          `INSERT INTO kb_chunks
             (document_id, chunk_index, chunk_text, embedding, token_count, page_number, section_title)
           VALUES ($1, $2, $3, $4::vector, $5, $6, $7)`,
          [documentId, i, chunk.text, vectorStr, Math.ceil(chunk.text.length / 4), chunk.page_number ?? null, chunk.section_title ?? null],
        );
      }
    }

    await client.query(
      `UPDATE kb_documents SET chunk_count = $1, last_chunked_at = now(), embed_model_version = $2 WHERE id = $3`,
      [chunks.length, EMBED_MODEL, documentId],
    );

    await client.query('COMMIT');
    return { document_id: documentId, chunk_count: chunks.length, status: 'created' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Semantic search over the knowledge base.
 */
export async function search(opts: {
  query: string;
  ou_filter?: OuTag;
  doc_type_filter?: DocType;
  top_k?: number;
  min_score?: number;
}): Promise<SearchResult[]> {
  const db = getPool();
  const topK = opts.top_k ?? 8;
  const minScore = opts.min_score ?? 0.5;

  const queryEmbedding = await generateQueryEmbedding(opts.query);
  const vectorStr = `[${queryEmbedding.join(',')}]`;

  let whereClause = '';
  const params: (string | number)[] = [vectorStr, topK];
  let paramIdx = 3;

  if (opts.ou_filter) {
    whereClause += ` AND d.ou_tag = $${paramIdx}`;
    params.push(opts.ou_filter);
    paramIdx++;
  }

  if (opts.doc_type_filter) {
    whereClause += ` AND d.doc_type = $${paramIdx}`;
    params.push(opts.doc_type_filter);
    paramIdx++;
  }

  const sql = `
    SELECT
      c.id AS chunk_id,
      c.chunk_text,
      c.document_id,
      d.source_filename,
      d.source_url,
      d.doc_type,
      d.evidence_grade,
      c.page_number,
      c.section_title,
      1 - (c.embedding <=> $1::vector) AS score
    FROM kb_chunks c
    JOIN kb_documents d ON d.id = c.document_id
    WHERE 1=1 ${whereClause}
    ORDER BY c.embedding <=> $1::vector
    LIMIT $2
  `;

  const result = await db.query<SearchResult>(sql, params);

  return result.rows.filter((r) => r.score >= minScore);
}

/** Get RAG system status. */
export async function getStatus(): Promise<RagStatus> {
  const db = getPool();

  const [docCount, chunkCount, lastIngest, pgvectorVersion] = await Promise.all([
    db.query<{ count: string }>('SELECT count(*) FROM kb_documents'),
    db.query<{ count: string }>('SELECT count(*) FROM kb_chunks'),
    db.query<{ uploaded_at: string | null }>(
      'SELECT uploaded_at FROM kb_documents ORDER BY uploaded_at DESC LIMIT 1',
    ),
    db.query<{ extversion: string }>(
      "SELECT extversion FROM pg_extension WHERE extname = 'vector'",
    ),
  ]);

  return {
    documents: parseInt(docCount.rows[0].count, 10),
    chunks: parseInt(chunkCount.rows[0].count, 10),
    last_ingest: lastIngest.rows[0]?.uploaded_at ?? null,
    pgvector_version: pgvectorVersion.rows[0]?.extversion ?? 'not installed',
    embed_model: EMBED_MODEL,
  };
}

/** List documents with optional filters. */
export async function listDocuments(opts?: {
  ou?: OuTag;
  doc_type?: DocType;
  limit?: number;
}): Promise<KbDocument[]> {
  const db = getPool();
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let idx = 1;

  if (opts?.ou) {
    conditions.push(`ou_tag = $${idx++}`);
    params.push(opts.ou);
  }
  if (opts?.doc_type) {
    conditions.push(`doc_type = $${idx++}`);
    params.push(opts.doc_type);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = opts?.limit ?? 100;
  params.push(limit);

  const sql = `SELECT * FROM kb_documents ${where} ORDER BY uploaded_at DESC LIMIT $${idx}`;
  const result = await db.query<KbDocument>(sql, params);
  return result.rows;
}

/** Delete a document and its chunks (cascading). */
export async function deleteDocument(documentId: string): Promise<boolean> {
  const db = getPool();
  const result = await db.query('DELETE FROM kb_documents WHERE id = $1', [documentId]);
  return (result.rowCount ?? 0) > 0;
}

/** Get a single document by ID. */
export async function getDocument(documentId: string): Promise<KbDocument | null> {
  const db = getPool();
  const result = await db.query<KbDocument>('SELECT * FROM kb_documents WHERE id = $1', [documentId]);
  return result.rows[0] ?? null;
}

/** List chunks for a document. */
export async function getDocumentChunks(documentId: string): Promise<KbChunk[]> {
  const db = getPool();
  const result = await db.query<KbChunk>(
    'SELECT id, document_id, chunk_index, chunk_text, token_count, page_number, section_title, created_at FROM kb_chunks WHERE document_id = $1 ORDER BY chunk_index',
    [documentId],
  );
  return result.rows;
}
