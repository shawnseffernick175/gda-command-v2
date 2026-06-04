/**
 * Daily Briefing routes — F-460b
 *
 * GET  /v3/briefing/today    — cached briefing for today (or 404)
 * POST /v3/briefing/generate — on-demand generation + upsert
 */

import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { config } from '../config/index.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { assembleDailyBriefing } from '../services/briefing/assemble.js';
import { logger } from '../lib/logger.js';

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
}
