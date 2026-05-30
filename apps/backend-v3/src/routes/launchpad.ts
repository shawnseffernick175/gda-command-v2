import type { FastifyInstance, FastifyRequest } from 'fastify';
import { successEnvelope } from '../lib/envelope.js';
import { computeSummary } from '../services/launchpad/summary.js';
import { computeFlags } from '../services/launchpad/flags.js';
import {
  getSummaryCache,
  setSummaryCache,
  getFlagsCache,
  setFlagsCache,
} from '../services/launchpad/cache.js';
import type { JwtPayload } from '../middleware/auth.js';

function getUserId(req: FastifyRequest): string {
  return (req as FastifyRequest & { user?: JwtPayload }).user?.sub ?? 'anonymous';
}

export async function launchpadRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v3/launchpad/summary', async (req, reply) => {
    const userId = getUserId(req);
    const cached = getSummaryCache(userId);
    if (cached) {
      return reply
        .header('X-Cache-Hit', 'true')
        .status(200)
        .send(successEnvelope(cached, req.requestId));
    }

    const summary = await computeSummary();
    setSummaryCache(userId, summary);
    return reply
      .header('X-Cache-Hit', 'false')
      .status(200)
      .send(successEnvelope(summary, req.requestId));
  });

  app.get('/v3/launchpad/flags', async (req, reply) => {
    const userId = getUserId(req);
    const cached = getFlagsCache(userId);
    if (cached) {
      return reply
        .header('X-Cache-Hit', 'true')
        .status(200)
        .send(successEnvelope(cached, req.requestId));
    }

    const result = await computeFlags();
    setFlagsCache(userId, result);
    return reply
      .header('X-Cache-Hit', 'false')
      .status(200)
      .send(successEnvelope(result, req.requestId));
  });
}
