import type { FastifyInstance } from 'fastify';
import { verifyWebhookHmac } from '../middleware/auth.js';
import { successEnvelope } from '../lib/envelope.js';

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', verifyWebhookHmac);

  app.post('/v3/webhooks/sam-opportunity', async (req, reply) => {
    req.log.info('Received SAM opportunity webhook');
    return reply.status(200).send(
      successEnvelope(
        { upserted: 0, skipped: 0, errors: 0 },
        req.requestId
      )
    );
  });

  app.post('/v3/webhooks/fpds-award', async (req, reply) => {
    req.log.info('Received FPDS award webhook');
    return reply.status(200).send(
      successEnvelope(
        { upserted: 0, skipped: 0, errors: 0 },
        req.requestId
      )
    );
  });

  app.post('/v3/webhooks/email-action-item', async (req, reply) => {
    req.log.info('Received email action item webhook');
    return reply.status(201).send(
      successEnvelope(
        { created: false, message: 'Stub — not yet implemented' },
        req.requestId
      )
    );
  });
}
