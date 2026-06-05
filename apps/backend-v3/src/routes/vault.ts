/**
 * Vault routes — document upload, AI parse on ingest, linkage, audit trail.
 *
 * Endpoints:
 *   GET    /v3/vault            — list documents with filters + pagination
 *   GET    /v3/vault/:id        — single document with audit trail
 *   POST   /v3/vault/upload     — multipart upload → extract → AI parse
 *   PATCH  /v3/vault/:id/link   — link to opportunity / capture / award
 *   GET    /v3/vault/:id/audit  — audit trail for a document
 *   DELETE /v3/vault/:id        — soft delete
 */

import type { FastifyInstance } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import { createWriteStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { llmRouter } from '../lib/llm-router.js';
import { logger } from '../lib/logger.js';

const UPLOAD_DIR = join(process.cwd(), 'data', 'vault');
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

const VALID_DOC_TYPES = [
  'contract', 'proposal', 'invoice', 'certificate',
  'teaming_agreement', 'rfp', 'other',
] as const;

type DocType = typeof VALID_DOC_TYPES[number];

interface VaultDocumentRow {
  id: number;
  filename: string;
  doc_type: string;
  file_size_bytes: string | null;
  file_path: string | null;
  extracted_text: string | null;
  ai_summary: string | null;
  ai_tags: string[] | null;
  ai_entities: { name: string; type: string; value: string }[] | null;
  linked_opportunity_id: number | null;
  linked_capture_id: number | null;
  linked_award_id: number | null;
  uploaded_by: string;
  uploaded_at: string;
  updated_at: string;
  deleted_at: string | null;
  // joined fields
  opp_title?: string | null;
  capture_title?: string | null;
  award_title?: string | null;
}

interface AuditRow {
  id: number;
  document_id: number;
  action: string;
  actor: string;
  detail: string | null;
  created_at: string;
}

async function extractTextFromBuffer(buf: Buffer, filename: string): Promise<string> {
  const ext = filename.toLowerCase().split('.').pop();

  if (ext === 'pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    const textResult = await parser.getText();
    return textResult.pages?.map(p => p.text).join('\n') ?? '';
  }

  if (ext === 'docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer: buf });
    return result.value;
  }

  if (ext === 'txt' || ext === 'csv') {
    return buf.toString('utf-8');
  }

  return '';
}

async function insertAudit(
  documentId: number,
  action: string,
  actor: string,
  detail: string | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO vault_audit_trail (document_id, action, actor, detail) VALUES ($1, $2, $3, $4)`,
    [documentId, action, actor, detail],
  );
}

export async function vaultRoutes(app: FastifyInstance): Promise<void> {
  await app.register(fastifyMultipart, {
    limits: { fileSize: MAX_FILE_SIZE },
  });

  mkdirSync(UPLOAD_DIR, { recursive: true });

  // GET /v3/vault — list documents
  app.get('/v3/vault', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const docType = query.doc_type;
    const search = query.q;
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const page = Math.max(Number(query.page) || 1, 1);
    const offset = (page - 1) * limit;

    const conditions: string[] = ['d.deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (docType && VALID_DOC_TYPES.includes(docType as DocType)) {
      conditions.push(`d.doc_type = $${idx++}`);
      params.push(docType);
    }

    if (search) {
      conditions.push(
        `(d.filename ILIKE $${idx} OR d.ai_summary ILIKE $${idx} OR d.ai_tags::text ILIKE $${idx})`,
      );
      params.push(`%${search}%`);
      idx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countSql = `SELECT COUNT(*)::int AS total FROM vault_documents d ${where}`;
    const countRes = await pool.query<{ total: number }>(countSql, params);
    const total = countRes.rows[0]?.total ?? 0;

    const dataSql = `
      SELECT d.*,
        o.title AS opp_title,
        cap.id AS capture_exists,
        (SELECT title FROM opportunities WHERE id = d.linked_capture_id LIMIT 1) AS capture_title,
        a_ref.awardee_name AS award_title
      FROM vault_documents d
      LEFT JOIN opportunities o ON o.id = d.linked_opportunity_id
      LEFT JOIN captures cap ON cap.id = d.linked_capture_id
      LEFT JOIN awards a_ref ON a_ref.id = d.linked_award_id
      ${where}
      ORDER BY d.uploaded_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    params.push(limit, offset);
    const dataRes = await pool.query<VaultDocumentRow>(dataSql, params);

    return reply.send(
      successEnvelope(
        {
          items: dataRes.rows,
          total,
          page,
          totalPages: Math.ceil(total / limit) || 1,
        },
        req.requestId,
      ),
    );
  });

  // GET /v3/vault/count
  app.get('/v3/vault/count', async (req, reply) => {
    const res = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM vault_documents WHERE deleted_at IS NULL`,
    );
    return reply.send(
      successEnvelope(
        { count: res.rows[0]?.count ?? 0 },
        req.requestId,
      ),
    );
  });

  // GET /v3/vault/:id — single document with audit trail
  app.get('/v3/vault/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const docRes = await pool.query<VaultDocumentRow>(
      `SELECT d.*,
        o.title AS opp_title,
        (SELECT title FROM opportunities WHERE id = d.linked_capture_id LIMIT 1) AS capture_title,
        a_ref.awardee_name AS award_title
      FROM vault_documents d
      LEFT JOIN opportunities o ON o.id = d.linked_opportunity_id
      LEFT JOIN awards a_ref ON a_ref.id = d.linked_award_id
      WHERE d.id = $1 AND d.deleted_at IS NULL`,
      [id],
    );

    if (!docRes.rows[0]) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Document not found', req.requestId),
      );
    }

    const auditRes = await pool.query<AuditRow>(
      `SELECT * FROM vault_audit_trail WHERE document_id = $1 ORDER BY created_at DESC`,
      [id],
    );

    await insertAudit(Number(id), 'viewed', 'admin', null);

    return reply.send(
      successEnvelope(
        { ...docRes.rows[0], audit_trail: auditRes.rows },
        req.requestId,
      ),
    );
  });

  // POST /v3/vault/upload — multipart file upload
  app.post('/v3/vault/upload', async (req, reply) => {
    const data = await req.file();
    if (!data) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'No file uploaded', req.requestId),
      );
    }

    const docTypeField = data.fields['doc_type'];
    const docType = docTypeField && 'value' in docTypeField
      ? (docTypeField as { value: string }).value
      : 'other';

    if (!VALID_DOC_TYPES.includes(docType as DocType)) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', `Invalid doc_type: ${docType}`, req.requestId),
      );
    }

    const filename = data.filename;
    const timestamp = Date.now();
    const storedName = `${timestamp}_${filename}`;
    const filePath = join(UPLOAD_DIR, storedName);

    const chunks: Buffer[] = [];
    const writeStream = createWriteStream(filePath);

    const fileStream = data.file;
    fileStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    await pipeline(fileStream, writeStream);

    const buf = Buffer.concat(chunks);
    const fileSizeBytes = buf.length;

    if (fileSizeBytes > MAX_FILE_SIZE) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'File exceeds 20MB limit', req.requestId),
      );
    }

    let extractedText = '';
    try {
      extractedText = await extractTextFromBuffer(buf, filename);
    } catch (err) {
      logger.warn({ err, filename }, 'Text extraction failed');
    }

    let aiSummary: string | null = null;
    let aiTags: string[] | null = null;
    let aiEntities: { name: string; type: string; value: string }[] | null = null;
    let docTypeConfirmed = docType;

    if (extractedText.length > 0) {
      try {
        const llmResult = await llmRouter.route({
          task: 'vault_document_parse',
          input: {
            doc_type: docType,
            filename,
            extracted_text: extractedText,
          },
        });

        if (llmResult.ok && llmResult.output) {
          aiSummary = llmResult.output.summary;
          aiTags = llmResult.output.tags;
          aiEntities = llmResult.output.entities;
          docTypeConfirmed = llmResult.output.doc_type_confirmed || docType;
        }
      } catch (err) {
        logger.warn({ err, filename }, 'AI parse failed — storing document without analysis');
      }
    }

    const insertRes = await pool.query<{ id: number }>(
      `INSERT INTO vault_documents
        (filename, doc_type, file_size_bytes, file_path, extracted_text, ai_summary, ai_tags, ai_entities, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        filename,
        docTypeConfirmed,
        fileSizeBytes,
        `vault/${storedName}`,
        extractedText || null,
        aiSummary,
        aiTags ? JSON.stringify(aiTags) : null,
        aiEntities ? JSON.stringify(aiEntities) : null,
        'admin',
      ],
    );

    const docId = insertRes.rows[0]!.id;
    await insertAudit(docId, 'uploaded', 'admin', `File: ${filename} (${fileSizeBytes} bytes)`);

    if (aiSummary) {
      await insertAudit(docId, 'ai_parsed', 'system', 'AI analysis completed on ingest');
    }

    const created = await pool.query<VaultDocumentRow>(
      `SELECT * FROM vault_documents WHERE id = $1`,
      [docId],
    );

    return reply.status(201).send(
      successEnvelope(created.rows[0], req.requestId),
    );
  });

  // PATCH /v3/vault/:id/link — link to opportunity/capture/award
  app.patch('/v3/vault/:id/link', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      opportunity_id?: number;
      capture_id?: number;
      award_id?: number;
    };

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (body.opportunity_id !== undefined) {
      sets.push(`linked_opportunity_id = $${idx++}`);
      params.push(body.opportunity_id);
    }
    if (body.capture_id !== undefined) {
      sets.push(`linked_capture_id = $${idx++}`);
      params.push(body.capture_id);
    }
    if (body.award_id !== undefined) {
      sets.push(`linked_award_id = $${idx++}`);
      params.push(body.award_id);
    }

    if (sets.length === 0) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'No link fields provided', req.requestId),
      );
    }

    sets.push(`updated_at = NOW()`);
    const sql = `UPDATE vault_documents SET ${sets.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL RETURNING *`;
    params.push(id);

    const res = await pool.query<VaultDocumentRow>(sql, params);
    if (!res.rows[0]) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Document not found', req.requestId),
      );
    }

    const details: string[] = [];
    if (body.opportunity_id !== undefined) details.push(`opportunity_id=${body.opportunity_id}`);
    if (body.capture_id !== undefined) details.push(`capture_id=${body.capture_id}`);
    if (body.award_id !== undefined) details.push(`award_id=${body.award_id}`);
    await insertAudit(Number(id), 'linked', 'admin', details.join(', '));

    return reply.send(
      successEnvelope(res.rows[0], req.requestId),
    );
  });

  // GET /v3/vault/:id/audit — audit trail
  app.get('/v3/vault/:id/audit', async (req, reply) => {
    const { id } = req.params as { id: string };
    const res = await pool.query<AuditRow>(
      `SELECT * FROM vault_audit_trail WHERE document_id = $1 ORDER BY created_at DESC`,
      [id],
    );
    return reply.send(
      successEnvelope(res.rows, req.requestId),
    );
  });

  // DELETE /v3/vault/:id — soft delete
  app.delete('/v3/vault/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const res = await pool.query<VaultDocumentRow>(
      `UPDATE vault_documents SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id],
    );

    if (!res.rows[0]) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Document not found', req.requestId),
      );
    }

    await insertAudit(Number(id), 'deleted', 'admin', null);

    return reply.send(
      successEnvelope({ deleted: true }, req.requestId),
    );
  });
}
