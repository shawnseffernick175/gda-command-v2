import Fastify from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
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
import { soakRoutes } from './routes/soak.js';
import { fasTracRoutes } from './routes/fastrac.js';
import { regulatoryRoutes } from './routes/regulatory.js';
import { authRoutes } from './routes/auth.js';
import { systemHealthRoutes } from './routes/health.js';
import { adminIngestRoutes } from './routes/admin/ingest.js';
import { ragRoutes } from './routes/rag.js';
import { govtribeRoutes } from './routes/govtribe.js';
import { govtribeSavedSearchRoutes } from './routes/govtribe-saved-search.js';
import { govwinRoutes } from './routes/govwin.js';
import { sentinelRoutes } from './routes/sentinel.js';
import { colorTeamRoutes } from './routes/color-teams.js';
import { doctrineRoutes } from './routes/doctrine.js';
import { memoryRoutes } from './routes/memory.js';
import { pwinRoutes } from './routes/pwin.js';
import { pwinConfigRoutes } from './routes/pwin-config.js';
import { awardRoutes } from './routes/awards.js';
import { agentRoutes } from './routes/agent.js';
import { auditRoutes } from './routes/audit.js';
import { reportRoutes } from './routes/reports.js';
import { llmCostRollupRoutes } from './routes/llm-cost-rollup.js';
import { contactsRoutes } from './routes/contacts.js';
import { competitorsRoutes } from './routes/competitors.js';
import { adminUsersRoutes } from './routes/admin-users.js';
import { risksRoutes } from './routes/risks.js';
import { financialsRoutes } from './routes/financials.js';
import { captureWorkflowRoutes } from './routes/capture-workflow.js';
import { vaultRoutes } from './routes/vault.js';
import { fasTracSignalRoutes } from './routes/fastrac-signals.js';
import { fastracBidirectionalRoutes } from './routes/fastrac-bidirectional.js';
import { promptLibraryRoutes } from './routes/prompt-library.js';
import { digestRoutes } from './routes/digest.js';
import { ingestStatusRoutes } from './routes/ingest-status.js';
import { vehicleRoutes } from './routes/vehicles.js';
import { idiqOpsRoutes } from './routes/idiq-ops.js';
import { overrideRoutes } from './routes/overrides.js';
import { workshopRoutes } from './routes/workshop.js';
import { scoringDoctrineRoutes } from './routes/scoring-doctrine.js';
import { pipelineCoverageRoutes } from './routes/pipeline-coverage.js';
import { captureReviewRoutes } from './routes/capture-reviews.js';
import { intakeAssessmentRoutes } from './routes/intake-assessment.js';
import { qaChecklistRoutes } from './routes/qa-checklist.js';
import { errorEnvelope } from './lib/envelope.js';
import { httpRequestsTotal } from './lib/metrics.js';

export async function buildApp() {
  const app = Fastify({
    logger: false,
    trustProxy: true,
  });

  const corsOrigins = (process.env['CORS_ALLOWED_ORIGINS'] || 'https://gda.csr-llc.tech')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  await app.register(fastifyCors, { origin: corsOrigins, credentials: true });
  await app.register(fastifyCookie);

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  await app.register(fastifyRateLimit, {
    max: 300,
    timeWindow: '1 minute',
    allowList: (req) => {
      const url = req.url ?? '';
      return url.startsWith('/v3/health') || url === '/v3/metrics';
    },
  });

  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Envision V3 API',
        version: config.version,
        description: 'V3 API contract for Envision — single-tenant.',
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
    const statusCode = err.statusCode ?? 500;

    const logPayload = {
      err,
      requestId,
      userId: (req as typeof req & { user?: { sub: string } }).user?.sub,
      stack: err.stack,
    };
    if (statusCode === 429) {
      logger.warn(logPayload, 'Rate limit exceeded');
    } else {
      logger.error(logPayload, 'Unhandled error');
    }
    const body = errorEnvelope(
      statusCode === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
      err.message || 'An unexpected error occurred',
      requestId
    );
    return reply.status(statusCode).send(body);
  });

  await app.register(systemHealthRoutes);
  await app.register(authRoutes);
  await app.register(systemRoutes);
  await app.register(opportunityRoutes);
  await app.register(captureRoutes);
  await app.register(pipelineRoutes);
  await app.register(launchpadRoutes);
  await app.register(fasTracRoutes);
  await app.register(fasTracSignalRoutes);
  await app.register(fastracBidirectionalRoutes);
  await app.register(sourceRoutes);
  await app.register(partnerRoutes);
  await app.register(actionItemRoutes);
  await app.register(soakRoutes);
  await app.register(regulatoryRoutes);
  await app.register(colorTeamRoutes);
  await app.register(doctrineRoutes);
  await app.register(adminIngestRoutes);
  await app.register(ragRoutes);
  await app.register(govtribeRoutes);
  await app.register(govtribeSavedSearchRoutes);
  if (process.env['GOVWIN_CONNECTOR_V1'] === 'true') {
    await app.register(govwinRoutes);
  }
  await app.register(sentinelRoutes);
  await app.register(ingestStatusRoutes);
  await app.register(memoryRoutes);
  await app.register(pwinRoutes);
  await app.register(pwinConfigRoutes);
  await app.register(awardRoutes);
  await app.register(agentRoutes);
  await app.register(auditRoutes);
  await app.register(reportRoutes);
  await app.register(llmCostRollupRoutes);
  await app.register(contactsRoutes);
  await app.register(competitorsRoutes);
  await app.register(risksRoutes);
  await app.register(financialsRoutes);
  await app.register(captureWorkflowRoutes);
  await app.register(vaultRoutes);
  await app.register(adminUsersRoutes);
  await app.register(promptLibraryRoutes);
  await app.register(digestRoutes);
  await app.register(vehicleRoutes);
  await app.register(idiqOpsRoutes);
  await app.register(overrideRoutes);
  await app.register(workshopRoutes);
  await app.register(scoringDoctrineRoutes);
  await app.register(pipelineCoverageRoutes);
  await app.register(captureReviewRoutes);
  await app.register(intakeAssessmentRoutes);
  await app.register(qaChecklistRoutes);
  await app.register(async (instance) => {
    await instance.register(webhookRoutes);
  });

  return app;
}
