/**
 * USAspending ingest job — pulls the last 7 days of DoD contract award
 * modifications, maps to award rows, and upserts with per-field source
 * citations (R1 compliant).
 *
 * Idempotency: UNIQUE on (piid, last_mod_date), ON CONFLICT DO NOTHING.
 * Row-level errors are logged and skipped — the job never crashes.
 */

import { logger } from '../../lib/logger.js';
import { pool } from '../../lib/db.js';
import { fetchUSASpendingAwards } from './client.js';
import type { USASpendingFetchResult } from './client.js';
import { mapUSASpendingAward } from './mapper.js';
import type { AwardRow, AwardSourceCitation } from './mapper.js';
import type { IngestResult } from '../framework/registry.js';

const LOOKBACK_HOURS = process.env['USASPENDING_LOOKBACK_HOURS']
  ? parseInt(process.env['USASPENDING_LOOKBACK_HOURS'], 10)
  : 168; // default 7 days

const FIELD_TO_TABLE: Record<string, string> = {
  awardee: 'award_awardee_sources',
  value: 'award_value_sources',
  naics: 'award_naics_sources',
  award_date: 'award_award_date_sources',
  agency: 'award_agency_sources',
};

export async function upsertAwardWithSources(
  award: AwardRow,
  citations: AwardSourceCitation[],
): Promise<'inserted' | 'skipped'> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sourceUrl = award.fpds_url ?? 'https://www.usaspending.gov';
    const { rows: sourceRows } = await client.query(
      `INSERT INTO sources (kind, url, title, confidence, meta)
       VALUES ('usaspending', $1, $2, 'high', '{}')
       RETURNING id`,
      [sourceUrl, `USA Spending award detail ${award.piid}`],
    );
    const sourceId = sourceRows[0].id;

    const isRecompete = computeIsRecompeteCandidate(award.period_of_performance_end);

    const { rows: upsertRows } = await client.query(
      `INSERT INTO awards (
         piid, agency_id, agency_name, contracting_office,
         awardee_name, awardee_uei, awardee_duns,
         value_obligated, value_base_and_all_options,
         naics, psc,
         place_of_performance_state, place_of_performance_country,
         award_date, last_mod_date, contract_type,
         sam_notice_id,
         data_source, source_id, fpds_url,
         period_of_performance_end, is_recompete_candidate
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       ON CONFLICT (piid, last_mod_date) DO NOTHING
       RETURNING id`,
      [
        award.piid,
        award.agency_id,
        award.agency_name,
        award.contracting_office,
        award.awardee_name,
        award.awardee_uei,
        award.awardee_duns,
        award.value_obligated,
        award.value_base_and_all_options,
        award.naics,
        award.psc,
        award.place_of_performance_state,
        award.place_of_performance_country,
        award.award_date,
        award.last_mod_date,
        award.contract_type,
        award.sam_notice_id,
        award.data_source,
        sourceId,
        award.fpds_url,
        award.period_of_performance_end,
        isRecompete,
      ],
    );

    if (upsertRows.length === 0) {
      await client.query('ROLLBACK');
      return 'skipped';
    }

    const awardId = upsertRows[0].id;

    for (const citation of citations) {
      const table = FIELD_TO_TABLE[citation.field];
      if (!table) continue;

      await client.query(
        `INSERT INTO ${table} (award_id, source_id)
         VALUES ($1, $2)
         ON CONFLICT (award_id, source_id) DO NOTHING`,
        [awardId, sourceId],
      );
    }

    await client.query('COMMIT');

    // Fire-and-forget award analysis generation
    generateAwardAnalysis(awardId, award).catch((err) => {
      logger.warn({ err, awardId, piid: award.piid }, 'award_analysis_generation_failed');
    });

    return 'inserted';
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function generateAwardAnalysis(awardId: string, award: AwardRow): Promise<void> {
  const { llmRouter } = await import('../../lib/llm-router.js');

  const valueTotal = award.value_base_and_all_options ?? award.value_obligated ?? 0;
  const threatLevel = valueTotal >= 10_000_000 ? 'high' : valueTotal >= 1_000_000 ? 'medium' : 'low';
  const isRecompete = computeIsRecompeteCandidate(award.period_of_performance_end);

  const popEndFormatted = award.period_of_performance_end
    ? new Date(award.period_of_performance_end).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  const result = await llmRouter.route({
    task: 'award_analysis' as const,
    input: {
      award_id: award.piid,
      recipient_name: award.awardee_name,
      agency_name: award.agency_name,
      naics: award.naics,
      set_aside: null,
      contract_type: award.contract_type,
      value_obligated: award.value_obligated,
      award_date: award.award_date,
      period_of_performance_end: award.period_of_performance_end,
    },
    opts: { object_ref: `award:${awardId}` },
  });

  const analysis = result.ok
    ? {
        ...result.output,
        incumbent: award.awardee_name,
        recompete_signal: isRecompete && popEndFormatted
          ? `PoP ends ${popEndFormatted} — eligible for re-compete`
          : null,
        threat_level: threatLevel,
        envision_angle: isRecompete && award.awardee_name && popEndFormatted
          ? `Envision should position as alternative to ${award.awardee_name} when this contract re-competes in ${popEndFormatted}`
          : null,
      }
    : {
        incumbent: award.awardee_name,
        recompete_signal: isRecompete && popEndFormatted
          ? `PoP ends ${popEndFormatted} — eligible for re-compete`
          : null,
        threat_level: threatLevel,
        envision_angle: null,
        error: result.error_message,
      };

  await pool.query(
    `UPDATE awards SET award_analysis = $1 WHERE id = $2`,
    [JSON.stringify(analysis), awardId],
  );
}

function computeIsRecompeteCandidate(popEnd: string | null): boolean {
  if (!popEnd) return false;
  const endDate = new Date(popEnd);
  const now = new Date();
  const eighteenMonths = new Date();
  eighteenMonths.setMonth(eighteenMonths.getMonth() + 18);
  return endDate >= now && endDate <= eighteenMonths;
}

export async function runUSASpendingIngest(): Promise<IngestResult> {
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000);

  logger.info(
    { source: 'usaspending', fromDate: fromDate.toISOString(), toDate: toDate.toISOString() },
    'usaspending_ingest_job_start',
  );

  const fetchResult: USASpendingFetchResult = await fetchUSASpendingAwards(fromDate, toDate);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const raw of fetchResult.records) {
    try {
      const mapped = mapUSASpendingAward(raw);
      if (!mapped) {
        skipped++;
        continue;
      }

      const outcome = await upsertAwardWithSources(mapped.award, mapped.citations);

      if (outcome === 'inserted') inserted++;
      else skipped++;
    } catch (err) {
      skipped++;
      logger.error(
        {
          source: 'usaspending',
          awardId: raw['Award ID'],
          error: err instanceof Error ? err.message : String(err),
        },
        'usaspending_ingest_row_error',
      );
    }
  }

  logger.info(
    {
      source: 'usaspending',
      totalFetched: fetchResult.records.length,
      contracts_rows: fetchResult.contracts_rows,
      idvs_rows: fetchResult.idvs_rows,
      inserted,
      skipped,
    },
    'usaspending_ingest_fetched',
  );

  return {
    inserted,
    updated,
    skipped,
    degraded: fetchResult.degraded,
    degradedReason: fetchResult.degradedReason,
    stats: {
      contracts_rows: fetchResult.contracts_rows,
      idvs_rows: fetchResult.idvs_rows,
    },
  };
}
