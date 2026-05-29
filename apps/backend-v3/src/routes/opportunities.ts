import type { FastifyInstance } from 'fastify';
import { config } from '../config/index.js';
import { pool } from '../lib/db.js';
import { requireBoss, QUEUE_NAMES, type AnalysisJobData } from '../lib/queue.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { analysisCacheHits, analysisTimeoutCount } from '../lib/metrics.js';

interface OpportunityRow {
  id: string;
  title: string;
  agency: string | null;
  sub_agency: string | null;
  solicitation_number: string | null;
  sam_notice_id: string | null;
  status: string;
  grade: string | null;
  grade_evidence: string | null;
  value_min: number | null;
  value_max: number | null;
  naics: string | null;
  psc: string | null;
  set_aside: string | null;
  place_of_performance: string | null;
  response_due_at: string | null;
  posted_at: string | null;
  incumbent: string | null;
  description: string | null;
  tags: string[];
  data_source: string;
  analysis: Record<string, unknown> | null;
  analysis_version: string | null;
  ai_analyzed_at: string | null;
  source_id: string;
  created_at: string;
  updated_at: string;
}

function isCacheFresh(row: OpportunityRow): boolean {
  if (!row.analysis || !row.analysis_version || !row.ai_analyzed_at) return false;
  if (row.analysis_version !== config.analysisVersion) return false;
  return new Date(row.ai_analyzed_at) >= new Date(row.updated_at);
}

async function waitForAnalysis(
  opportunityId: string,
  timeoutMs: number,
  pollMs: number
): Promise<OpportunityRow | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await pool.query<OpportunityRow>(
      'SELECT * FROM opportunities WHERE id = $1 AND deleted_at IS NULL',
      [opportunityId]
    );
    const row = res.rows[0];
    if (row && isCacheFresh(row)) return row;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return null;
}

export async function opportunityRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>('/v3/opportunities/:id', async (req, reply) => {
    const { id } = req.params;

    const res = await pool.query<OpportunityRow>(
      'SELECT * FROM opportunities WHERE id = $1 AND deleted_at IS NULL',
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
      entityType: 'opportunity',
      entityId: id,
      priority: 'high',
      trigger: 'detail-endpoint',
    };
    await boss.send(QUEUE_NAMES.ANALYSIS_OPPORTUNITY, jobData, {
      priority: 1,
      retryLimit: 3,
      retryDelay: 5,
      retryBackoff: true,
      singletonKey: `opp-${id}`,
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
