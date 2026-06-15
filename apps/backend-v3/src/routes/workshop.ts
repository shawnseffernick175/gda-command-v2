/**
 * Workshop routes — document teardown + targeted output generation (#873)
 *
 * Endpoints:
 *   POST   /v3/workshop/upload                — multipart file upload
 *   POST   /v3/workshop/uploads/:id/classify  — classify + trigger teardown
 *   POST   /v3/workshop/uploads/:id/teardown  — run/re-run Sonnet teardown
 *   GET    /v3/workshop/uploads/:id           — single upload + teardown_analysis
 *   GET    /v3/workshop/uploads               — list uploads (paginated)
 *   POST   /v3/workshop/uploads/:id/generate  — generate output document
 *   DELETE /v3/workshop/uploads/:id           — cascade-delete upload + outputs
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

const UPLOAD_DIR = join(process.cwd(), 'data', 'workshop');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const ALLOWED_EXTENSIONS = new Set([
  'pptx', 'docx', 'xlsx', 'pdf', 'msg', 'txt', 'md',
]);

const CLASSIFICATIONS = [
  'proposal_draft',
  'competitor_whitepaper',
  'rfp_solicitation',
  'past_performance',
  'financial_statement',
  'meeting_notes',
  'contract_agreement',
  'other',
] as const;

const OUTPUT_TYPES = [
  'executive_summary',
  'capture_brief',
  'red_team_critique',
  'gap_analysis',
  'proposal_section',
  'compliance_matrix',
  'email_summary',
  'custom',
] as const;

const OUTPUT_FORMATS = ['docx', 'pptx', 'xlsx', 'txt'] as const;

interface DocumentUploadRow {
  id: string;
  filename: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
  classification: string | null;
  teardown_analysis: Record<string, unknown> | null;
  teardown_run_at: string | null;
  teardown_model: string | null;
  status: string;
}

interface WorkshopOutputRow {
  id: string;
  source_upload_id: string;
  output_type: string;
  output_format: string;
  vault_doc_id: number | null;
  generated_at: string;
  generated_by: string | null;
  config: Record<string, unknown> | null;
  rendered_text: string | null;
}

async function extractTextFromBuffer(buf: Buffer, filename: string): Promise<string> {
  const ext = filename.toLowerCase().split('.').pop();

  if (ext === 'pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    const textResult = await parser.getText();
    return textResult.pages?.map((p: { text: string }) => p.text).join('\n') ?? '';
  }

  if (ext === 'docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer: buf });
    return result.value;
  }

  if (ext === 'txt' || ext === 'md') {
    return buf.toString('utf-8');
  }

  if (ext === 'xlsx') {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf as unknown as ArrayBuffer);
    const blocks: string[] = [];
    for (const sheet of workbook.worksheets) {
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
      blocks.push(lines.join('\n'));
    }
    return blocks.join('\n\n').slice(0, 200_000);
  }

  if (ext === 'pptx') {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buf);
    const slides: string[] = [];
    const slideFiles = Object.keys(zip.files)
      .filter((f) => f.match(/^ppt\/slides\/slide\d+\.xml$/))
      .sort();
    const { XMLParser } = await import('fast-xml-parser');
    const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true });
    for (const sf of slideFiles) {
      const xml = await zip.files[sf].async('string');
      const parsed = parser.parse(xml);
      const texts: string[] = [];
      function walk(node: unknown): void {
        if (typeof node === 'string') {
          if (node.trim()) texts.push(node.trim());
          return;
        }
        if (Array.isArray(node)) {
          for (const item of node) walk(item);
          return;
        }
        if (node && typeof node === 'object') {
          for (const val of Object.values(node as Record<string, unknown>)) {
            walk(val);
          }
        }
      }
      walk(parsed);
      if (texts.length > 0) {
        slides.push(`## Slide ${slides.length + 1}\n${texts.join('\n')}`);
      }
    }
    return slides.join('\n\n').slice(0, 200_000);
  }

  return '';
}

function buildTeardownPrompt(classification: string, extractedText: string): string {
  return `You are reading a ${classification} for Envision (gov contractor, NAICS 541330/541611-720/541990/561499/561611/611512).

Extract and return JSON:
{
  "title": str,
  "doc_type": str,
  "page_count": int,
  "structure": [{"section_name": str, "page_start": int, "page_end": int, "summary": str}],
  "key_claims": [str],
  "key_numbers": [{"value": str, "context": str, "page": int}],
  "tables_extracted": [{"caption": str, "csv": str}],
  "figures_extracted": [{"caption": str, "page": int}],
  "risks_or_gaps": [str],
  "envision_relevance": {
    "wheelhouse_match": str,
    "agencies_mentioned": [str],
    "naics_mentioned": [str],
    "vehicles_mentioned": [str],
    "competitors_mentioned": [str],
    "teammate_candidates": [str],
    "threat_candidates": [str]
  },
  "summary_3_sentence": str
}

wheelhouse_match must be one of: "high", "medium", "low", "none"

Return ONLY valid JSON, no markdown fences, no extra text.

Document content:
${extractedText.slice(0, 100_000)}`;
}

function buildGeneratePrompt(
  outputType: string,
  teardownAnalysis: Record<string, unknown>,
  extractedText: string,
  config: Record<string, unknown>,
): string {
  const analysisJson = JSON.stringify(teardownAnalysis, null, 2);
  const baseContext = `You are a senior government contracting analyst at Envision (NAICS 541330/541611-720/541990/561499/561611/611512).

Below is the structured teardown analysis of a document, followed by the original text.

TEARDOWN ANALYSIS:
${analysisJson}

ORIGINAL TEXT (truncated):
${extractedText.slice(0, 60_000)}
`;

  switch (outputType) {
    case 'executive_summary':
      return `${baseContext}\n\nGenerate a 1-page executive summary suitable for senior leadership. Be concise, fact-dense, and action-oriented. Use professional prose, not bullet lists.`;

    case 'capture_brief':
      return `${baseContext}\n\nGenerate a capture brief skeleton with sections: Opportunity Overview, Customer Profile, Competitive Landscape, Win Strategy, Key Personnel, Teaming Strategy, Price-to-Win, Timeline. Fill what you can from the analysis; mark unknowns as [TBD].`;

    case 'red_team_critique':
      return `${baseContext}\n\nPerform a Section L/M-style red-team critique. Identify weaknesses, compliance gaps, and areas needing improvement. Be direct and specific. Structure as: Strengths, Weaknesses, Compliance Gaps, Recommendations.`;

    case 'gap_analysis': {
      const rfpText = typeof config.rfp_text === 'string' ? config.rfp_text : '';
      return `${baseContext}\n\nRFP/REQUIREMENTS TEXT:\n${rfpText.slice(0, 30_000)}\n\nPerform a gap analysis comparing the document against the RFP requirements. For each requirement, indicate: Met/Partially Met/Not Met with rationale.`;
    }

    case 'proposal_section': {
      const topic = typeof config.topic === 'string' ? config.topic : 'Technical Approach';
      const pageCount = typeof config.page_count === 'number' ? config.page_count : 3;
      return `${baseContext}\n\nDraft a proposal section on "${topic}" (approximately ${pageCount} pages). Write in proposal voice — compliant, persuasive, evidence-rich. Include cross-references to past performance where relevant.`;
    }

    case 'compliance_matrix':
      return `${baseContext}\n\nGenerate a compliance matrix in table format. Columns: Requirement ID, Requirement Text, Section L/M Reference, Compliant (Yes/No/Partial), Response Location, Notes. Extract requirements from the document analysis.`;

    case 'email_summary':
      return `${baseContext}\n\nGenerate a short, professional email summary of this document. 3-5 paragraphs max. Suitable for forwarding to a colleague or executive. Include key takeaways and any action items.`;

    case 'custom': {
      const customPrompt = typeof config.prompt === 'string' ? config.prompt : '';
      return `${baseContext}\n\nUser request: ${customPrompt}`;
    }

    default:
      return `${baseContext}\n\nSummarize the key findings from this document.`;
  }
}

export async function workshopRoutes(app: FastifyInstance): Promise<void> {
  await app.register(fastifyMultipart, {
    limits: { fileSize: MAX_FILE_SIZE },
  });

  mkdirSync(UPLOAD_DIR, { recursive: true });

  // GET /v3/workshop/uploads — list uploads (paginated)
  app.get('/v3/workshop/uploads', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const page = Math.max(Number(query.page) || 1, 1);
    const offset = (page - 1) * limit;

    const countRes = await pool.query<{ total: number }>(
      'SELECT COUNT(*)::int AS total FROM document_uploads',
    );
    const total = countRes.rows[0]?.total ?? 0;

    const dataRes = await pool.query<DocumentUploadRow>(
      `SELECT id, filename, storage_path, mime_type, size_bytes,
              uploaded_by, uploaded_at, classification,
              teardown_analysis, teardown_run_at, teardown_model, status
       FROM document_uploads
       ORDER BY uploaded_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    return reply.send(
      successEnvelope(
        { items: dataRes.rows, total, page, totalPages: Math.ceil(total / limit) || 1 },
        req.requestId,
      ),
    );
  });

  // GET /v3/workshop/uploads/:id — single upload + teardown
  app.get('/v3/workshop/uploads/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const res = await pool.query<DocumentUploadRow>(
      `SELECT id, filename, storage_path, mime_type, size_bytes,
              uploaded_by, uploaded_at, classification,
              teardown_analysis, teardown_run_at, teardown_model, status
       FROM document_uploads WHERE id = $1`,
      [id],
    );

    if (res.rows.length === 0) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Upload not found', req.requestId),
      );
    }

    const upload = res.rows[0];

    const outputsRes = await pool.query<WorkshopOutputRow>(
      `SELECT id, source_upload_id, output_type, output_format,
              vault_doc_id, generated_at, generated_by, config, rendered_text
       FROM workshop_outputs WHERE source_upload_id = $1
       ORDER BY generated_at DESC`,
      [id],
    );

    return reply.send(
      successEnvelope({ ...upload, outputs: outputsRes.rows }, req.requestId),
    );
  });

  // POST /v3/workshop/upload — multipart file upload
  app.post('/v3/workshop/upload', async (req, reply) => {
    const parts = req.parts();
    const uploadedFiles: DocumentUploadRow[] = [];

    for await (const part of parts) {
      if (part.type !== 'file') continue;

      const filename = part.filename;
      const ext = filename.toLowerCase().split('.').pop() ?? '';
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return reply.status(400).send(
          errorEnvelope(
            'VALIDATION_ERROR',
            `File type .${ext} is not supported. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
            req.requestId,
          ),
        );
      }

      const fileId = crypto.randomUUID();
      const storagePath = join(UPLOAD_DIR, `${fileId}_${filename}`);
      const ws = createWriteStream(storagePath);
      await pipeline(part.file, ws);

      const { size } = await import('node:fs').then((fs) =>
        fs.promises.stat(storagePath),
      );

      const res = await pool.query<DocumentUploadRow>(
        `INSERT INTO document_uploads (filename, storage_path, mime_type, size_bytes, status)
         VALUES ($1, $2, $3, $4, 'uploaded')
         RETURNING *`,
        [filename, storagePath, part.mimetype, size],
      );

      uploadedFiles.push(res.rows[0]);
    }

    if (uploadedFiles.length === 0) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'No files uploaded', req.requestId),
      );
    }

    return reply.status(201).send(
      successEnvelope(uploadedFiles, req.requestId),
    );
  });

  // POST /v3/workshop/uploads/:id/classify — set classification + trigger teardown
  app.post('/v3/workshop/uploads/:id/classify', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { classification?: string } | undefined;
    const classification = body?.classification;

    if (!classification || !CLASSIFICATIONS.includes(classification as typeof CLASSIFICATIONS[number])) {
      return reply.status(400).send(
        errorEnvelope(
          'VALIDATION_ERROR',
          `Invalid classification. Must be one of: ${CLASSIFICATIONS.join(', ')}`,
          req.requestId,
        ),
      );
    }

    const checkRes = await pool.query<{ id: string }>(
      'SELECT id FROM document_uploads WHERE id = $1',
      [id],
    );
    if (checkRes.rows.length === 0) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Upload not found', req.requestId),
      );
    }

    await pool.query(
      'UPDATE document_uploads SET classification = $1, status = $2 WHERE id = $3',
      [classification, 'analyzing', id],
    );

    // Run teardown in background
    runTeardown(id, classification).catch((err) => {
      logger.error({ err, uploadId: id }, 'Workshop teardown failed');
    });

    return reply.send(
      successEnvelope({ id, classification, status: 'analyzing' }, req.requestId),
    );
  });

  // POST /v3/workshop/uploads/:id/teardown — run/re-run teardown
  app.post('/v3/workshop/uploads/:id/teardown', async (req, reply) => {
    const { id } = req.params as { id: string };

    const res = await pool.query<DocumentUploadRow>(
      'SELECT * FROM document_uploads WHERE id = $1',
      [id],
    );
    if (res.rows.length === 0) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Upload not found', req.requestId),
      );
    }

    const upload = res.rows[0];
    if (!upload.classification) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Document must be classified before teardown', req.requestId),
      );
    }

    await pool.query(
      'UPDATE document_uploads SET status = $1 WHERE id = $2',
      ['analyzing', id],
    );

    runTeardown(id, upload.classification).catch((err) => {
      logger.error({ err, uploadId: id }, 'Workshop re-teardown failed');
    });

    return reply.send(
      successEnvelope({ id, status: 'analyzing' }, req.requestId),
    );
  });

  // POST /v3/workshop/uploads/:id/generate — generate output
  app.post('/v3/workshop/uploads/:id/generate', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      output_type?: string;
      output_format?: string;
      config?: Record<string, unknown>;
    } | undefined;

    const outputType = body?.output_type;
    const outputFormat = body?.output_format ?? 'docx';
    const config = body?.config ?? {};

    if (!outputType || !OUTPUT_TYPES.includes(outputType as typeof OUTPUT_TYPES[number])) {
      return reply.status(400).send(
        errorEnvelope(
          'VALIDATION_ERROR',
          `Invalid output_type. Must be one of: ${OUTPUT_TYPES.join(', ')}`,
          req.requestId,
        ),
      );
    }
    if (!OUTPUT_FORMATS.includes(outputFormat as typeof OUTPUT_FORMATS[number])) {
      return reply.status(400).send(
        errorEnvelope(
          'VALIDATION_ERROR',
          `Invalid output_format. Must be one of: ${OUTPUT_FORMATS.join(', ')}`,
          req.requestId,
        ),
      );
    }

    const uploadRes = await pool.query<DocumentUploadRow>(
      'SELECT * FROM document_uploads WHERE id = $1',
      [id],
    );
    if (uploadRes.rows.length === 0) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Upload not found', req.requestId),
      );
    }

    const upload = uploadRes.rows[0];
    if (!upload.teardown_analysis) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Teardown must complete before generating output', req.requestId),
      );
    }

    // Read original file for context
    const { readFile } = await import('node:fs/promises');
    let extractedText = '';
    try {
      const buf = await readFile(upload.storage_path);
      extractedText = await extractTextFromBuffer(buf, upload.filename);
    } catch (err) {
      logger.warn({ err, uploadId: id }, 'Could not re-read source file for generation');
    }

    const prompt = buildGeneratePrompt(
      outputType,
      upload.teardown_analysis,
      extractedText,
      config,
    );

    const result = await llmRouter.route({
      task: 'workshop_generate',
      input: { prompt },
    });

    if (!result.ok) {
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', 'Generation failed: ' + (result.error_message ?? 'unknown'), req.requestId),
      );
    }

    const output = result.output as { raw_text: string };
    const renderedText = output.raw_text;

    // Save to Vault if it's a file format
    let vaultDocId: number | null = null;
    if (outputFormat !== 'txt') {
      try {
        const vaultFilename = `workshop_${outputType}_${upload.filename.replace(/\.[^.]+$/, '')}.${outputFormat}`;
        const vaultPath = join(process.cwd(), 'data', 'vault', `${crypto.randomUUID()}_${vaultFilename}`);

        await generateFile(outputFormat, renderedText, vaultPath);

        const { size: fileSize } = await import('node:fs').then((fs) =>
          fs.promises.stat(vaultPath),
        );

        const vaultRes = await pool.query<{ id: number }>(
          `INSERT INTO vault_documents (filename, doc_type, doc_category, file_path, file_size_bytes, ai_summary, uploaded_by)
           VALUES ($1, 'other', 'work_product', $2, $3, $4, 'system')
           RETURNING id`,
          [vaultFilename, vaultPath, fileSize, `Workshop ${outputType} output derived from ${upload.filename}`],
        );
        vaultDocId = vaultRes.rows[0]?.id ?? null;
      } catch (err) {
        logger.warn({ err, uploadId: id }, 'Failed to save generated file to Vault');
      }
    }

    // Save workshop_output record
    const outputRes = await pool.query<WorkshopOutputRow>(
      `INSERT INTO workshop_outputs (source_upload_id, output_type, output_format, vault_doc_id, config, rendered_text)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, outputType, outputFormat, vaultDocId, JSON.stringify(config), renderedText],
    );

    return reply.send(
      successEnvelope(outputRes.rows[0], req.requestId),
    );
  });

  // DELETE /v3/workshop/uploads/:id
  app.delete('/v3/workshop/uploads/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const res = await pool.query<{ id: string }>(
      'DELETE FROM document_uploads WHERE id = $1 RETURNING id',
      [id],
    );
    if (res.rows.length === 0) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Upload not found', req.requestId),
      );
    }

    return reply.send(successEnvelope({ deleted: true }, req.requestId));
  });
}

async function runTeardown(uploadId: string, classification: string): Promise<void> {
  const uploadRes = await pool.query<DocumentUploadRow>(
    'SELECT * FROM document_uploads WHERE id = $1',
    [uploadId],
  );
  if (uploadRes.rows.length === 0) return;

  const upload = uploadRes.rows[0];

  try {
    const { readFile } = await import('node:fs/promises');
    const buf = await readFile(upload.storage_path);
    const extractedText = await extractTextFromBuffer(buf, upload.filename);

    const prompt = buildTeardownPrompt(classification, extractedText);

    const result = await llmRouter.route({
      task: 'workshop_teardown',
      input: { prompt },
    });

    if (!result.ok) {
      await pool.query(
        'UPDATE document_uploads SET status = $1 WHERE id = $2',
        ['failed', uploadId],
      );
      logger.error({ uploadId, error: result.error_message }, 'Teardown LLM call failed');
      return;
    }

    let analysis: Record<string, unknown>;
    const rawOutput = (result.output as { raw_text: string }).raw_text;
    try {
      analysis = JSON.parse(rawOutput) as Record<string, unknown>;
    } catch {
      analysis = { raw_text: rawOutput };
    }

    await pool.query(
      `UPDATE document_uploads
       SET teardown_analysis = $1,
           teardown_run_at = NOW(),
           teardown_model = $2,
           status = 'analyzed'
       WHERE id = $3`,
      [JSON.stringify(analysis), result.model_used ?? 'claude-sonnet-4-5', uploadId],
    );
  } catch (err) {
    await pool.query(
      'UPDATE document_uploads SET status = $1 WHERE id = $2',
      ['failed', uploadId],
    );
    logger.error({ err, uploadId }, 'Teardown processing error');
  }
}

async function generateFile(format: string, content: string, outPath: string): Promise<void> {
  const { writeFile } = await import('node:fs/promises');

  if (format === 'docx') {
    const { Document, Packer, Paragraph, TextRun } = await import('docx');
    const paragraphs = content.split('\n').map(
      (line) =>
        new Paragraph({
          children: [new TextRun({ text: line, size: 24 })],
          spacing: { after: 120 },
        }),
    );
    const doc = new Document({
      sections: [{ children: paragraphs }],
    });
    const buffer = await Packer.toBuffer(doc);
    await writeFile(outPath, buffer);
    return;
  }

  if (format === 'xlsx') {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Output');
    const lines = content.split('\n');
    for (const line of lines) {
      const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
      if (cells.length > 0) {
        sheet.addRow(cells);
      }
    }
    await workbook.xlsx.writeFile(outPath);
    return;
  }

  if (format === 'pptx') {
    const pptxgenjs = await import('pptxgenjs');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const PptxCtor = (pptxgenjs as any).default ?? pptxgenjs;
    const pptx = new PptxCtor() as import('pptxgenjs').default;
    const sections = content.split('\n\n');
    for (const section of sections) {
      if (!section.trim()) continue;
      const slide = pptx.addSlide();
      const lines = section.split('\n');
      const title = lines[0] ?? 'Slide';
      const body = lines.slice(1).join('\n');
      slide.addText(title, { x: 0.5, y: 0.5, w: 9, h: 0.8, fontSize: 24, bold: true });
      if (body.trim()) {
        slide.addText(body, { x: 0.5, y: 1.5, w: 9, h: 5, fontSize: 14 });
      }
    }
    await pptx.writeFile({ fileName: outPath });
    return;
  }

  // txt fallback
  await writeFile(outPath, content, 'utf-8');
}
