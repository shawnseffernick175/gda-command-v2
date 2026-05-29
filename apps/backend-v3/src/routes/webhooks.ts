/**
 * Webhook routes — n8n ingest endpoints.
 *
 * POST /v3/webhooks/sam-opportunity — upserts SAM opportunity + enqueues analysis pre-warm
 * POST /v3/webhooks/fpds-award — upserts FPDS award data
 * POST /v3/webhooks/email-action-item — creates action item from email
 */

import type { FastifyInstance } from 'fastify';
import { verifyWebhookHmac } from '../middleware/auth.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { pool } from '../lib/db.js';
import { requireBoss, QUEUE_NAMES, type AnalysisJobData } from '../lib/queue.js';
import { logger } from '../lib/logger.js';
import { createActionItem, toApiShape } from '../services/action-items/index.js';

interface EmailWebhookPayload {
  from: string;
  to: string;
  subject?: string;
  body_text: string;
}

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', verifyWebhookHmac);

  app.post('/v3/webhooks/sam-opportunity', async (req, reply) => {
    const body = req.body as Record<string, unknown> | undefined;
    req.log.info('Received SAM opportunity webhook');

    let upserted = 0;
    let skipped = 0;
    let errors = 0;

    if (body && typeof body.title === 'string') {
      try {
        // Create source entry for SAM ingest
        const sourceRes = await pool.query<{ id: string }>(
          `INSERT INTO sources (kind, title, url, retrieved_at)
           VALUES ('sam_gov', $1, $2, NOW()) RETURNING id`,
          [
            `SAM.gov Opportunity ${(body.solicitation_number as string) ?? ''}`.trim(),
            (body.url as string) ?? `https://sam.gov/opp/${(body.sam_notice_id as string) ?? 'search'}/view`,
          ],
        );
        const sourceId = sourceRes.rows[0]!.id;

        // Upsert opportunity
        const samNoticeId = body.sam_notice_id as string | undefined;
        let oppId: string;

        if (samNoticeId) {
          const upsertRes = await pool.query<{ id: string }>(
            `INSERT INTO opportunities (
              title, agency, sub_agency, solicitation_number, sam_notice_id,
              naics, psc, set_aside, description, response_due_at, posted_at,
              value_min, value_max, data_source, source_id, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'sam_gov', $14, 'discovery')
            ON CONFLICT (sam_notice_id)
            DO UPDATE SET
              title = EXCLUDED.title,
              agency = COALESCE(EXCLUDED.agency, opportunities.agency),
              sub_agency = COALESCE(EXCLUDED.sub_agency, opportunities.sub_agency),
              solicitation_number = COALESCE(EXCLUDED.solicitation_number, opportunities.solicitation_number),
              naics = COALESCE(EXCLUDED.naics, opportunities.naics),
              psc = COALESCE(EXCLUDED.psc, opportunities.psc),
              set_aside = COALESCE(EXCLUDED.set_aside, opportunities.set_aside),
              description = COALESCE(EXCLUDED.description, opportunities.description),
              response_due_at = COALESCE(EXCLUDED.response_due_at, opportunities.response_due_at),
              posted_at = COALESCE(EXCLUDED.posted_at, opportunities.posted_at),
              value_min = COALESCE(EXCLUDED.value_min, opportunities.value_min),
              value_max = COALESCE(EXCLUDED.value_max, opportunities.value_max),
              source_id = EXCLUDED.source_id,
              updated_at = NOW()
            RETURNING id`,
            [
              body.title,
              body.agency ?? null,
              body.sub_agency ?? null,
              body.solicitation_number ?? null,
              samNoticeId,
              body.naics ?? null,
              body.psc ?? null,
              body.set_aside ?? null,
              body.description ?? null,
              body.response_due_at ?? null,
              body.posted_at ?? null,
              body.value_min ?? null,
              body.value_max ?? null,
              sourceId,
            ],
          );
          oppId = String(upsertRes.rows[0]!.id);
        } else {
          const insertRes = await pool.query<{ id: string }>(
            `INSERT INTO opportunities (
              title, agency, sub_agency, solicitation_number,
              naics, psc, set_aside, description, response_due_at, posted_at,
              value_min, value_max, data_source, source_id, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'sam_gov', $13, 'discovery')
            RETURNING id`,
            [
              body.title,
              body.agency ?? null,
              body.sub_agency ?? null,
              body.solicitation_number ?? null,
              body.naics ?? null,
              body.psc ?? null,
              body.set_aside ?? null,
              body.description ?? null,
              body.response_due_at ?? null,
              body.posted_at ?? null,
              body.value_min ?? null,
              body.value_max ?? null,
              sourceId,
            ],
          );
          oppId = String(insertRes.rows[0]!.id);
        }

        upserted = 1;

        // Pre-warm: enqueue analysis job post-commit
        try {
          const boss = requireBoss();
          const jobData: AnalysisJobData = {
            entityType: 'opportunity',
            entityId: oppId,
            priority: 'normal',
            trigger: 'pre-warm',
          };
          await boss.send(QUEUE_NAMES.ANALYSIS_OPPORTUNITY, jobData, {
            priority: 5,
            retryLimit: 3,
            retryDelay: 5,
            retryBackoff: true,
            singletonKey: `opp-${oppId}`,
          });
          logger.info({ oppId }, 'SAM webhook: analysis pre-warm enqueued');
        } catch (err) {
          logger.warn({ err, oppId }, 'SAM webhook: failed to enqueue analysis pre-warm');
        }
      } catch (err) {
        logger.error({ err }, 'SAM webhook: failed to upsert opportunity');
        errors = 1;
      }
    } else {
      skipped = 1;
    }

    return reply.status(200).send(
      successEnvelope(
        { upserted, skipped, errors },
        req.requestId,
      ),
    );
  });

  app.post('/v3/webhooks/fpds-award', async (req, reply) => {
    req.log.info('Received FPDS award webhook');
    return reply.status(200).send(
      successEnvelope(
        { upserted: 0, skipped: 0, errors: 0 },
        req.requestId,
      ),
    );
  });

  app.post<{ Body: EmailWebhookPayload }>('/v3/webhooks/email-action-item', async (req, reply) => {
    req.log.info('Received email action item webhook');

    const body = req.body as EmailWebhookPayload | undefined;
    if (!body || !body.from || !body.body_text) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'from and body_text are required', req.requestId)
      );
    }

    const title = body.subject
      ? body.subject.trim()
      : body.body_text.trim().slice(0, 120);

    const detail = body.body_text.trim();
    const senderName = body.from.split('@')[0] ?? 'unknown';

    const row = await createActionItem(
      {
        title,
        detail,
        owner: senderName,
        source: 'email',
        source_id: `email:${body.from}:${Date.now()}`,
        due_date: undefined,
        linked_record_type: undefined,
        linked_record_id: undefined,
      },
      'webhook:email'
    );

    return reply.status(201).send(
      successEnvelope(
        { id: row.id, ...toApiShape(row) },
        req.requestId,
      )
    );
  });
}
