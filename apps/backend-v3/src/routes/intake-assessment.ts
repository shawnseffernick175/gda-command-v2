/**
 * Intake assessment routes — the Intake → Pass / Ops Tracker → Pipeline funnel.
 *
 * Owner rule (binding): AI does ASSESSMENT ONLY. Nothing enters the pipeline
 * unless the user personally promotes it from the Ops Tracker.
 *
 * Endpoints:
 *   GET  /v3/ops-tracker                          — survivors, ranked by AI fit DESC
 *   GET  /v3/intake/pass                          — auto-declined, with reason
 *   POST /v3/intake/:id/rescue                    — move a passed opp back to ops_tracker
 *   POST /v3/ops-tracker/:id/promote             — user-only promote into the pipeline
 *   POST /v3/admin/backfill-auto-pass             — idempotent backfill: auto-pass within-30-day opps
 */

import type { FastifyInstance } from 'fastify';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import type { JwtPayload } from '../middleware/auth.js';
import {
  listOpsTracker,
  listPass,
  rescueToOpsTracker,
  promoteToPipeline,
  PromoteError,
} from '../services/assessment/views.js';
import { runAutoPassDeadline } from '../cron/auto-pass-deadline.js';

interface ListQuery {
  limit?: string;
}

function parseLimit(raw: string | undefined): number {
  const n = parseInt(raw ?? '50', 10);
  if (Number.isNaN(n)) return 50;
  return Math.min(Math.max(n, 1), 200);
}

function requestingUser(req: { user?: JwtPayload }): { owner: string; userId: string | null } {
  const user = req.user;
  const owner = user?.email ?? user?.sub ?? 'unknown';
  const userId = user?.sub ?? null;
  return { owner, userId };
}

export async function intakeAssessmentRoutes(app: FastifyInstance): Promise<void> {
  // GET /v3/ops-tracker — curated survivors, ranked best-fit first
  app.get<{ Querystring: ListQuery }>('/v3/ops-tracker', async (req, reply) => {
    const items = await listOpsTracker(parseLimit(req.query.limit));
    return reply.status(200).send(successEnvelope({ items }, req.requestId));
  });

  // GET /v3/intake/pass — auto-declined opportunities, with reason
  app.get<{ Querystring: ListQuery }>('/v3/intake/pass', async (req, reply) => {
    const items = await listPass(parseLimit(req.query.limit));
    return reply.status(200).send(successEnvelope({ items }, req.requestId));
  });

  // POST /v3/intake/:id/rescue — pull a passed opp back into the Ops Tracker
  app.post<{ Params: { id: string } }>('/v3/intake/:id/rescue', async (req, reply) => {
    const item = await rescueToOpsTracker(req.params.id);
    if (!item) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Opportunity not found or not in pass state', req.requestId),
      );
    }
    return reply.status(200).send(successEnvelope(item, req.requestId));
  });

  // POST /v3/ops-tracker/:id/promote — user-only promotion into the pipeline
  // Optional body.stage selects the target pipeline stage (default 'qualify').
  app.post<{ Params: { id: string } }>('/v3/ops-tracker/:id/promote', async (req, reply) => {
    const { owner, userId } = requestingUser(req as typeof req & { user?: JwtPayload });
    const body = req.body as Record<string, unknown> | undefined;
    const targetStage = (body?.stage as string) ?? 'qualify';
    try {
      const result = await promoteToPipeline(req.params.id, owner, userId, targetStage);
      return reply.status(result.created ? 201 : 200).send(successEnvelope(result, req.requestId));
    } catch (err) {
      if (err instanceof PromoteError) {
        const code = err.statusCode === 404 ? 'NOT_FOUND' : 'VALIDATION_ERROR';
        return reply.status(err.statusCode).send(errorEnvelope(code, err.message, req.requestId));
      }
      throw err;
    }
  });

  // POST /v3/admin/backfill-auto-pass — idempotent backfill (F-601)
  // Immediately auto-passes all opportunities with response_due_at within 30
  // days that still have relevance_status NULL or 'relevant'. Safe: only flips
  // a reversible status (no deletes). Operator runs this manually in prod.
  app.post('/v3/admin/backfill-auto-pass', async (req, reply) => {
    const body = req.body as Record<string, unknown> | undefined;
    const dryRun = body?.dry_run === true;
    const result = await runAutoPassDeadline({ dryRun });
    return reply.status(200).send(successEnvelope({
      ...result,
      dry_run: dryRun,
      message: dryRun
        ? `Dry run: ${result.passed} opportunities would be auto-passed`
        : `Backfill complete: ${result.passed} opportunities auto-passed`,
    }, req.requestId));
  });
}
