import type { FastifyInstance } from 'fastify';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config/index.js';
import { checkDbConnection, checkMigrationsCurrent, pool } from '../lib/db.js';
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

    let schemaVersion: string | null = null;
    if (dbOk) {
      try {
        const client = await pool.connect();
        try {
          const res = await client.query<{ name: string }>(
            `SELECT name FROM pgmigrations ORDER BY run_on DESC, id DESC LIMIT 1`
          );
          schemaVersion = res.rows[0]?.name ?? null;
        } finally {
          client.release();
        }
      } catch {
        // pgmigrations may not exist yet
      }
    }

    const body = {
      status: ready ? 'ready' : 'not_ready',
      checks: {
        database: dbOk ? 'connected' : 'disconnected',
        pgBoss: bossOk ? 'started' : 'stopped',
        migrations,
        schema_version: schemaVersion,
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

  app.get('/v3/health/schema', async (req, reply) => {
    try {
      const client = await pool.connect();
      try {
        const versionRes = await client.query<{ name: string; run_on: Date }>(
          `SELECT name, run_on FROM pgmigrations ORDER BY run_on DESC, id DESC LIMIT 1`
        );
        const latest = versionRes.rows[0];
        const version = latest?.name ?? null;
        const lastMigrationAt = latest?.run_on?.toISOString() ?? null;

        const countRes = await client.query<{ total: string }>(
          `SELECT count(*) AS total FROM pgmigrations`
        );
        const appliedCount = parseInt(countRes.rows[0]?.total ?? '0', 10);

        const here = dirname(fileURLToPath(import.meta.url));
        const migrationsDir = resolve(here, '..', '..', 'migrations');
        let onDiskCount = 0;
        try {
          onDiskCount = readdirSync(migrationsDir).filter(
            (f) => f.endsWith('.sql') && f.startsWith('v3_')
          ).length;
        } catch {
          // migrations dir may not be present in dev
        }

        const driftDetected = onDiskCount > 0 && appliedCount !== onDiskCount;

        const body = successEnvelope(
          {
            version,
            applied_count: appliedCount,
            on_disk_count: onDiskCount,
            drift_detected: driftDetected,
            last_migration_at: lastMigrationAt,
          },
          req.requestId
        );
        return reply.status(200).send(body);
      } finally {
        client.release();
      }
    } catch (err) {
      const body = successEnvelope(
        {
          version: null,
          applied_count: 0,
          on_disk_count: 0,
          drift_detected: true,
          last_migration_at: null,
          error: 'Failed to query migration state',
        },
        req.requestId
      );
      return reply.status(200).send(body);
    }
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
