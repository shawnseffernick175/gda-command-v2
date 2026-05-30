import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config/index.js';
import { checkDbConnection, checkMigrationsCurrent } from '../lib/db.js';
import { getBoss, QUEUE_NAMES } from '../lib/queue.js';
import { register } from '../lib/metrics.js';
import { successEnvelope, buildMeta } from '../lib/envelope.js';

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v3/health', async (req, reply) => {
    const body = successEnvelope(
      { status: 'ok', version: config.gitSha },
      req.requestId
    );
    return reply.status(200).send(body);
  });

  app.get('/v3/ready', async (req, reply) => {
    const dbOk = await checkDbConnection();

    const bossOk = getBoss() !== null;

    const migrations = await checkMigrationsCurrent();
    const ready = dbOk && bossOk && migrations === 'current';

    const body = {
      status: ready ? 'ready' : 'not_ready',
      checks: {
        database: dbOk ? 'connected' : 'disconnected',
        pgBoss: bossOk ? 'started' : 'stopped',
        migrations,
      },
      timestamp: new Date().toISOString(),
    };

    return reply.status(ready ? 200 : 503).send(body);
  });

  app.get('/v3/version', async (_req, reply) => {
    const bossInstance = getBoss();
    let queueDepths: Record<string, number> = {};
    if (bossInstance) {
      try {
        const sizes = await Promise.all(
          Object.values(QUEUE_NAMES).map(async (name) => {
            const size = await bossInstance.getQueueSize(name);
            return [name, size] as const;
          })
        );
        queueDepths = Object.fromEntries(sizes);
      } catch {
        queueDepths = {};
      }
    }

    return reply.status(200).send({
      version: config.version,
      commit: config.gitSha,
      built_at: new Date().toISOString(),
      node_version: process.version,
      model_versions: {
        analysis: config.analysisVersion,
      },
      queue_depths: queueDepths,
    });
  });

  app.get('/v3/metrics', async (_req, reply) => {
    const metrics = await register.metrics();
    return reply
      .header('content-type', register.contentType)
      .status(200)
      .send(metrics);
  });

  app.get('/v3/openapi.yaml', async (_req, reply) => {
    const here = dirname(fileURLToPath(import.meta.url));
    const specPath = resolve(here, '..', '..', '..', '..', 'docs', 'architecture', 'v3', 'openapi-v3.yaml');
    try {
      const content = readFileSync(specPath, 'utf-8');
      return reply.header('content-type', 'text/yaml').status(200).send(content);
    } catch {
      return reply.status(404).send({ error: 'OpenAPI spec not found' });
    }
  });
}
