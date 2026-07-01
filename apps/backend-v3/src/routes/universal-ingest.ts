/**
 * Universal Ingestion routes — F-304.
 *
 * Endpoints:
 *   POST   /v3/ingest/upload              — multipart upload, returns ingest_job_id
 *   POST   /v3/ingest/email-webhook       — Postmark/Mailgun-compatible payload
 *   GET    /v3/ingest/jobs/:id            — single job status
 *   GET    /v3/ingest/jobs                — list jobs with filters
 *   POST   /v3/decision-memory/classification-correction — reclassify + feed F-302
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import { createWriteStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { logger } from '../lib/logger.js';
import { extractTextFromBuffer } from '../routes/vault.js';
import { llmRouter } from '../lib/llm-router.js';
import { redactPii, detectPii } from '../services/ingest/pii.js';
import { classifyDocument } from '../services/ingest/classifier.js';
import { routeToSurface } from '../services/ingest/router.js';
import type { JwtPayload } from '../middleware/auth.js';
import { config } from '../config/index.js';

const UPLOAD_DIR = join(process.cwd(), 'data', 'ingest');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB cap per spec

function getActor(req: FastifyRequest): string {
  const user = (req as FastifyRequest & { user?: JwtPayload }).user;
  return user?.sub ?? 'system';
}

export async function universalIngestRoutes(app: FastifyInstance): Promise<void> {
  mkdirSync(UPLOAD_DIR, { recursive: true });

  await app.register(fastifyMultipart, {
    limits: { fileSize: MAX_FILE_SIZE },
    attachFieldsToBody: false,
  });

  /**
   * POST /v3/ingest/upload — accept any file, create ingest job,
   * run extract → classify → route pipeline async.
   */
  app.post('/v3/ingest/upload', async (req, reply) => {
    const data = await req.file();
    if (!data) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'No file provided', req.requestId),
      );
    }

    const filename = data.filename;
    const mimeType = data.mimetype;
    const sourceSurface = (req.query as Record<string, string>).surface ?? null;
    const jobId = randomUUID();
    const filePath = join('ingest', `${jobId}_${filename}`);
    const fullPath = join(process.cwd(), 'data', filePath);

    // Stream to disk
    const chunks: Buffer[] = [];
    const writeStream = createWriteStream(fullPath);
    const tee = new (await import('node:stream')).PassThrough();
    tee.on('data', (chunk: Buffer) => chunks.push(chunk));

    await pipeline(data.file, tee);
    const buf = Buffer.concat(chunks);
    writeStream.write(buf);
    writeStream.end();

    const fileSizeBytes = buf.length;

    // Insert job record
    await pool.query(
      `INSERT INTO ingest_jobs (id, filename, file_path, file_size_bytes, mime_type, source, source_surface, owner, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
      [jobId, filename, filePath, fileSizeBytes, mimeType, 'drag_drop', sourceSurface, getActor(req)],
    );

    // Fire async pipeline (no await — returns immediately)
    void runIngestPipeline(jobId, buf, filename).catch((err) => {
      logger.error({ err, jobId }, 'ingest pipeline failed');
    });

    return reply.status(202).send(
      successEnvelope({ ingest_job_id: jobId, filename, status: 'pending' }, req.requestId),
    );
  });

  /**
   * POST /v3/ingest/email-webhook — Postmark/Mailgun-compatible inbound email.
   * Accepts JSON body with email fields + base64 attachments.
   */
  app.post('/v3/ingest/email-webhook', async (req, reply) => {
    // Verify webhook signing secret
    const authHeader = req.headers['x-gda-key'] as string | undefined;
    const webhookKey = config.webhookKey ?? process.env['GDA_WEBHOOK_KEY'];
    if (!webhookKey || authHeader !== webhookKey) {
      return reply.status(401).send(
        errorEnvelope('WEBHOOK_AUTH_FAILED', 'Invalid or missing x-gda-key header', req.requestId),
      );
    }

    const body = req.body as {
      From?: string;
      FromFull?: { Email?: string; Name?: string };
      To?: string;
      Subject?: string;
      MessageID?: string;
      TextBody?: string;
      HtmlBody?: string;
      Attachments?: Array<{
        Name: string;
        Content: string; // base64
        ContentType: string;
        ContentLength?: number;
      }>;
      // Mailgun-style fields
      sender?: string;
      from?: string;
      subject?: string;
      'message-id'?: string;
      'body-plain'?: string;
      'body-html'?: string;
    } | undefined;

    if (!body) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Request body is required', req.requestId),
      );
    }

    // Normalize between Postmark / Mailgun
    const emailFrom = body.FromFull?.Email ?? body.From ?? body.sender ?? body.from ?? 'unknown';
    const emailSubject = body.Subject ?? body.subject ?? '(no subject)';
    const messageId = body.MessageID ?? body['message-id'] ?? null;
    const textBody = body.TextBody ?? body['body-plain'] ?? '';
    const attachments = body.Attachments ?? [];

    // Deduplicate by message-id
    if (messageId) {
      const existing = await pool.query(
        'SELECT id FROM ingest_jobs WHERE email_message_id = $1 LIMIT 1',
        [messageId],
      );
      if (existing.rows.length > 0) {
        return reply.send(
          successEnvelope({ deduplicated: true, existing_job_id: existing.rows[0].id }, req.requestId),
        );
      }
    }

    // Derive target surface from To address: capture+envision@gda.csr-llc.tech → capture
    const toAddr = body.To ?? '';
    const surfaceMatch = toAddr.match(/^([a-z_-]+)\+/i);
    const sourceSurface = surfaceMatch ? surfaceMatch[1].toLowerCase() : null;

    const jobIds: string[] = [];

    // Process email body as a job
    if (textBody.trim().length > 0) {
      const bodyJobId = randomUUID();
      await pool.query(
        `INSERT INTO ingest_jobs (id, filename, file_size_bytes, source, source_surface, email_from, email_subject, email_message_id, extracted_text, owner, status)
         VALUES ($1, $2, $3, 'email_webhook', $4, $5, $6, $7, $8, 'system', 'extracting')`,
        [bodyJobId, `email_body_${emailSubject.slice(0, 50)}.txt`, Buffer.byteLength(textBody), sourceSurface, emailFrom, emailSubject, messageId, textBody],
      );
      jobIds.push(bodyJobId);

      void runClassifyAndRoute(bodyJobId, textBody, `email_body_${emailSubject}.txt`).catch((err) => {
        logger.error({ err, jobId: bodyJobId }, 'email body classification failed');
      });
    }

    // Process attachments
    for (const att of attachments) {
      const attJobId = randomUUID();
      const buf = Buffer.from(att.Content, 'base64');
      const filePath = join('ingest', `${attJobId}_${att.Name}`);
      const fullPath = join(process.cwd(), 'data', filePath);
      mkdirSync(join(process.cwd(), 'data', 'ingest'), { recursive: true });

      const { writeFileSync } = await import('node:fs');
      writeFileSync(fullPath, buf);

      await pool.query(
        `INSERT INTO ingest_jobs (id, filename, file_path, file_size_bytes, mime_type, source, source_surface, email_from, email_subject, email_message_id, owner, status)
         VALUES ($1, $2, $3, $4, $5, 'email_webhook', $6, $7, $8, $9, 'system', 'pending')`,
        [attJobId, att.Name, filePath, buf.length, att.ContentType, sourceSurface, emailFrom, emailSubject, messageId],
      );
      jobIds.push(attJobId);

      void runIngestPipeline(attJobId, buf, att.Name).catch((err) => {
        logger.error({ err, jobId: attJobId }, 'email attachment pipeline failed');
      });
    }

    return reply.send(
      successEnvelope({ job_ids: jobIds, email_from: emailFrom, subject: emailSubject }, req.requestId),
    );
  });

  /**
   * GET /v3/ingest/jobs/:id — single job status
   */
  app.get('/v3/ingest/jobs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const res = await pool.query(
      `SELECT * FROM ingest_jobs WHERE id = $1`,
      [id],
    );

    if (!res.rows[0]) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Ingest job not found', req.requestId),
      );
    }

    return reply.send(successEnvelope(res.rows[0], req.requestId));
  });

  /**
   * GET /v3/ingest/jobs — list with filters
   */
  app.get('/v3/ingest/jobs', async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (q.status) {
      conditions.push(`status = $${idx++}`);
      params.push(q.status);
    }
    if (q.surface) {
      conditions.push(`target_surface = $${idx++}`);
      params.push(q.surface);
    }
    if (q.owner) {
      conditions.push(`owner = $${idx++}`);
      params.push(q.owner);
    }
    if (q.source) {
      conditions.push(`source = $${idx++}`);
      params.push(q.source);
    }
    if (q.from_date) {
      conditions.push(`created_at >= $${idx++}`);
      params.push(q.from_date);
    }
    if (q.to_date) {
      conditions.push(`created_at <= $${idx++}`);
      params.push(q.to_date);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(parseInt(q.limit ?? '50', 10), 200);
    const offset = parseInt(q.offset ?? '0', 10);

    params.push(limit);
    params.push(offset);

    const res = await pool.query(
      `SELECT * FROM ingest_jobs ${where}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      params,
    );

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM ingest_jobs ${where}`,
      params.slice(0, -2),
    );

    return reply.send(
      successEnvelope({
        jobs: res.rows,
        pagination: {
          total: countRes.rows[0]?.total ?? 0,
          limit,
          offset,
        },
      }, req.requestId),
    );
  });

  /**
   * POST /v3/decision-memory/classification-correction — user reclassification.
   * Records correction and feeds F-302 retraining queue.
   */
  app.post('/v3/decision-memory/classification-correction', async (req, reply) => {
    const body = req.body as {
      ingest_job_id: string;
      corrected_surface: string;
      corrected_entity_type: string;
      rationale?: string;
    } | undefined;

    if (!body?.ingest_job_id || !body.corrected_surface || !body.corrected_entity_type) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'ingest_job_id, corrected_surface, corrected_entity_type are required', req.requestId),
      );
    }

    // Fetch original classification
    const jobRes = await pool.query(
      'SELECT target_surface, entity_type FROM ingest_jobs WHERE id = $1',
      [body.ingest_job_id],
    );
    if (!jobRes.rows[0]) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Ingest job not found', req.requestId),
      );
    }

    const original = jobRes.rows[0];
    const correctionId = randomUUID();
    const actor = getActor(req);

    // Insert correction record
    await pool.query(
      `INSERT INTO ingest_classification_corrections
       (id, ingest_job_id, original_surface, original_entity_type, corrected_surface, corrected_entity_type, corrected_by, rationale)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        correctionId, body.ingest_job_id,
        original.target_surface, original.entity_type,
        body.corrected_surface, body.corrected_entity_type,
        actor, body.rationale ?? null,
      ],
    );

    // Update the job with corrected classification
    await pool.query(
      `UPDATE ingest_jobs SET target_surface = $1, entity_type = $2, updated_at = NOW() WHERE id = $3`,
      [body.corrected_surface, body.corrected_entity_type, body.ingest_job_id],
    );

    // Feed decision memory (F-302)
    try {
      await pool.query(
        `INSERT INTO agent_decisions (id, kind, entity_kind, entity_id, rationale, evidence_refs, made_by)
         VALUES ($1, 'exclusion_override', 'document', $2, $3, $4, $5)`,
        [
          randomUUID(),
          body.ingest_job_id,
          `Classification corrected: ${original.target_surface}/${original.entity_type} → ${body.corrected_surface}/${body.corrected_entity_type}. ${body.rationale ?? ''}`.trim(),
          JSON.stringify([{ source_url: `ingest_job:${body.ingest_job_id}`, source_type: 'classification_correction', grade: 'A' }]),
          actor,
        ],
      );
    } catch (err) {
      logger.warn({ err }, 'Failed to record classification correction in decision memory');
    }

    return reply.send(
      successEnvelope({
        correction_id: correctionId,
        original: { surface: original.target_surface, entity_type: original.entity_type },
        corrected: { surface: body.corrected_surface, entity_type: body.corrected_entity_type },
      }, req.requestId),
    );
  });
}

/**
 * Full ingest pipeline: extract → PII check → classify → route.
 */
async function runIngestPipeline(jobId: string, buf: Buffer, filename: string): Promise<void> {
  try {
    // Step 1: Extract text
    await pool.query(
      `UPDATE ingest_jobs SET status = 'extracting', updated_at = NOW() WHERE id = $1`,
      [jobId],
    );

    let extractedText = '';
    try {
      extractedText = await extractTextFromBuffer(buf, filename);
    } catch (err) {
      logger.warn({ err, jobId, filename }, 'Text extraction failed');
    }

    if (!extractedText || extractedText.trim().length === 0) {
      await pool.query(
        `UPDATE ingest_jobs SET status = 'failed', error_message = 'No text could be extracted', error_step = 'extract', updated_at = NOW() WHERE id = $1`,
        [jobId],
      );
      return;
    }

    // Store extracted text
    await pool.query(
      `UPDATE ingest_jobs SET extracted_text = $1, updated_at = NOW() WHERE id = $2`,
      [extractedText, jobId],
    );

    // Step 2: PII detection and redaction (must run BEFORE classifier)
    const hasPii = detectPii(extractedText);
    let classifierText = extractedText;
    if (hasPii) {
      classifierText = redactPii(extractedText);
      await pool.query(
        `UPDATE ingest_jobs SET pii_detected = TRUE, pii_redacted = TRUE, updated_at = NOW() WHERE id = $1`,
        [jobId],
      );
    }

    // Step 3: Classify
    await runClassifyAndRoute(jobId, classifierText, filename);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, jobId }, 'Ingest pipeline error');
    await pool.query(
      `UPDATE ingest_jobs SET status = 'failed', error_message = $1, error_step = 'pipeline', updated_at = NOW() WHERE id = $2`,
      [message, jobId],
    ).catch(() => {});
  }
}

/**
 * Classify document text and route to target surface.
 */
async function runClassifyAndRoute(jobId: string, text: string, filename: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE ingest_jobs SET status = 'classifying', updated_at = NOW() WHERE id = $1`,
      [jobId],
    );

    // Get source surface hint from job record
    const jobRes = await pool.query(
      'SELECT source_surface FROM ingest_jobs WHERE id = $1',
      [jobId],
    );
    const sourceSurface = jobRes.rows[0]?.source_surface ?? null;

    const classification = await classifyDocument(text, filename, sourceSurface);

    await pool.query(
      `UPDATE ingest_jobs SET
         target_surface = $1, entity_type = $2,
         classification_confidence = $3, classification_rationale = $4,
         doctrine_flag = $5, evidence_grade = $6,
         updated_at = NOW()
       WHERE id = $7`,
      [
        classification.surface,
        classification.entity_type,
        classification.confidence,
        classification.rationale,
        classification.doctrine_flag ?? null,
        classification.evidence_grade ?? null,
        jobId,
      ],
    );

    // Step 4: Route
    await pool.query(
      `UPDATE ingest_jobs SET status = 'routing', updated_at = NOW() WHERE id = $1`,
      [jobId],
    );

    const routeResult = await routeToSurface(jobId, classification);

    await pool.query(
      `UPDATE ingest_jobs SET
         status = 'routed',
         target_entity_id = $1, action_item_id = $2,
         completed_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [routeResult.target_entity_id ?? null, routeResult.action_item_id ?? null, jobId],
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, jobId }, 'Classify/route error');
    await pool.query(
      `UPDATE ingest_jobs SET status = 'failed', error_message = $1, error_step = 'classify_route', updated_at = NOW() WHERE id = $2`,
      [message, jobId],
    ).catch(() => {});
  }
}
