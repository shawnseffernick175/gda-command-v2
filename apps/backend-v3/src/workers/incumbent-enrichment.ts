/**
 * Incumbent enrichment worker — daily batch job that populates
 * incumbent / incumbent_confidence / incumbent_source on relevant
 * opportunities using the two-source lookup pipeline.
 *
 * Respects rate limits (60 USAspending/min, 30 FPDS/min) via inter-request
 * delay. Writes an audit log to logs/incumbent_enrichment_<timestamp>.json.
 */

import { pool } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { lookupIncumbent, type OpportunityForIncumbent } from '../services/enrichment/incumbent.js';
import fs from 'node:fs';
import path from 'node:path';

const BATCH_SIZE = 50;
const REQUEST_DELAY_MS = 1_100; // ~55 requests/min (under 60/min USAspending limit)

interface EnrichmentLogEntry {
  opp_id: number;
  source: string;
  matched_value: string | null;
  confidence: string | null;
  latency_ms: number;
}

interface EnrichmentReport {
  started_at: string;
  ended_at: string;
  total_eligible: number;
  enriched: number;
  no_match: number;
  rate_limited: number;
  errors: number;
  confidence_breakdown: {
    high: number;
    medium: number;
    low: number;
  };
  entries: EnrichmentLogEntry[];
}

/**
 * Run the incumbent enrichment pass over all eligible opportunities.
 *
 * Eligible = relevance_status = 'relevant' AND (incumbent IS NULL
 * OR ai_analyzed_at < NOW() - 30 days).
 */
export async function runIncumbentEnrichment(): Promise<EnrichmentReport> {
  const startedAt = new Date().toISOString();
  const report: EnrichmentReport = {
    started_at: startedAt,
    ended_at: '',
    total_eligible: 0,
    enriched: 0,
    no_match: 0,
    rate_limited: 0,
    errors: 0,
    confidence_breakdown: { high: 0, medium: 0, low: 0 },
    entries: [],
  };

  // Count eligible rows
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM opportunities
     WHERE deleted_at IS NULL
       AND relevance_status = 'relevant'
       AND (
         incumbent IS NULL
         OR ai_analyzed_at IS NULL
         OR ai_analyzed_at < NOW() - INTERVAL '30 days'
       )`,
  );
  report.total_eligible = (countRes.rows[0] as { cnt: number }).cnt;
  logger.info({ total_eligible: report.total_eligible }, 'incumbent_enrichment_start');

  let lastId = 0;

  while (true) {
    const batchRes = await pool.query<{
      id: number;
      solicitation_number: string | null;
      naics: string | null;
      agency: string | null;
      place_of_performance_state: string | null;
      value_min: string | null;
      value_max: string | null;
    }>(
      `SELECT id, solicitation_number, naics, agency,
              place_of_performance_state,
              value_min::text, value_max::text
       FROM opportunities
       WHERE deleted_at IS NULL
         AND relevance_status = 'relevant'
         AND (
           incumbent IS NULL
           OR ai_analyzed_at IS NULL
           OR ai_analyzed_at < NOW() - INTERVAL '30 days'
         )
         AND id > $1
       ORDER BY id
       LIMIT $2`,
      [lastId, BATCH_SIZE],
    );

    if (batchRes.rows.length === 0) break;

    for (const row of batchRes.rows) {
      lastId = row.id;
      const opp: OpportunityForIncumbent = {
        id: row.id,
        solicitation_number: row.solicitation_number,
        naics: row.naics,
        agency: row.agency,
        place_of_performance_state: row.place_of_performance_state,
        value_min: row.value_min != null ? Number(row.value_min) : null,
        value_max: row.value_max != null ? Number(row.value_max) : null,
      };

      const t0 = Date.now();
      try {
        const result = await lookupIncumbent(opp);
        const latencyMs = Date.now() - t0;

        if (result) {
          await pool.query(
            `UPDATE opportunities
             SET incumbent = $1,
                 incumbent_confidence = $2,
                 incumbent_source = $3,
                 ai_analyzed_at = NOW(),
                 updated_at = NOW()
             WHERE id = $4`,
            [result.name, result.confidence, result.source, opp.id],
          );
          report.enriched++;
          report.confidence_breakdown[result.confidence]++;
          report.entries.push({
            opp_id: opp.id,
            source: result.source,
            matched_value: result.name,
            confidence: result.confidence,
            latency_ms: latencyMs,
          });
        } else {
          await pool.query(
            `UPDATE opportunities
             SET incumbent_source = 'no_match',
                 ai_analyzed_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1`,
            [opp.id],
          );
          report.no_match++;
          report.entries.push({
            opp_id: opp.id,
            source: 'no_match',
            matched_value: null,
            confidence: null,
            latency_ms: latencyMs,
          });
        }
      } catch (err) {
        const latencyMs = Date.now() - t0;
        const msg = err instanceof Error ? err.message : String(err);

        if (msg.startsWith('rate_limited')) {
          await pool.query(
            `UPDATE opportunities
             SET incumbent_source = 'rate_limited',
                 updated_at = NOW()
             WHERE id = $1`,
            [opp.id],
          );
          report.rate_limited++;
          report.entries.push({
            opp_id: opp.id,
            source: 'rate_limited',
            matched_value: null,
            confidence: null,
            latency_ms: latencyMs,
          });
        } else {
          report.errors++;
          logger.error(
            { opp_id: opp.id, error: msg },
            'incumbent_enrichment_row_error',
          );
          report.entries.push({
            opp_id: opp.id,
            source: `error:${msg.slice(0, 200)}`,
            matched_value: null,
            confidence: null,
            latency_ms: latencyMs,
          });
        }
      }

      // Rate limit delay
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
    }
  }

  report.ended_at = new Date().toISOString();

  // Write audit log
  const logsDir = path.resolve(import.meta.dirname, '..', '..', 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const reportFileName = `incumbent_enrichment_${startedAt.replace(/[:.]/g, '-')}.json`;
  const reportPath = path.join(logsDir, reportFileName);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  logger.info(
    {
      total_eligible: report.total_eligible,
      enriched: report.enriched,
      no_match: report.no_match,
      rate_limited: report.rate_limited,
      errors: report.errors,
      confidence: report.confidence_breakdown,
      reportPath,
    },
    'incumbent_enrichment_complete',
  );

  return report;
}
