/**
 * Daily Briefing routes — F-460b
 *
 * GET  /v3/briefing/today    — cached briefing for today (or 404)
 * POST /v3/briefing/generate — on-demand generation + upsert
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import pg from 'pg';
import PDFDocument from 'pdfkit';
import { config } from '../config/index.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { assembleDailyBriefing } from '../services/briefing/assemble.js';
import { logger } from '../lib/logger.js';
import type { JwtPayload } from '../middleware/auth.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 2,
});

interface BriefingRow {
  briefing_date: string;
  headline: string;
  priority_actions: unknown;
  risk_flags: unknown;
  market_intel_summary: string;
  cert_expiration_warnings: unknown;
  model_used: string | null;
  quality_flag: string | null;
  trace_id: string | null;
  generated_at: string;
}

function formatRow(row: BriefingRow) {
  return {
    briefing_date: row.briefing_date,
    headline: row.headline,
    priority_actions: row.priority_actions,
    risk_flags: row.risk_flags,
    market_intel_summary: row.market_intel_summary,
    cert_expiration_warnings: row.cert_expiration_warnings,
    model_used: row.model_used,
    quality_flag: row.quality_flag,
    generated_at: row.generated_at,
  };
}

export async function briefingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v3/briefing/today', async (req, reply) => {
    const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const { rows } = await pool.query<BriefingRow>(
      `SELECT briefing_date, headline, priority_actions, risk_flags,
              market_intel_summary, cert_expiration_warnings,
              model_used, quality_flag, trace_id, generated_at
       FROM daily_briefing_cache
       WHERE briefing_date = $1`,
      [todayET],
    );

    if (rows.length === 0) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'No briefing generated for today', req.requestId),
      );
    }

    return reply.status(200).send(successEnvelope(formatRow(rows[0]!), req.requestId));
  });

  app.post('/v3/briefing/generate', async (req, reply) => {
    const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    logger.info({ date: todayET }, 'On-demand briefing generation requested');

    const { output, model_used, quality_flag, trace_id } = await assembleDailyBriefing(todayET);

    await pool.query(
      `INSERT INTO daily_briefing_cache
         (briefing_date, headline, priority_actions, risk_flags,
          market_intel_summary, cert_expiration_warnings,
          model_used, quality_flag, trace_id, generated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (briefing_date) DO UPDATE SET
         headline = EXCLUDED.headline,
         priority_actions = EXCLUDED.priority_actions,
         risk_flags = EXCLUDED.risk_flags,
         market_intel_summary = EXCLUDED.market_intel_summary,
         cert_expiration_warnings = EXCLUDED.cert_expiration_warnings,
         model_used = EXCLUDED.model_used,
         quality_flag = EXCLUDED.quality_flag,
         trace_id = EXCLUDED.trace_id,
         generated_at = NOW()`,
      [
        todayET,
        output.headline,
        JSON.stringify(output.priority_actions),
        JSON.stringify(output.risk_flags),
        output.market_intel_summary,
        JSON.stringify(output.cert_expiration_warnings),
        model_used,
        quality_flag,
        trace_id,
      ],
    );

    const result = {
      briefing_date: todayET,
      headline: output.headline,
      priority_actions: output.priority_actions,
      risk_flags: output.risk_flags,
      market_intel_summary: output.market_intel_summary,
      cert_expiration_warnings: output.cert_expiration_warnings,
      model_used,
      quality_flag,
      generated_at: new Date().toISOString(),
    };

    return reply.status(200).send(successEnvelope(result, req.requestId));
  });

  /* ── PDF export ────────────────────────────────────────────── */
  app.get('/v3/briefing/export', async (req, reply) => {
    const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const { rows } = await pool.query<BriefingRow>(
      `SELECT briefing_date, headline, priority_actions, risk_flags,
              market_intel_summary, cert_expiration_warnings,
              model_used, quality_flag, trace_id, generated_at
       FROM daily_briefing_cache
       WHERE briefing_date = $1`,
      [todayET],
    );

    if (rows.length === 0) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'No briefing generated for today', req.requestId),
      );
    }

    const briefing = rows[0]!;
    const dateLabel = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'America/New_York',
    });

    const doc = new PDFDocument({ margin: 50 });
    reply.raw.setHeader('Content-Type', 'application/pdf');
    reply.raw.setHeader(
      'Content-Disposition',
      `attachment; filename="daily-brief-${todayET}.pdf"`,
    );
    doc.pipe(reply.raw);

    // Header
    doc.fontSize(18).font('Helvetica-Bold').text('DAILY INTELLIGENCE BRIEF', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(dateLabel, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica-Bold').text(briefing.headline, { align: 'center' });
    doc.moveDown(1.5);

    // Priority Actions
    const actions = Array.isArray(briefing.priority_actions) ? briefing.priority_actions as Array<{ action: string; urgency: string; related_entity?: string }> : [];
    if (actions.length > 0) {
      doc.fontSize(12).font('Helvetica-Bold').text('PRIORITY ACTIONS');
      doc.moveDown(0.5);
      actions.forEach((item, i) => {
        const label = item.urgency === 'immediate' ? '[IMMEDIATE]'
          : item.urgency === 'today' ? '[TODAY]' : '[THIS WEEK]';
        doc.fontSize(10).font('Helvetica').text(`${i + 1}. ${label} ${item.action}`);
        if (item.related_entity) {
          doc.fontSize(9).fillColor('#666666').text(`   ${item.related_entity}`);
          doc.fillColor('#000000');
        }
        doc.moveDown(0.3);
      });
      doc.moveDown();
    }

    // Risk Flags
    const risks = Array.isArray(briefing.risk_flags) ? briefing.risk_flags as string[] : [];
    if (risks.length > 0) {
      doc.fontSize(12).font('Helvetica-Bold').text('RISK FLAGS');
      doc.moveDown(0.5);
      risks.forEach((risk) => {
        doc.fontSize(10).font('Helvetica').text(`\u2022 ${risk}`);
        doc.moveDown(0.3);
      });
      doc.moveDown();
    }

    // Market Intel
    if (briefing.market_intel_summary) {
      doc.fontSize(12).font('Helvetica-Bold').text('MARKET INTELLIGENCE');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica').text(briefing.market_intel_summary, { lineGap: 4 });
      doc.moveDown();
    }

    // Cert Warnings
    const certs = Array.isArray(briefing.cert_expiration_warnings) ? briefing.cert_expiration_warnings as string[] : [];
    if (certs.length > 0) {
      doc.fontSize(12).font('Helvetica-Bold').text('CERTIFICATION WARNINGS');
      doc.moveDown(0.5);
      certs.forEach((warn) => {
        doc.fontSize(10).font('Helvetica').text(`\u2022 ${warn}`);
        doc.moveDown(0.3);
      });
      doc.moveDown();
    }

    // Footer
    doc.moveDown(2);
    doc.fontSize(8).font('Helvetica').fillColor('#999999')
      .text(`Generated ${new Date(briefing.generated_at).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`, { align: 'center' });

    doc.end();
    return reply;
  });

  /* ── User settings ──────────────────────────────────────────── */
  app.get('/v3/users/me/settings', async (req, reply) => {
    const userPayload = (req as FastifyRequest & { user: JwtPayload }).user;
    if (!userPayload) {
      return reply.status(401).send(
        errorEnvelope('UNAUTHORIZED', 'Missing or invalid authorization', req.requestId),
      );
    }

    const { rows } = await pool.query(
      'SELECT settings FROM users WHERE id = $1',
      [userPayload.sub],
    );
    const settings = rows[0]?.settings ?? {};
    return reply.status(200).send(successEnvelope(settings, req.requestId));
  });

  app.patch('/v3/users/me/settings', async (req, reply) => {
    const userPayload = (req as FastifyRequest & { user: JwtPayload }).user;
    if (!userPayload) {
      return reply.status(401).send(
        errorEnvelope('UNAUTHORIZED', 'Missing or invalid authorization', req.requestId),
      );
    }

    const body = req.body as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Request body must be a JSON object', req.requestId),
      );
    }

    const { rows } = await pool.query(
      `UPDATE users
       SET settings = COALESCE(settings, '{}'::jsonb) || $1::jsonb,
           updated_at = NOW()
       WHERE id = $2
       RETURNING settings`,
      [JSON.stringify(body), userPayload.sub],
    );

    return reply.status(200).send(successEnvelope(rows[0]?.settings ?? {}, req.requestId));
  });
}
