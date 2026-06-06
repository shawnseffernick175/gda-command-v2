import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import mammoth from 'mammoth';
import { callOpenAIChat } from '../lib/providers/openai.js';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { logger } from '../lib/logger.js';
import { buildRegulatoryContext } from '../utils/regulatory-context.js';

const STAGES = ['blue', 'pink', 'red', 'green', 'white'] as const;
type WorkflowStage = (typeof STAGES)[number];

const STAGE_LABELS: Record<WorkflowStage, string> = {
  blue: 'Draft Strategy',
  pink: 'Initial Review',
  red: 'Mid-Term Review',
  green: 'Final Review',
  white: 'Compliance & Submit Gate',
};

function isValidWorkflowStage(s: string): s is WorkflowStage {
  return (STAGES as readonly string[]).includes(s);
}

async function buildStageAnalysisPrompt(
  stage: WorkflowStage,
  rfpText: string | null,
  title: string | null,
  agency: string | null,
  value: number | null,
): Promise<string> {
  const snippet = rfpText ? rfpText.slice(0, 4000) : '(No RFP text available)';

  // F-620: Inject regulatory context for capture color team reviews
  const regContext = await buildRegulatoryContext({
    keywords: ['proposal', 'color team', 'FAR Part 15', 'source selection', 'evaluation criteria'],
    categories: ['FAR', 'DFARS'],
    limit: 10,
  });

  return `You are a defense contracting analyst at Envision conducting a ${STAGE_LABELS[stage]} review.

Never fabricate facts, names, dollar amounts, dates, regulation citations, or clause numbers. If data is unavailable, say so explicitly.
Write as a sharp defense contracting analyst briefing an executive. Be direct, specific, confident. No AI preamble, no hedging language, no bullet soup.

Proposal text:
${snippet}

Capture context:
- Title: ${title ?? 'Unknown'}
- Agency: ${agency ?? 'Unknown'}
- Value: ${value != null ? `$${value.toLocaleString()}` : 'Unknown'}
- Stage: ${STAGE_LABELS[stage]}

Return JSON with this exact shape:
{
  "summary": "2–3 sentence executive summary of proposal strength at this stage",
  "strengths": ["...","..."],
  "weaknesses": ["...","..."],
  "action_items": ["...","..."],
  "gate_recommendation": "go | no_go | conditional",
  "gate_rationale": "1–2 sentences explaining why",
  "model_used": "gpt-4o-mini"
}${regContext}`;
}

interface StageRow {
  id: number;
  capture_id: number;
  stage: string;
  status: string;
  reviewer: string | null;
  gate_decision: string | null;
  gate_note: string | null;
  ai_analysis: Record<string, unknown> | null;
  ai_ran_at: string | null;
  version_snapshot: Record<string, unknown> | null;
  snapshot_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AnnotationRow {
  id: number;
  stage_id: number;
  author: string;
  body: string;
  created_at: string;
}

interface CaptureMinimal {
  id: number;
  pipeline_item_id: string;
  rfp_text: string | null;
  rfp_filename: string | null;
  rfp_uploaded_at: string | null;
  entry_point: string;
}

async function getCaptureContext(captureId: string): Promise<{ title: string | null; agency: string | null; value: number | null }> {
  const res = await pool.query<{ title: string | null; agency: string | null; value: number | null }>(
    `SELECT o.title, o.agency, pi.value
     FROM captures c
     LEFT JOIN pipeline_items pi ON pi.id = c.pipeline_item_id
     LEFT JOIN opportunities o ON o.id = pi.opportunity_id AND o.deleted_at IS NULL
     WHERE c.id = $1`,
    [captureId],
  );
  return res.rows[0] ?? { title: null, agency: null, value: null };
}

async function ensureStagesExist(captureId: number, entryPoint: string): Promise<void> {
  for (const stage of STAGES) {
    let defaultStatus = 'pending';
    if (entryPoint === 'full_pipeline' && stage === 'blue') {
      defaultStatus = 'in_progress';
    } else if (entryPoint === 'white_only') {
      if (stage === 'white') defaultStatus = 'in_progress';
      else defaultStatus = 'skipped';
    }
    await pool.query(
      `INSERT INTO capture_color_stages (capture_id, stage, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (capture_id, stage) DO NOTHING`,
      [captureId, stage, defaultStatus],
    );
  }
}

export async function captureWorkflowRoutes(app: FastifyInstance): Promise<void> {
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  // POST /v3/captures/:id/upload-rfp
  app.post<{ Params: { id: string } }>('/v3/captures/:id/upload-rfp', async (req, reply) => {
    const { id } = req.params;

    const captureRes = await pool.query<CaptureMinimal>('SELECT id FROM captures WHERE id = $1', [id]);
    if (!captureRes.rows[0]) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Capture not found', req.requestId));
    }

    const data = await req.file();
    if (!data) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'No file uploaded', req.requestId));
    }

    const filename = data.filename;
    const buf = await data.toBuffer();
    const ext = filename.split('.').pop()?.toLowerCase();

    let extractedText = '';
    if (ext === 'pdf') {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      const textResult = await parser.getText();
      extractedText = textResult.text ?? '';
      await parser.destroy();
    } else if (ext === 'docx') {
      const result = await mammoth.extractRawText({ buffer: buf });
      extractedText = result.value;
    } else {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'Only PDF and DOCX files are supported', req.requestId));
    }

    await pool.query(
      `UPDATE captures SET rfp_filename = $1, rfp_text = $2, rfp_uploaded_at = NOW(), updated_at = NOW() WHERE id = $3`,
      [filename, extractedText, id],
    );

    return reply.status(200).send(
      successEnvelope({ rfp_filename: filename, char_count: extractedText.length }, req.requestId),
    );
  });

  // GET /v3/captures/:id/stages
  app.get<{ Params: { id: string } }>('/v3/captures/:id/stages', async (req, reply) => {
    const { id } = req.params;

    const captureRes = await pool.query<CaptureMinimal>(
      'SELECT id, pipeline_item_id, rfp_text, rfp_filename, rfp_uploaded_at, entry_point FROM captures WHERE id = $1',
      [id],
    );
    const capture = captureRes.rows[0];
    if (!capture) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Capture not found', req.requestId));
    }

    await ensureStagesExist(capture.id, capture.entry_point);

    const stagesRes = await pool.query<StageRow>(
      `SELECT * FROM capture_color_stages WHERE capture_id = $1 ORDER BY array_position(ARRAY['blue','pink','red','green','white'], stage)`,
      [id],
    );

    const stageIds = stagesRes.rows.map((s) => s.id);
    let annotations: AnnotationRow[] = [];
    if (stageIds.length > 0) {
      const annRes = await pool.query<AnnotationRow>(
        `SELECT * FROM capture_stage_annotations WHERE stage_id = ANY($1) ORDER BY created_at ASC`,
        [stageIds],
      );
      annotations = annRes.rows;
    }

    const stages = stagesRes.rows.map((s) => ({
      ...s,
      annotations: annotations.filter((a) => a.stage_id === s.id),
    }));

    return reply.status(200).send(successEnvelope({ stages }, req.requestId));
  });

  // PATCH /v3/captures/:id/stages/:stage
  app.patch<{ Params: { id: string; stage: string }; Body: { status?: string; reviewer?: string; gate_decision?: string; gate_note?: string } }>(
    '/v3/captures/:id/stages/:stage',
    async (req, reply) => {
      const { id, stage } = req.params;
      if (!isValidWorkflowStage(stage)) {
        return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', `Invalid stage: ${stage}`, req.requestId));
      }

      const body = req.body as { status?: string; reviewer?: string; gate_decision?: string; gate_note?: string } | undefined;
      const sets: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (body?.status) {
        sets.push(`status = $${idx++}`);
        params.push(body.status);
      }
      if (body?.reviewer !== undefined) {
        sets.push(`reviewer = $${idx++}`);
        params.push(body.reviewer);
      }
      if (body?.gate_decision !== undefined) {
        sets.push(`gate_decision = $${idx++}`);
        params.push(body.gate_decision);
      }
      if (body?.gate_note !== undefined) {
        sets.push(`gate_note = $${idx++}`);
        params.push(body.gate_note);
      }

      if (sets.length === 0) {
        return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'No fields to update', req.requestId));
      }

      sets.push(`updated_at = NOW()`);

      const res = await pool.query<StageRow>(
        `UPDATE capture_color_stages SET ${sets.join(', ')} WHERE capture_id = $${idx++} AND stage = $${idx} RETURNING *`,
        [...params, id, stage],
      );

      if (!res.rows[0]) {
        return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Stage not found', req.requestId));
      }

      const row = res.rows[0];

      // Auto-trigger AI analysis when status changes to in_progress
      if (body?.status === 'in_progress' && !row.ai_analysis) {
        try {
          const capture = (await pool.query<CaptureMinimal>('SELECT id, rfp_text, entry_point, pipeline_item_id, rfp_filename, rfp_uploaded_at FROM captures WHERE id = $1', [id])).rows[0];
          const ctx = await getCaptureContext(id);
          const prompt = await buildStageAnalysisPrompt(stage, capture?.rfp_text ?? null, ctx.title, ctx.agency, ctx.value);
          const chatResult = await callOpenAIChat({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.3,
          });
          const analysisText = chatResult.text;
          const analysis = JSON.parse(analysisText);

          await pool.query(
            `UPDATE capture_color_stages SET ai_analysis = $1, ai_ran_at = NOW(), updated_at = NOW() WHERE capture_id = $2 AND stage = $3`,
            [JSON.stringify(analysis), id, stage],
          );
        } catch (err) {
          logger.warn({ err, captureId: id, stage }, 'Auto AI analysis failed on stage activation');
        }
      }

      // Re-fetch with annotations
      const updated = await pool.query<StageRow>('SELECT * FROM capture_color_stages WHERE capture_id = $1 AND stage = $2', [id, stage]);
      const annRes = await pool.query<AnnotationRow>('SELECT * FROM capture_stage_annotations WHERE stage_id = $1 ORDER BY created_at ASC', [updated.rows[0]!.id]);

      return reply.status(200).send(
        successEnvelope({ ...updated.rows[0], annotations: annRes.rows }, req.requestId),
      );
    },
  );

  // POST /v3/captures/:id/stages/:stage/analyze
  app.post<{ Params: { id: string; stage: string } }>('/v3/captures/:id/stages/:stage/analyze', async (req, reply) => {
    const { id, stage } = req.params;
    if (!isValidWorkflowStage(stage)) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', `Invalid stage: ${stage}`, req.requestId));
    }

    const capture = (await pool.query<CaptureMinimal>('SELECT id, rfp_text, entry_point, pipeline_item_id, rfp_filename, rfp_uploaded_at FROM captures WHERE id = $1', [id])).rows[0];
    if (!capture) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Capture not found', req.requestId));
    }

    const ctx = await getCaptureContext(id);
    const prompt = await buildStageAnalysisPrompt(stage, capture.rfp_text, ctx.title, ctx.agency, ctx.value);

    const chatResult = await callOpenAIChat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const analysisText = chatResult.text;
    const analysis = JSON.parse(analysisText);

    await pool.query(
      `UPDATE capture_color_stages SET ai_analysis = $1, ai_ran_at = NOW(), updated_at = NOW() WHERE capture_id = $2 AND stage = $3`,
      [JSON.stringify(analysis), id, stage],
    );

    return reply.status(200).send(successEnvelope(analysis, req.requestId));
  });

  // POST /v3/captures/:id/stages/:stage/snapshot
  app.post<{ Params: { id: string; stage: string } }>('/v3/captures/:id/stages/:stage/snapshot', async (req, reply) => {
    const { id, stage } = req.params;
    if (!isValidWorkflowStage(stage)) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', `Invalid stage: ${stage}`, req.requestId));
    }

    const capture = (await pool.query<CaptureMinimal>('SELECT id, rfp_text, rfp_filename, entry_point, pipeline_item_id, rfp_uploaded_at FROM captures WHERE id = $1', [id])).rows[0];
    if (!capture) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Capture not found', req.requestId));
    }

    const stageRow = (await pool.query<StageRow>('SELECT * FROM capture_color_stages WHERE capture_id = $1 AND stage = $2', [id, stage])).rows[0];
    if (!stageRow) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Stage not found', req.requestId));
    }

    const snapshot = {
      rfp_text: capture.rfp_text,
      stage,
      status: stageRow.status,
      reviewer: stageRow.reviewer,
      gate_decision: stageRow.gate_decision,
      gate_note: stageRow.gate_note,
      ai_analysis: stageRow.ai_analysis,
      captured_at: new Date().toISOString(),
    };

    await pool.query(
      `UPDATE capture_color_stages SET version_snapshot = $1, snapshot_at = NOW(), updated_at = NOW() WHERE capture_id = $2 AND stage = $3`,
      [JSON.stringify(snapshot), id, stage],
    );

    return reply.status(200).send(successEnvelope({ snapshot, snapshot_at: new Date().toISOString() }, req.requestId));
  });

  // POST /v3/captures/:id/stages/:stage/annotations
  app.post<{ Params: { id: string; stage: string }; Body: { author?: string; body: string } }>(
    '/v3/captures/:id/stages/:stage/annotations',
    async (req, reply) => {
      const { id, stage } = req.params;
      if (!isValidWorkflowStage(stage)) {
        return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', `Invalid stage: ${stage}`, req.requestId));
      }

      const body = req.body as { author?: string; body: string } | undefined;
      if (!body?.body) {
        return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'body is required', req.requestId));
      }

      const stageRow = (await pool.query<StageRow>('SELECT id FROM capture_color_stages WHERE capture_id = $1 AND stage = $2', [id, stage])).rows[0];
      if (!stageRow) {
        return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Stage not found', req.requestId));
      }

      await pool.query(
        `INSERT INTO capture_stage_annotations (stage_id, author, body) VALUES ($1, $2, $3)`,
        [stageRow.id, body.author ?? 'Analyst', body.body],
      );

      const annRes = await pool.query<AnnotationRow>(
        'SELECT * FROM capture_stage_annotations WHERE stage_id = $1 ORDER BY created_at ASC',
        [stageRow.id],
      );

      return reply.status(201).send(successEnvelope({ annotations: annRes.rows }, req.requestId));
    },
  );

  // DELETE /v3/captures/:id/stages/:stage/annotations/:annotationId
  app.delete<{ Params: { id: string; stage: string; annotationId: string } }>(
    '/v3/captures/:id/stages/:stage/annotations/:annotationId',
    async (req, reply) => {
      const { id, stage, annotationId } = req.params;
      if (!isValidWorkflowStage(stage)) {
        return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', `Invalid stage: ${stage}`, req.requestId));
      }

      const stageRow = (await pool.query<StageRow>('SELECT id FROM capture_color_stages WHERE capture_id = $1 AND stage = $2', [id, stage])).rows[0];
      if (!stageRow) {
        return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Stage not found', req.requestId));
      }

      const delRes = await pool.query(
        'DELETE FROM capture_stage_annotations WHERE id = $1 AND stage_id = $2',
        [annotationId, stageRow.id],
      );

      if (delRes.rowCount === 0) {
        return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Annotation not found', req.requestId));
      }

      return reply.status(200).send(successEnvelope({ deleted: true }, req.requestId));
    },
  );
}
