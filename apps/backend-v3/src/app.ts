import Fastify from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyCors from '@fastify/cors';
import { config } from './config/index.js';
import { logger } from './lib/logger.js';
import { requestIdHook } from './middleware/requestId.js';
import { authHook } from './middleware/auth.js';
import { systemRoutes } from './routes/system.js';
import { opportunityRoutes } from './routes/opportunities.js';
import { captureRoutes } from './routes/captures.js';
import { pipelineRoutes } from './routes/pipeline.js';
import { webhookRoutes } from './routes/webhooks.js';
import { launchpadRoutes } from './routes/launchpad.js';
import { sourceRoutes } from './routes/sources.js';
import { partnerRoutes } from './routes/partners.js';
import { actionItemRoutes } from './routes/action-items.js';
import { errorEnvelope } from './lib/envelope.js';
import { httpRequestsTotal } from './lib/metrics.js';

export async function buildApp() {
  const app = Fastify({
    logger: false,
    trustProxy: true,
  });

  await app.register(fastifyCors, { origin: true });

  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'GDA Command V3 API',
        version: config.version,
        description: 'V3 API contract for GDA Command — Envision-only, single-tenant.',
      },
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: '/v3/docs',
  });

  app.decorateRequest('rawBody', undefined);

  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body, done) => {
      (req as typeof req & { rawBody: Buffer }).rawBody = Buffer.isBuffer(body) ? body : Buffer.from(body);
      try {
        const parsed = body.length > 0 ? JSON.parse(body.toString()) : undefined;
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  app.addHook('onRequest', requestIdHook);
  app.addHook('onRequest', authHook);

  app.addHook('onResponse', (req, reply, done) => {
    const route = req.routeOptions?.url ?? req.url;
    httpRequestsTotal.inc({
      method: req.method,
      route,
      status: String(reply.statusCode),
    });
    logger.info({
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      statusCode: reply.statusCode,
      responseTime: reply.elapsedTime,
    }, 'request completed');
    done();
  });

  app.setErrorHandler((error, req, reply) => {
    const requestId = req.requestId ?? 'unknown';
    const err = error as Error & { statusCode?: number };
    logger.error({
      err,
      requestId,
      userId: (req as typeof req & { user?: { sub: string } }).user?.sub,
      stack: err.stack,
    }, 'Unhandled error');

    const statusCode = err.statusCode ?? 500;
    const body = errorEnvelope(
      statusCode === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
      err.message || 'An unexpected error occurred',
      requestId
    );
    return reply.status(statusCode).send(body);
  });

  await app.register(systemRoutes);
  await app.register(opportunityRoutes);
  await app.register(captureRoutes);
  await app.register(pipelineRoutes);
  await app.register(launchpadRoutes);
  await app.register(sourceRoutes);
  await app.register(partnerRoutes);
  await app.register(actionItemRoutes);
  await app.register(async (instance) => {
    await instance.register(webhookRoutes);
  });

  return app;
}
