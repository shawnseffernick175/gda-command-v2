import type { FastifyInstance } from 'fastify';
import { config } from '../config/index.js';
import { pool } from '../lib/db.js';
import { requireBoss, QUEUE_NAMES, type AnalysisJobData } from '../lib/queue.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { analysisCacheHits, analysisTimeoutCount } from '../lib/metrics.js';

interface CaptureRow {
  id: string;
  opportunity_id: string;
  status: string;
  analysis: Record<string, unknown> | null;
  analysis_version: string | null;
  ai_analyzed_at: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

function isCacheFresh(row: CaptureRow): boolean {
  if (!row.analysis || !row.analysis_version || !row.ai_analyzed_at) return false;
  if (row.analysis_version !== config.analysisVersion) return false;
  return new Date(row.ai_analyzed_at) >= new Date(row.updated_at);
}

async function waitForAnalysis(
  captureId: string,
  timeoutMs: number,
  pollMs: number
): Promise<CaptureRow | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await pool.query<CaptureRow>(
      'SELECT * FROM captures WHERE id = $1',
      [captureId]
    );
    const row = res.rows[0];
    if (row && isCacheFresh(row)) return row;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return null;
}

export async function captureRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>('/v3/captures/:id', async (req, reply) => {
    const { id } = req.params;

    const res = await pool.query<CaptureRow>(
      'SELECT * FROM captures WHERE id = $1',
      [id]
    );

    const row = res.rows[0];
    if (!row) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Resource not found', req.requestId)
      );
    }

    if (isCacheFresh(row)) {
      analysisCacheHits.inc();
      return reply.status(200).send(successEnvelope(row, req.requestId));
    }

    const boss = requireBoss();
    const jobData: AnalysisJobData = {
      entityType: 'capture',
      entityId: id,
      priority: 'high',
      trigger: 'detail-endpoint',
    };
    await boss.send(QUEUE_NAMES.ANALYSIS_CAPTURE, jobData, {
      priority: 1,
      retryLimit: 3,
      retryDelay: 5,
      retryBackoff: true,
      singletonKey: `cap-${id}`,
    });

    const fresh = await waitForAnalysis(id, config.analysisTimeoutMs, config.analysisPollIntervalMs);
    if (fresh) {
      analysisCacheHits.inc();
      return reply.status(200).send(successEnvelope(fresh, req.requestId));
    }

    analysisTimeoutCount.inc();
    return reply.status(503).send(
      errorEnvelope(
        'ANALYSIS_TIMEOUT',
        'Analysis not ready, retry in a few seconds',
        req.requestId,
        'estimated_seconds=8'
      )
    );
  });
}
