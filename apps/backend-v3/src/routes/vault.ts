/**
 * Vault routes — document upload, AI parse + smart ingest router,
 * full-text search, regulatory catalog, in-browser reader, linkage, audit.
 *
 * Endpoints:
 *   GET    /v3/vault                  — list documents (FTS when q provided)
 *   GET    /v3/vault/count            — total document count
 *   GET    /v3/vault/:id              — single document with audit trail
 *   GET    /v3/vault/:id/text         — extracted text for in-browser reading
 *   POST   /v3/vault/upload           — multipart upload → extract → AI parse → smart route
 *   PATCH  /v3/vault/:id/link         — link to opportunity / capture / award
 *   GET    /v3/vault/:id/audit        — audit trail for a document
 *   DELETE /v3/vault/:id              — soft delete (blocked for system docs)
 *   GET    /v3/vault/regulatory/catalog — regulatory reference catalog
 *   GET    /v3/vault/regulatory/search — search regulatory catalog + docs
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
import { ingestFinancialRows } from '../services/financials/ingest.js';
import { extractVehicleFromVaultDoc } from '../services/vehicles/vault-extract.js';

const UPLOAD_DIR = join(process.cwd(), 'data', 'vault');
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export const VAULT_BUCKETS = [
  'bid_protest', 'capability_statement', 'certificate', 'color_review',
  'contract', 'correspondence', 'financial', 'market_research',
  'past_performance', 'personnel', 'policy_regulatory', 'proposal',
  'rfp', 'subcontract_teaming', 'technical_artifact', 'training_material',
  'other',
] as const;
export type VaultBucket = typeof VAULT_BUCKETS[number];

const VALID_DOC_TYPES = VAULT_BUCKETS;
type DocType = VaultBucket;

interface VaultDocumentRow {
  id: number;
  filename: string;
  doc_type: string;
  doc_category: string;
  is_system_doc: boolean;
  file_size_bytes: string | null;
  file_path: string | null;
  extracted_text: string | null;
  ai_summary: string | null;
  ai_tags: string[] | null;
  ai_entities: { name: string; type: string; value: string }[] | null;
  regulatory_citation: string | null;
  effective_date: string | null;
  applicable_naics: string[] | null;
  linked_opportunity_id: number | null;
  linked_capture_id: number | null;
  linked_award_id: number | null;
  uploaded_by: string;
  uploaded_at: string;
  updated_at: string;
  deleted_at: string | null;
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

interface RegulatoryCatalogRow {
  id: number;
  citation: string;
  title: string;
  category: string;
  summary: string | null;
  url: string | null;
  effective_date: string | null;
  ndaa_year: number | null;
  eo_number: string | null;
  gao_docket: string | null;
  applies_to: string[] | null;
  key_clauses: { clause: string; topic: string }[] | null;
  is_active: boolean;
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

  if (ext === 'xlsx') {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf as unknown as ArrayBuffer);
    const blocks: string[] = [];
    let total = 0;
    const MAX = 200_000;
    for (const sheet of workbook.worksheets) {
      if (total >= MAX) break;
      const lines: string[] = [`## Sheet: ${sheet.name}`];
      sheet.eachRow({ includeEmpty: false }, (row) => {
        const values = Array.isArray(row.values) ? row.values.slice(1) : [];
        const cells = values.map((v) => {
          if (v === null || v === undefined) return '';
          if (typeof v === 'object') {
            const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
            if (typeof o.text === 'string') return o.text;
            if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join('');
            if (o.result !== undefined && o.result !== null) return String(o.result);
            return '';
          }
          return String(v);
        });
        if (cells.some((c) => c.trim().length > 0)) {
          lines.push(cells.join(' | '));
        }
      });
      const block = lines.join('\n');
      blocks.push(block);
      total += block.length;
    }
    return blocks.join('\n\n').slice(0, MAX);
  }

  if (ext === 'zip') {
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(buf);
    const allowed = new Set(['pdf', 'xlsx', 'csv', 'txt', 'docx']);
    const parts: string[] = [];
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const entryName = entry.entryName;
      if (entryName.startsWith('__MACOSX')) continue;
      const entryExt = entryName.toLowerCase().split('.').pop();
      if (!entryExt || !allowed.has(entryExt)) continue;
      try {
        const inner = await extractTextFromBuffer(entry.getData(), entryName);
        if (inner.trim().length > 0) {
          parts.push(`## File: ${entryName}\n${inner}`);
        }
      } catch {
        /* skip unreadable entry */
      }
    }
    return parts.join('\n\n').slice(0, 200_000);
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

function extractRegCitations(text: string): string[] {
  const patterns = [
    /FAR\s+\d+\.\d+/gi,
    /DFARS\s+\d+\.\d+[-\d]*/gi,
    /10\s+U\.S\.C\.\s*§?\s*\d+/gi,
    /NDAA\s+(FY\s*)?\d{4}/gi,
    /Executive\s+Order\s+\d+/gi,
    /EO\s+\d{5}/gi,
    /NIST\s+SP\s+800-\d+/gi,
  ];
  const found = new Set<string>();
  for (const p of patterns) {
    const matches = text.match(p);
    if (matches) matches.forEach(m => found.add(m.trim()));
  }
  return [...found];
}

async function smartIngestRouter(
  docId: number,
  filename: string,
  extractedText: string | null,
  aiSummary: string | null,
  userSuppliedBucket = false,
): Promise<{ linked_opportunity_id: number | null; linked_capture_id: number | null; routing_rationale: string | null }> {
  const searchText = extractedText?.slice(0, 500) ?? filename;

  let opps: { id: number; title: string; agency: string }[] = [];
  let captures: { id: number; title: string }[] = [];

  try {
    const oppRes = await pool.query<{ id: number; title: string; agency: string }>(
      `SELECT id, title, agency FROM opportunities
       WHERE to_tsvector('english', coalesce(title,'') || ' ' || coalesce(agency,''))
       @@ plainto_tsquery('english', $1) LIMIT 3`,
      [searchText],
    );
    opps = oppRes.rows;
  } catch { /* no matches */ }

  try {
    const capRes = await pool.query<{ id: number; title: string }>(
      `SELECT c.id, o.title FROM captures c
       JOIN pipeline_items pi ON pi.id = c.pipeline_item_id
       JOIN opportunities o ON o.id = pi.opportunity_id
       WHERE to_tsvector('english', coalesce(o.title,''))
       @@ plainto_tsquery('english', $1) LIMIT 3`,
      [filename],
    );
    captures = capRes.rows;
  } catch { /* no matches */ }

  const citations = extractRegCitations(extractedText ?? '');

  try {
    const routingResult = await llmRouter.route({
      task: 'vault_smart_route',
      input: {
        filename,
        ai_summary: aiSummary ?? '',
        extracted_text_preview: extractedText?.slice(0, 1000) ?? '',
        matching_opportunities: opps,
        matching_captures: captures,
        regulatory_citations: citations,
      },
    });

    if (routingResult.ok && routingResult.output) {
      const out = routingResult.output as {
        doc_type?: string;
        doc_category?: string;
        linked_opportunity_id?: number | null;
        linked_capture_id?: number | null;
        regulatory_citation?: string | null;
        routing_rationale?: string | null;
      };

      const sets: string[] = ['updated_at = NOW()'];
      const params: unknown[] = [];
      let idx = 1;

      // Only allow LLM to reclassify if user did not explicitly choose a bucket
      if (out.doc_type && !userSuppliedBucket) {
        sets.push(`doc_type = $${idx++}`);
        params.push(out.doc_type);
      }
      if (out.doc_category && !userSuppliedBucket) {
        sets.push(`doc_category = $${idx++}`);
        params.push(out.doc_category);
      }
      if (out.linked_opportunity_id) {
        sets.push(`linked_opportunity_id = $${idx++}`);
        params.push(out.linked_opportunity_id);
      }
      if (out.linked_capture_id) {
        sets.push(`linked_capture_id = $${idx++}`);
        params.push(out.linked_capture_id);
      }
      if (out.regulatory_citation) {
        sets.push(`regulatory_citation = $${idx++}`);
        params.push(out.regulatory_citation);
      }

      if (sets.length > 1) {
        params.push(docId);
        await pool.query(
          `UPDATE vault_documents SET ${sets.join(', ')} WHERE id = $${idx}`,
          params,
        );
      }

      await insertAudit(docId, 'auto_routed', 'system', out.routing_rationale ?? 'Smart ingest routing completed');

      return {
        linked_opportunity_id: out.linked_opportunity_id ?? null,
        linked_capture_id: out.linked_capture_id ?? null,
        routing_rationale: out.routing_rationale ?? null,
      };
    }
  } catch (err) {
    logger.warn({ err, filename }, 'Smart ingest routing failed — document stored without auto-routing');
  }

  return { linked_opportunity_id: null, linked_capture_id: null, routing_rationale: null };
}

export async function vaultRoutes(app: FastifyInstance): Promise<void> {
  await app.register(fastifyMultipart, {
    limits: { fileSize: MAX_FILE_SIZE },
  });

  mkdirSync(UPLOAD_DIR, { recursive: true });

  // GET /v3/vault — list documents with FTS
  app.get('/v3/vault', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const docType = query.doc_type;
    const category = query.category;
    const search = query.q;
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const page = Math.max(Number(query.page) || 1, 1);
    const offset = (page - 1) * limit;

    const conditions: string[] = ['d.deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (category && (category === 'work_product' || category === 'regulatory')) {
      conditions.push(`d.doc_category = $${idx++}`);
      params.push(category);
    }

    if (docType && VALID_DOC_TYPES.includes(docType as DocType)) {
      conditions.push(`d.doc_type = $${idx++}`);
      params.push(docType);
    }

    if (search) {
      conditions.push(`d.full_text_search @@ plainto_tsquery('english', $${idx++})`);
      params.push(search);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countSql = `SELECT COUNT(*)::int AS total FROM vault_documents d ${where}`;
    const countRes = await pool.query<{ total: number }>(countSql, params);
    const total = countRes.rows[0]?.total ?? 0;

    const dataSql = `
      SELECT d.id, d.filename, d.doc_type, d.doc_category, d.is_system_doc,
        d.file_size_bytes, d.file_path, d.ai_summary, d.ai_tags, d.ai_entities,
        d.regulatory_citation, d.effective_date, d.applicable_naics,
        d.linked_opportunity_id, d.linked_capture_id, d.linked_award_id,
        d.uploaded_by, d.uploaded_at, d.updated_at, d.deleted_at,
        o.title AS opp_title,
        (SELECT o2.title FROM captures c JOIN pipeline_items pi ON pi.id = c.pipeline_item_id JOIN opportunities o2 ON o2.id = pi.opportunity_id WHERE c.id = d.linked_capture_id LIMIT 1) AS capture_title,
        a_ref.awardee_name AS award_title
      FROM vault_documents d
      LEFT JOIN opportunities o ON o.id = d.linked_opportunity_id
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

  // GET /v3/vault/counts-by-bucket — per-bucket document counts
  app.get('/v3/vault/counts-by-bucket', async (req, reply) => {
    const res = await pool.query<{ doc_type: string; count: number }>(
      `SELECT doc_type, COUNT(*)::int AS count FROM vault_documents WHERE deleted_at IS NULL GROUP BY doc_type ORDER BY doc_type`,
    );
    const counts: Record<string, number> = {};
    for (const row of res.rows) {
      counts[row.doc_type] = row.count;
    }
    return reply.send(
      successEnvelope(counts, req.requestId),
    );
  });

  // GET /v3/vault/regulatory/catalog
  app.get('/v3/vault/regulatory/catalog', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const category = query.category;

    let sql = 'SELECT * FROM vault_regulatory_catalog WHERE is_active = true';
    const params: unknown[] = [];

    if (category) {
      sql += ' AND category = $1';
      params.push(category);
    }

    sql += ' ORDER BY category, citation';

    const res = await pool.query<RegulatoryCatalogRow>(sql, params);
    return reply.send(successEnvelope(res.rows, req.requestId));
  });

  // GET /v3/vault/regulatory/search
  app.get('/v3/vault/regulatory/search', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const search = query.q;

    if (!search) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Search query (q) is required', req.requestId),
      );
    }

    const catalogSql = `
      SELECT * FROM vault_regulatory_catalog
      WHERE is_active = true
        AND (
          citation ILIKE $1
          OR title ILIKE $1
          OR summary ILIKE $1
        )
      ORDER BY category, citation
    `;

    const docSql = `
      SELECT d.id, d.filename, d.doc_type, d.doc_category, d.ai_summary,
        d.regulatory_citation, d.uploaded_at
      FROM vault_documents d
      WHERE d.deleted_at IS NULL
        AND d.doc_category = 'regulatory'
        AND d.full_text_search @@ plainto_tsquery('english', $1)
      ORDER BY d.uploaded_at DESC
      LIMIT 20
    `;

    const pattern = `%${search}%`;
    const [catalogRes, docRes] = await Promise.all([
      pool.query<RegulatoryCatalogRow>(catalogSql, [pattern]),
      pool.query<VaultDocumentRow>(docSql, [search]),
    ]);

    return reply.send(
      successEnvelope(
        {
          catalog: catalogRes.rows,
          documents: docRes.rows,
        },
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
        (SELECT o2.title FROM captures c JOIN pipeline_items pi ON pi.id = c.pipeline_item_id JOIN opportunities o2 ON o2.id = pi.opportunity_id WHERE c.id = d.linked_capture_id LIMIT 1) AS capture_title,
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

  // GET /v3/vault/:id/text — full extracted text for in-browser reading
  app.get('/v3/vault/:id/text', async (req, reply) => {
    const { id } = req.params as { id: string };
    const res = await pool.query<{ extracted_text: string | null; filename: string; doc_type: string }>(
      `SELECT extracted_text, filename, doc_type FROM vault_documents WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );

    if (!res.rows[0]) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Document not found', req.requestId),
      );
    }

    return reply.send(
      successEnvelope(res.rows[0], req.requestId),
    );
  });

  // POST /v3/vault/upload — multipart file upload with smart ingest routing
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
    // User's bucket choice wins — LLM inference is stored for transparency only
    const userSuppliedBucket = docType !== 'other';
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
          // Only use LLM's doc_type if user did not explicitly pick a bucket
          if (!userSuppliedBucket) {
            const llmBucket = llmResult.output.doc_type_confirmed;
            if (llmBucket && VALID_DOC_TYPES.includes(llmBucket as DocType)) {
              docTypeConfirmed = llmBucket;
            }
          }
        }
      } catch (err) {
        logger.warn({ err, filename }, 'AI parse failed — storing document without analysis');
      }
    }

    const regCitations = extractRegCitations(extractedText);

    const insertRes = await pool.query<{ id: number }>(
      `INSERT INTO vault_documents
        (filename, doc_type, doc_category, file_size_bytes, file_path, extracted_text,
         ai_summary, ai_tags, ai_entities, regulatory_citation, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        filename,
        docTypeConfirmed,
        docTypeConfirmed === 'policy_regulatory' ? 'regulatory' : 'work_product',
        fileSizeBytes,
        `vault/${storedName}`,
        extractedText || null,
        aiSummary,
        aiTags ? JSON.stringify(aiTags) : null,
        aiEntities ? JSON.stringify(aiEntities) : null,
        regCitations.length > 0 ? regCitations[0] : null,
        'admin',
      ],
    );

    const docId = insertRes.rows[0]!.id;
    await insertAudit(docId, 'uploaded', 'admin', `File: ${filename} (${fileSizeBytes} bytes)`);

    if (aiSummary) {
      await insertAudit(docId, 'ai_parsed', 'system', 'AI analysis completed on ingest');
    }

    // Financial statement extraction + ingest (best-effort, must not fail upload)
    if (extractedText.length > 0) {
      // Target/plan workbooks (L1-TARGET, TGT vs ACT, Proj Revenue Summary) do
      // not contain "financ/income/budget" tokens in their filenames, so the
      // original gate never invoked extraction for them and financial_plan
      // stayed empty. Widen the gate to the same plan-detection tokens the
      // extract prompt keys on (TGT/TARGET/PLAN/PROJ/ACT/L1-TARGET) plus the
      // existing actuals tokens. The extract prompt remains the authority on
      // whether a given document actually yields KPI rows.
      const looksFinancial =
        /financ|p&l|income|balance|budget|forecast|tgt|target|plan|proj|revenue|\bact\b/i.test(filename) ||
        docTypeConfirmed === 'financial';
      if (looksFinancial) {
        try {
          const finResult = await llmRouter.route({
            task: 'financial_statement_extract',
            input: { filename, extracted_text: extractedText },
          });

          if (finResult.ok && finResult.output.is_financial && finResult.output.rows.length > 0) {
            const counts = await ingestFinancialRows(finResult.output.rows);
            await insertAudit(
              docId,
              'financials_ingested',
              'system',
              `plan=${counts.plan}, actual=${counts.actual}, rejected=${counts.rejected}`,
            );
          }
        } catch (err) {
          logger.warn({ err, filename }, 'Financial extraction/ingest failed - upload not affected');
        }
      }
    }

    // Vehicle extraction for contract-type docs (best-effort, non-blocking)
    const looksVehicle =
      /contract|vehicle|idiq|bpa|gwac|task.order|teaming/i.test(filename) ||
      docTypeConfirmed === 'contract' ||
      docTypeConfirmed === 'subcontract_teaming';
    if (looksVehicle && extractedText.length > 0) {
      void extractVehicleFromVaultDoc(docId).catch((err) => {
        logger.warn({ err, docId, filename }, 'Vehicle extraction on upload failed — non-blocking');
      });
    }

    // Smart ingest routing (async, non-blocking for response)
    const routingResult = await smartIngestRouter(docId, filename, extractedText || null, aiSummary, userSuppliedBucket);

    const created = await pool.query<VaultDocumentRow>(
      `SELECT d.*, o.title AS opp_title,
        (SELECT o2.title FROM captures c JOIN pipeline_items pi ON pi.id = c.pipeline_item_id JOIN opportunities o2 ON o2.id = pi.opportunity_id WHERE c.id = d.linked_capture_id LIMIT 1) AS capture_title
       FROM vault_documents d
       LEFT JOIN opportunities o ON o.id = d.linked_opportunity_id
       WHERE d.id = $1`,
      [docId],
    );

    return reply.status(201).send(
      successEnvelope(
        {
          ...created.rows[0],
          routing: routingResult,
        },
        req.requestId,
      ),
    );
  });

  // PATCH /v3/vault/documents/:id — update doc_type / doc_category
  app.patch('/v3/vault/documents/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      doc_type?: string;
      doc_category?: string;
    };

    if (!body.doc_type && !body.doc_category) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'No fields to update', req.requestId),
      );
    }

    if (body.doc_type && !VALID_DOC_TYPES.includes(body.doc_type as DocType)) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', `Invalid doc_type: ${body.doc_type}`, req.requestId),
      );
    }

    // Fetch current row for audit trail (from→to)
    const currentRes = await pool.query<{ doc_type: string; doc_category: string }>(
      `SELECT doc_type, doc_category FROM vault_documents WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );

    if (!currentRes.rows[0]) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Document not found', req.requestId),
      );
    }

    const prev = currentRes.rows[0];
    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let idx = 1;

    if (body.doc_type) {
      sets.push(`doc_type = $${idx++}`);
      params.push(body.doc_type);
    }
    if (body.doc_category) {
      sets.push(`doc_category = $${idx++}`);
      params.push(body.doc_category);
    }

    params.push(id);
    const sql = `UPDATE vault_documents SET ${sets.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL RETURNING id, doc_type, doc_category, updated_at`;
    const res = await pool.query<{ id: number; doc_type: string; doc_category: string; updated_at: string }>(sql, params);

    if (!res.rows[0]) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Document not found', req.requestId),
      );
    }

    // Audit log entry
    const changes: string[] = [];
    if (body.doc_type && body.doc_type !== prev.doc_type) {
      changes.push(`doc_type: ${prev.doc_type} → ${body.doc_type}`);
    }
    if (body.doc_category && body.doc_category !== prev.doc_category) {
      changes.push(`doc_category: ${prev.doc_category} → ${body.doc_category}`);
    }
    if (changes.length > 0) {
      await insertAudit(Number(id), 'category_changed', 'admin', changes.join('; '));
    }

    return reply.send(
      successEnvelope(res.rows[0], req.requestId),
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

  // DELETE /v3/vault/:id — soft delete (blocked for system docs)
  app.delete('/v3/vault/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    // Check if system doc
    const checkRes = await pool.query<{ is_system_doc: boolean }>(
      `SELECT is_system_doc FROM vault_documents WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );

    if (!checkRes.rows[0]) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Document not found', req.requestId),
      );
    }

    if (checkRes.rows[0].is_system_doc) {
      return reply.status(403).send(
        errorEnvelope('VALIDATION_ERROR', 'System documents cannot be deleted', req.requestId),
      );
    }

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
      successEnvelope({ success: true }, req.requestId),
    );
  });
}
