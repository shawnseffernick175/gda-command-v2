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
import { reingestFinancialDoc } from '../services/financials/reingest-doc.js';
import { extractVehicleFromVaultDoc } from '../services/vehicles/vault-extract.js';

const UPLOAD_DIR = join(process.cwd(), 'data', 'vault');
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

// ---------------------------------------------------------------------------
// Async financial reingest job tracking. Heavy ledgers (SIE / GL Detail) take
// longer than the gateway's synchronous request timeout, so reingest-all can
// run in the background and report progress via reingest-status. In-memory and
// single-process by design: only one backfill runs at a time and it is an
// idempotent admin action, so losing the record on restart is harmless.
// ---------------------------------------------------------------------------
interface ReingestDocResult {
  doc_id: number;
  filename: string;
  status: 'ingested' | 'no_rows' | 'error';
  plan: number;
  actual: number;
  balance_sheet: number;
  cost_detail: number;
  sie: number;
  rejected: number;
  parsers_run: string[];
  parse_warnings: string[];
  error?: string;
}
interface ReingestJob {
  id: string;
  state: 'running' | 'done' | 'error';
  total: number;
  processed: number;
  results: ReingestDocResult[];
  started_at: string;
  finished_at: string | null;
  error?: string;
}
const reingestJobs = new Map<string, ReingestJob>();
function summarizeJob(job: ReingestJob): Record<string, number> {
  return {
    docs_considered: job.total,
    docs_ingested: job.results.filter((r) => r.status === 'ingested').length,
    docs_errored: job.results.filter((r) => r.status === 'error').length,
    total_plan: job.results.reduce((s, r) => s + r.plan, 0),
    total_actual: job.results.reduce((s, r) => s + r.actual, 0),
    total_balance_sheet: job.results.reduce((s, r) => s + r.balance_sheet, 0),
    total_cost_detail: job.results.reduce((s, r) => s + r.cost_detail, 0),
    total_sie: job.results.reduce((s, r) => s + r.sie, 0),
    total_rejected: job.results.reduce((s, r) => s + r.rejected, 0),
  };
}

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
  extraction_status: string;
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

  if (ext === 'msg') {
    const mod = await import('@kenjiuno/msgreader');
    const MsgReader = mod.default as unknown as new (buf: ArrayBuffer | DataView) => { getFileData(): Record<string, unknown>; getAttachment(att: unknown): { fileName?: string; content?: Uint8Array } };
    const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const msg = new MsgReader(arrayBuf);
    const fileData = msg.getFileData() as {
      senderName?: string;
      senderEmail?: string;
      recipients?: { name?: string; email?: string; recipType?: string }[];
      subject?: string;
      messageDeliveryTime?: string;
      creationTime?: string;
      body?: string;
      attachments?: { fileName?: string; contentLength?: number }[];
    };

    const parts: string[] = [];
    if (fileData.senderName || fileData.senderEmail) {
      parts.push(`FROM: ${fileData.senderName ?? ''} <${fileData.senderEmail ?? ''}>`);
    }
    const recipients = fileData.recipients ?? [];
    const toList = recipients.filter((r) => !r.recipType || r.recipType === 'to');
    const ccList = recipients.filter((r) => r.recipType === 'cc');
    if (toList.length > 0) {
      parts.push(`TO: ${toList.map((r) => r.name || r.email || '').join(', ')}`);
    }
    if (ccList.length > 0) {
      parts.push(`CC: ${ccList.map((r) => r.name || r.email || '').join(', ')}`);
    }
    if (fileData.subject) parts.push(`SUBJECT: ${fileData.subject}`);
    if (fileData.messageDeliveryTime || fileData.creationTime) {
      parts.push(`DATE: ${fileData.messageDeliveryTime ?? fileData.creationTime ?? ''}`);
    }
    const attachments = fileData.attachments ?? [];
    if (attachments.length > 0) {
      const attList = attachments.map((a) => {
        const name = a.fileName ?? 'unnamed';
        const size = a.contentLength ? `(${Math.round(a.contentLength / 1024)} KB)` : '';
        return `${name} ${size}`.trim();
      });
      parts.push(`ATTACHMENTS: [${attList.join(', ')}]`);
    }
    parts.push('');
    parts.push('--- BODY ---');
    parts.push(fileData.body ?? '');

    return parts.join('\n');
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

type ExtractionStatus = 'pending' | 'success' | 'failed' | 'unsupported' | 'dismissed';

const SUPPORTED_EXTENSIONS = new Set(['pdf', 'docx', 'txt', 'csv', 'xlsx', 'zip', 'msg']);

function determineExtractionStatus(filename: string, extractedText: string, fileSizeBytes: number): ExtractionStatus {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (!SUPPORTED_EXTENSIONS.has(ext)) return 'unsupported';
  if (fileSizeBytes === 0) return 'failed';
  if (extractedText.trim().length > 0) return 'success';
  return 'failed';
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

interface ResolveResult {
  doc_id: number;
  filename: string;
  extraction_status: ExtractionStatus;
  resolved: boolean;
  error?: string;
}

/**
 * Re-run the full re-extract → AI parse → structured-ingest pipeline on a single
 * document and persist the result. This is the SAME pipeline the per-document
 * "Re-extract" action and a fresh upload run, factored out so the bulk
 * "Resolve all" action can reuse it. Reads the file back from disk; if the file
 * is missing the doc is marked 'failed' and reported as unresolved. Idempotent —
 * all structured-ingest paths upsert on natural keys.
 */
async function resolveDocument(doc: {
  id: number;
  filename: string;
  file_path: string | null;
  doc_type: string | null;
}): Promise<ResolveResult> {
  const filePath = doc.file_path ? join(process.cwd(), 'data', doc.file_path) : null;

  if (!filePath) {
    await pool.query(
      `UPDATE vault_documents SET extraction_status = 'failed', updated_at = NOW() WHERE id = $1`,
      [doc.id],
    );
    return { doc_id: doc.id, filename: doc.filename, extraction_status: 'failed', resolved: false, error: 'No file path stored' };
  }

  let buf: Buffer;
  try {
    const { readFileSync } = await import('node:fs');
    buf = readFileSync(filePath);
  } catch {
    await pool.query(
      `UPDATE vault_documents SET extraction_status = 'failed', updated_at = NOW() WHERE id = $1`,
      [doc.id],
    );
    return { doc_id: doc.id, filename: doc.filename, extraction_status: 'failed', resolved: false, error: 'File not found on disk' };
  }

  const fileSizeBytes = buf.length;

  let extractedText = '';
  try {
    extractedText = await extractTextFromBuffer(buf, doc.filename);
  } catch (err) {
    logger.warn({ err, filename: doc.filename }, 'resolve: re-extraction failed');
  }

  const extractionStatus = determineExtractionStatus(doc.filename, extractedText, fileSizeBytes);

  let aiSummary: string | null = null;
  let aiTags: string[] | null = null;
  let aiEntities: { name: string; type: string; value: string }[] | null = null;

  if (extractedText.length > 0) {
    try {
      const llmResult = await llmRouter.route({
        task: 'vault_document_parse',
        input: { doc_type: doc.doc_type ?? 'other', filename: doc.filename, extracted_text: extractedText },
      });
      if (llmResult.ok && llmResult.output) {
        aiSummary = llmResult.output.summary;
        aiTags = llmResult.output.tags;
        aiEntities = llmResult.output.entities;
      }
    } catch (err) {
      logger.warn({ err, filename: doc.filename }, 'resolve: AI parse failed');
    }
  }

  await pool.query(
    `UPDATE vault_documents
       SET extracted_text = $1, extraction_status = $2, ai_summary = $3, ai_tags = $4, ai_entities = $5,
           file_size_bytes = $6, updated_at = NOW()
     WHERE id = $7`,
    [
      extractedText || null,
      extractionStatus,
      aiSummary,
      aiTags ? JSON.stringify(aiTags) : null,
      aiEntities ? JSON.stringify(aiEntities) : null,
      fileSizeBytes,
      doc.id,
    ],
  );

  await insertAudit(doc.id, 're_extracted', 'admin', `resolve-all: status=${extractionStatus}, text length: ${extractedText.length}`);

  if (extractedText.length > 0) {
    try {
      const fin = await reingestFinancialDoc({
        docId: doc.id,
        filename: doc.filename,
        extractedText,
        docType: doc.doc_type,
      });
      if (fin.any_ingested) {
        await insertAudit(
          doc.id,
          'financials_ingested',
          'admin',
          `resolve-all: plan=${fin.plan}, actual=${fin.actual}, bs=${fin.balance_sheet}, cd=${fin.cost_detail}, sie=${fin.sie}, rejected=${fin.rejected}`,
        );
      }
    } catch (err) {
      logger.warn({ err, docId: doc.id, filename: doc.filename }, 'resolve-all: financial re-ingest failed');
    }

    const looksVehicle =
      /contract|vehicle|idiq|bpa|gwac|task.order|teaming/i.test(doc.filename) ||
      doc.doc_type === 'contract' ||
      doc.doc_type === 'subcontract_teaming';
    if (looksVehicle) {
      void extractVehicleFromVaultDoc(doc.id).catch((err) => {
        logger.warn({ err, docId: doc.id, filename: doc.filename }, 'resolve-all: vehicle extraction failed — non-blocking');
      });
    }

    try {
      await smartIngestRouter(
        doc.id,
        doc.filename,
        extractedText,
        aiSummary,
        doc.doc_type ? doc.doc_type !== 'other' : false,
      );
    } catch (err) {
      logger.warn({ err, docId: doc.id, filename: doc.filename }, 'resolve-all: smart ingest routing failed');
    }
  }

  return {
    doc_id: doc.id,
    filename: doc.filename,
    extraction_status: extractionStatus,
    resolved: extractionStatus === 'success',
  };
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
        d.extraction_status, d.regulatory_citation, d.effective_date, d.applicable_naics,
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
    const extractionStatus = determineExtractionStatus(filename, extractedText, fileSizeBytes);

    const insertRes = await pool.query<{ id: number }>(
      `INSERT INTO vault_documents
        (filename, doc_type, doc_category, file_size_bytes, file_path, extracted_text,
         ai_summary, ai_tags, ai_entities, regulatory_citation, uploaded_by, extraction_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
        extractionStatus,
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
            const counts = await ingestFinancialRows(finResult.output.rows, docId);
            const auditMsg = `plan=${counts.plan}, actual=${counts.actual}, rejected=${counts.rejected}` +
              (counts.parse_warnings.length > 0 ? ` | WARNINGS: ${counts.parse_warnings.join('; ')}` : '');
            await insertAudit(
              docId,
              'financials_ingested',
              'system',
              auditMsg,
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

  // POST /v3/vault/:id/re-extract — re-run text extraction on a document
  app.post('/v3/vault/:id/re-extract', async (req, reply) => {
    const { id } = req.params as { id: string };

    const docRes = await pool.query<{ id: number; filename: string; file_path: string | null; file_size_bytes: string | null; doc_type: string | null }>(
      `SELECT id, filename, file_path, file_size_bytes, doc_type FROM vault_documents WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );

    if (!docRes.rows[0]) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Document not found', req.requestId),
      );
    }

    const doc = docRes.rows[0];
    const filePath = doc.file_path ? join(process.cwd(), 'data', doc.file_path) : null;

    if (!filePath) {
      await pool.query(
        `UPDATE vault_documents SET extraction_status = 'failed', updated_at = NOW() WHERE id = $1`,
        [id],
      );
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'No file path stored for this document', req.requestId),
      );
    }

    let buf: Buffer;
    try {
      const { readFileSync } = await import('node:fs');
      buf = readFileSync(filePath);
    } catch {
      await pool.query(
        `UPDATE vault_documents SET extraction_status = 'failed', updated_at = NOW() WHERE id = $1`,
        [id],
      );
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'File not found on disk — cannot re-extract', req.requestId),
      );
    }

    const fileSizeBytes = buf.length;

    let extractedText = '';
    try {
      extractedText = await extractTextFromBuffer(buf, doc.filename);
    } catch (err) {
      logger.warn({ err, filename: doc.filename }, 'Re-extraction failed');
    }

    const extractionStatus = determineExtractionStatus(doc.filename, extractedText, fileSizeBytes);

    // Run AI parse if extraction succeeded
    let aiSummary: string | null = null;
    let aiTags: string[] | null = null;
    let aiEntities: { name: string; type: string; value: string }[] | null = null;

    if (extractedText.length > 0) {
      try {
        const llmResult = await llmRouter.route({
          task: 'vault_document_parse',
          input: {
            doc_type: 'other',
            filename: doc.filename,
            extracted_text: extractedText,
          },
        });

        if (llmResult.ok && llmResult.output) {
          aiSummary = llmResult.output.summary;
          aiTags = llmResult.output.tags;
          aiEntities = llmResult.output.entities;
        }
      } catch (err) {
        logger.warn({ err, filename: doc.filename }, 'AI parse failed during re-extraction');
      }
    }

    await pool.query(
      `UPDATE vault_documents
       SET extracted_text = $1, extraction_status = $2, ai_summary = $3, ai_tags = $4, ai_entities = $5,
           file_size_bytes = $6, updated_at = NOW()
       WHERE id = $7`,
      [
        extractedText || null,
        extractionStatus,
        aiSummary,
        aiTags ? JSON.stringify(aiTags) : null,
        aiEntities ? JSON.stringify(aiEntities) : null,
        fileSizeBytes,
        id,
      ],
    );

    await insertAudit(Number(id), 're_extracted', 'admin', `Status: ${extractionStatus}, text length: ${extractedText.length}`);

    // Re-run the SAME structured ingest pipelines a fresh upload would trigger,
    // so a document that failed (or predated) ingest gets fully re-processed —
    // not just its AI summary refreshed. All ingest paths upsert on natural
    // keys, so this is idempotent. Best-effort: a parser failure must not fail
    // the re-extract response.
    const reingest: {
      financial?: Awaited<ReturnType<typeof reingestFinancialDoc>>;
      vehicle_triggered?: boolean;
      routing?: unknown;
    } = {};

    if (extractedText.length > 0) {
      // 1. Financial (KPI / balance sheet / cost detail / SIE — selects per doc).
      try {
        reingest.financial = await reingestFinancialDoc({
          docId: Number(id),
          filename: doc.filename,
          extractedText,
          docType: doc.doc_type,
        });
        if (reingest.financial.any_ingested) {
          await insertAudit(
            Number(id),
            'financials_ingested',
            'admin',
            `re-ingest: plan=${reingest.financial.plan}, actual=${reingest.financial.actual}, bs=${reingest.financial.balance_sheet}, cd=${reingest.financial.cost_detail}, sie=${reingest.financial.sie}, rejected=${reingest.financial.rejected}`,
          );
        }
      } catch (err) {
        logger.warn({ err, docId: id, filename: doc.filename }, 'Re-extract: financial re-ingest failed');
      }

      // 2. Vehicle extraction for contract-type docs (non-blocking).
      const looksVehicle =
        /contract|vehicle|idiq|bpa|gwac|task.order|teaming/i.test(doc.filename) ||
        doc.doc_type === 'contract' ||
        doc.doc_type === 'subcontract_teaming';
      if (looksVehicle) {
        reingest.vehicle_triggered = true;
        void extractVehicleFromVaultDoc(Number(id)).catch((err) => {
          logger.warn({ err, docId: id, filename: doc.filename }, 'Re-extract: vehicle extraction failed — non-blocking');
        });
      }

      // 3. Smart ingest routing (auto-classify / link). Preserve any
      // user-assigned bucket: only re-route when the doc is still 'other'.
      try {
        reingest.routing = await smartIngestRouter(
          Number(id),
          doc.filename,
          extractedText,
          aiSummary,
          doc.doc_type ? doc.doc_type !== 'other' : false,
        );
      } catch (err) {
        logger.warn({ err, docId: id, filename: doc.filename }, 'Re-extract: smart ingest routing failed');
      }
    }

    const updated = await pool.query<VaultDocumentRow>(
      `SELECT d.*, o.title AS opp_title,
        (SELECT o2.title FROM captures c JOIN pipeline_items pi ON pi.id = c.pipeline_item_id JOIN opportunities o2 ON o2.id = pi.opportunity_id WHERE c.id = d.linked_capture_id LIMIT 1) AS capture_title
       FROM vault_documents d
       LEFT JOIN opportunities o ON o.id = d.linked_opportunity_id
       WHERE d.id = $1`,
      [id],
    );

    return reply.send(
      successEnvelope({ ...updated.rows[0], reingest }, req.requestId),
    );
  });

  // POST /v3/vault/:id/dismiss — mark a failed/unsupported upload as dismissed
  // so it no longer counts as unresolved. The document stays in the vault (not
  // deleted) but the owner has acknowledged the extraction issue.
  app.post('/v3/vault/:id/dismiss', async (req, reply) => {
    const { id } = req.params as { id: string };

    const docRes = await pool.query<{ id: number; extraction_status: string }>(
      `SELECT id, extraction_status FROM vault_documents WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );

    if (!docRes.rows[0]) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Document not found', req.requestId),
      );
    }

    const current = docRes.rows[0].extraction_status;
    if (current === 'success') {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Cannot dismiss a successfully extracted document', req.requestId),
      );
    }

    await pool.query(
      `UPDATE vault_documents SET extraction_status = 'dismissed', updated_at = NOW() WHERE id = $1`,
      [id],
    );

    await insertAudit(Number(id), 'dismissed', 'admin', `Previous status: ${current}`);

    const updated = await pool.query<VaultDocumentRow>(
      `SELECT d.*, o.title AS opp_title,
        (SELECT o2.title FROM captures c JOIN pipeline_items pi ON pi.id = c.pipeline_item_id JOIN opportunities o2 ON o2.id = pi.opportunity_id WHERE c.id = d.linked_capture_id LIMIT 1) AS capture_title,
        a_ref.awardee_name AS award_title
       FROM vault_documents d
       LEFT JOIN opportunities o ON o.id = d.linked_opportunity_id
       LEFT JOIN awards a_ref ON a_ref.id = d.linked_award_id
       WHERE d.id = $1`,
      [id],
    );

    return reply.send(
      successEnvelope(updated.rows[0], req.requestId),
    );
  });

  // GET /v3/vault/unresolved-count — how many docs still need resolution
  // (extraction_status is 'failed' or 'pending'). 'success', 'unsupported',
  // and 'dismissed' are excluded — unsupported files have no extractor and
  // dismissed items were explicitly cleared by the owner.
  app.get('/v3/vault/unresolved-count', async (req, reply) => {
    const res = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
         FROM vault_documents
        WHERE deleted_at IS NULL
          AND extraction_status IN ('failed', 'pending')`,
    );
    return reply.send(
      successEnvelope({ count: res.rows[0]?.count ?? 0 }, req.requestId),
    );
  });

  // POST /v3/vault/resolve-all — re-run the full re-extract + AI parse +
  // structured-ingest pipeline on EVERY unresolved document (extraction_status
  // is 'failed' or 'pending'). Skips 'unsupported' (no extractor) and
  // 'dismissed' (owner explicitly cleared). Idempotent.
  app.post('/v3/vault/resolve-all', async (req, reply) => {
    const { rows: docs } = await pool.query<{
      id: number;
      filename: string;
      file_path: string | null;
      doc_type: string | null;
    }>(
      `SELECT id, filename, file_path, doc_type
         FROM vault_documents
        WHERE deleted_at IS NULL
          AND extraction_status IN ('failed', 'pending')
        ORDER BY id`,
    );

    const results: ResolveResult[] = [];
    for (const doc of docs) {
      try {
        results.push(await resolveDocument(doc));
      } catch (err) {
        logger.warn({ err, docId: doc.id, filename: doc.filename }, 'resolve-all: doc failed');
        results.push({
          doc_id: doc.id,
          filename: doc.filename,
          extraction_status: 'failed',
          resolved: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const resolved = results.filter((r) => r.resolved).length;
    return reply.send(
      successEnvelope(
        {
          summary: {
            docs_considered: docs.length,
            docs_resolved: resolved,
            docs_still_unresolved: results.length - resolved,
          },
          results,
        },
        req.requestId,
      ),
    );
  });

  // POST /v3/vault/financials/reingest-all — re-run financial ingest against
  // every vault doc that already has extracted text. Idempotent (all ingest
  // paths upsert on natural keys). Uses the STORED extracted_text, so it works
  // even when the original file is no longer on disk. This is the one-shot
  // "fix everything that failed to ingest" action.
  //   ?ids=81,83,85  -> limit to specific doc ids
  //   ?dry_run=true  -> report what WOULD ingest without writing (still calls
  //                     parsers; the helper always writes, so dry_run only
  //                     restricts the doc set echo, not writes — omit for apply)
  //   ?async=true    -> kick off in the background, return 202 immediately, and
  //                     poll GET /v3/vault/financials/reingest-status. Required
  //                     for heavy ledgers (SIE / GL Detail) whose parsers exceed
  //                     the gateway's synchronous request timeout.
  app.post('/v3/vault/financials/reingest-all', async (req, reply) => {
    const q = req.query as Record<string, string>;
    const idFilter = q.ids
      ? q.ids.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n))
      : null;
    const runAsync = q.async === 'true' || q.async === '1';

    // Candidate docs: financial/other type OR a filename that looks financial,
    // with non-empty extracted text. (Other types route through re-extract.)
    const { rows: docs } = await pool.query<{
      id: number;
      filename: string;
      doc_type: string | null;
      extracted_text: string | null;
    }>(
      `SELECT id, filename, doc_type, extracted_text
         FROM vault_documents
        WHERE deleted_at IS NULL
          AND extracted_text IS NOT NULL
          AND length(trim(extracted_text)) > 0
          AND (
            doc_type IN ('financial', 'other')
            OR filename ~* '(financ|p&l|income|balance|budget|forecast|tgt|target|plan|proj|revenue|\\msie\\M)'
          )
          ${idFilter ? 'AND id = ANY($1)' : ''}
        ORDER BY id`,
      idFilter ? [idFilter] : [],
    );

    async function runReingest(job: ReingestJob): Promise<void> {
      for (const doc of docs) {
        try {
          const r = await reingestFinancialDoc({
            docId: doc.id,
            filename: doc.filename,
            extractedText: doc.extracted_text ?? '',
            docType: doc.doc_type,
          });
          if (r.any_ingested) {
            const auditMsg = `reingest-all: plan=${r.plan}, actual=${r.actual}, bs=${r.balance_sheet}, cd=${r.cost_detail}, sie=${r.sie}, rejected=${r.rejected}` +
              (r.parse_warnings.length > 0 ? ` | WARNINGS: ${r.parse_warnings.join('; ')}` : '');
            await insertAudit(
              doc.id,
              'financials_ingested',
              'admin',
              auditMsg,
            );
          }
          job.results.push({
            doc_id: doc.id,
            filename: doc.filename,
            status: r.any_ingested ? 'ingested' : 'no_rows',
            plan: r.plan,
            actual: r.actual,
            balance_sheet: r.balance_sheet,
            cost_detail: r.cost_detail,
            sie: r.sie,
            rejected: r.rejected,
            parsers_run: r.parsers_run,
            parse_warnings: r.parse_warnings,
          });
        } catch (err) {
          logger.warn({ err, docId: doc.id, filename: doc.filename }, 'reingest-all: doc failed');
          job.results.push({
            doc_id: doc.id,
            filename: doc.filename,
            status: 'error',
            plan: 0, actual: 0, balance_sheet: 0, cost_detail: 0, sie: 0, rejected: 0,
            parsers_run: [],
            parse_warnings: [],
            error: err instanceof Error ? err.message : String(err),
          });
        }
        job.processed += 1;
      }
    }

    if (runAsync) {
      // Fire-and-forget: register a job, return 202 immediately, run in the
      // background. Survives the gateway timeout for heavy ledgers.
      const job: ReingestJob = {
        id: `reingest_${Date.now()}`,
        state: 'running',
        total: docs.length,
        processed: 0,
        results: [],
        started_at: new Date().toISOString(),
        finished_at: null,
      };
      reingestJobs.set('latest', job);
      // Intentionally not awaited.
      void runReingest(job)
        .then(() => {
          job.state = 'done';
          job.finished_at = new Date().toISOString();
        })
        .catch((err) => {
          job.state = 'error';
          job.finished_at = new Date().toISOString();
          job.error = err instanceof Error ? err.message : String(err);
          logger.error({ err }, 'reingest-all async job failed');
        });

      return reply.status(202).send(successEnvelope({
        accepted: true,
        job_id: job.id,
        docs_considered: docs.length,
        poll: '/v3/vault/financials/reingest-status',
      }, req.requestId));
    }

    // Synchronous path (small doc sets / specific ids).
    const job: ReingestJob = {
      id: `reingest_${Date.now()}`,
      state: 'running',
      total: docs.length,
      processed: 0,
      results: [],
      started_at: new Date().toISOString(),
      finished_at: null,
    };
    await runReingest(job);
    job.state = 'done';
    job.finished_at = new Date().toISOString();
    reingestJobs.set('latest', job);

    return reply.send(successEnvelope({ summary: summarizeJob(job), results: job.results }, req.requestId));
  });

  // GET /v3/vault/financials/reingest-status — progress of the most recent
  // (sync or async) reingest-all run. Lets a client kick off a heavy async
  // backfill and poll until done without holding an HTTP connection open.
  app.get('/v3/vault/financials/reingest-status', async (req, reply) => {
    const job = reingestJobs.get('latest');
    if (!job) {
      return reply.send(successEnvelope({ state: 'idle', job: null }, req.requestId));
    }
    return reply.send(successEnvelope({
      state: job.state,
      job_id: job.id,
      total: job.total,
      processed: job.processed,
      started_at: job.started_at,
      finished_at: job.finished_at,
      error: job.error ?? null,
      summary: summarizeJob(job),
      results: job.results,
    }, req.requestId));
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
