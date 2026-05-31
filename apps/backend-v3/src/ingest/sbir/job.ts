/**
 * SBIR/STTR ingest job — pulls DoD awards from the last 30 days + all
 * currently open/pre-release topics from SBIR.gov, maps to DB rows,
 * and upserts with per-field source citations (R1 compliant).
 *
 * Idempotency:
 *  - sbir_awards: UNIQUE on award_number, ON CONFLICT DO NOTHING
 *  - sbir_topics: UNIQUE on (topic_code, solicitation_number), ON CONFLICT DO NOTHING
 *
 * Row-level errors are logged and skipped — the job never crashes.
 */

import { logger } from '../../lib/logger.js';
import { pool } from '../../lib/db.js';
import { createFetchState, fetchSBIRAwards, fetchSBIRTopics } from './client.js';
import { mapSBIRAward } from './mapper_awards.js';
import { mapSBIRTopic } from './mapper_topics.js';
import type { SBIRAwardRow, SBIRAwardCitation } from './mapper_awards.js';
import type { SBIRTopicRow, SBIRTopicCitation } from './mapper_topics.js';
import type { IngestResult } from '../framework/registry.js';

const AWARD_FIELD_TO_TABLE: Record<string, string> = {
  awardee: 'sbir_award_awardee_sources',
  amount: 'sbir_award_amount_sources',
  topic: 'sbir_award_topic_sources',
};

const TOPIC_FIELD_TO_TABLE: Record<string, string> = {
  title: 'sbir_topic_title_sources',
  close_date: 'sbir_topic_close_date_sources',
};

async function getOrCreateSourceId(): Promise<bigint> {
  const { rows } = await pool.query(
    `SELECT id FROM sources WHERE kind = 'sbir' AND url = 'https://www.sbir.gov' LIMIT 1`,
  );
  if (rows.length > 0) return BigInt(rows[0].id);

  const { rows: inserted } = await pool.query(
    `INSERT INTO sources (kind, url, title, confidence, meta)
     VALUES ('sbir', 'https://www.sbir.gov', 'SBIR.gov', 'high', '{}')
     RETURNING id`,
  );
  return BigInt(inserted[0].id);
}

async function upsertSBIRAward(
  award: SBIRAwardRow,
  citations: SBIRAwardCitation[],
  sourceId: bigint,
): Promise<'inserted' | 'skipped'> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sbirSourceUrl = award.sbir_url ?? 'https://www.sbir.gov';
    const { rows: srcRows } = await client.query(
      `INSERT INTO sources (kind, url, title, confidence, meta)
       VALUES ('sbir', $1, $2, 'high', '{}')
       RETURNING id`,
      [sbirSourceUrl, `SBIR.gov Award ${award.award_number}`],
    );
    const perRecordSourceId = srcRows[0].id;

    const { rows: upsertRows } = await client.query(
      `INSERT INTO sbir_awards (
         award_number, program, phase, award_year, agency, branch,
         awardee_name, awardee_uei, awardee_duns, awardee_city, awardee_state, awardee_zip,
         pi_name, research_institution, title, abstract,
         award_amount, contract_number, proposal_number,
         topic_code, solicitation_number,
         award_start_date, award_end_date, sbir_url,
         data_source, source_id
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
       ON CONFLICT (award_number) DO NOTHING
       RETURNING id`,
      [
        award.award_number,
        award.program,
        award.phase,
        award.award_year,
        award.agency,
        award.branch,
        award.awardee_name,
        award.awardee_uei,
        award.awardee_duns,
        award.awardee_city,
        award.awardee_state,
        award.awardee_zip,
        award.pi_name,
        award.research_institution,
        award.title,
        award.abstract,
        award.award_amount,
        award.contract_number,
        award.proposal_number,
        award.topic_code,
        award.solicitation_number,
        award.award_start_date,
        award.award_end_date,
        award.sbir_url,
        'sbir.gov',
        perRecordSourceId,
      ],
    );

    if (upsertRows.length === 0) {
      await client.query('ROLLBACK');
      return 'skipped';
    }

    const awardId = upsertRows[0].id;
    for (const citation of citations) {
      const table = AWARD_FIELD_TO_TABLE[citation.field];
      if (!table) continue;

      await client.query(
        `INSERT INTO ${table} (sbir_award_id, source_id)
         VALUES ($1, $2)
         ON CONFLICT (sbir_award_id, source_id) DO NOTHING`,
        [awardId, perRecordSourceId],
      );
    }

    await client.query('COMMIT');
    return 'inserted';
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function upsertSBIRTopic(
  topic: SBIRTopicRow,
  citations: SBIRTopicCitation[],
  sourceId: bigint,
): Promise<'inserted' | 'skipped'> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const topicSourceUrl = topic.topic_url;
    const { rows: srcRows } = await client.query(
      `INSERT INTO sources (kind, url, title, confidence, meta)
       VALUES ('sbir', $1, $2, 'high', '{}')
       RETURNING id`,
      [topicSourceUrl, `SBIR.gov Topic ${topic.topic_code}`],
    );
    const perRecordSourceId = srcRows[0].id;

    const { rows: upsertRows } = await client.query(
      `INSERT INTO sbir_topics (
         topic_code, solicitation_number, program, phase, agency, branch,
         title, description, technology_areas,
         open_date, close_date, pre_release_date,
         topic_url, status, data_source, source_id
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (topic_code, solicitation_number) DO NOTHING
       RETURNING id`,
      [
        topic.topic_code,
        topic.solicitation_number,
        topic.program,
        topic.phase,
        topic.agency,
        topic.branch,
        topic.title,
        topic.description,
        topic.technology_areas,
        topic.open_date,
        topic.close_date,
        topic.pre_release_date,
        topic.topic_url,
        topic.status,
        'sbir.gov',
        perRecordSourceId,
      ],
    );

    if (upsertRows.length === 0) {
      await client.query('ROLLBACK');
      return 'skipped';
    }

    const topicId = upsertRows[0].id;
    for (const citation of citations) {
      const table = TOPIC_FIELD_TO_TABLE[citation.field];
      if (!table) continue;

      await client.query(
        `INSERT INTO ${table} (sbir_topic_id, source_id)
         VALUES ($1, $2)
         ON CONFLICT (sbir_topic_id, source_id) DO NOTHING`,
        [topicId, perRecordSourceId],
      );
    }

    await client.query('COMMIT');
    return 'inserted';
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function runSBIRIngest(): Promise<IngestResult> {
  const state = createFetchState();
  const globalSourceId = await getOrCreateSourceId();

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  // Fetch awards from current year (covers last 30 days effectively)
  const currentYear = new Date().getFullYear();
  const yearsToFetch = [currentYear, currentYear - 1];

  logger.info(
    { source: 'sbir', years: yearsToFetch },
    'sbir_ingest_job_start',
  );

  for (const year of yearsToFetch) {
    const awardRecords = await fetchSBIRAwards(year, state);

    for (const raw of awardRecords) {
      try {
        const mapped = mapSBIRAward(raw);
        if (!mapped) {
          skipped++;
          continue;
        }

        const outcome = await upsertSBIRAward(mapped.award, mapped.citations, globalSourceId);
        if (outcome === 'inserted') inserted++;
        else skipped++;
      } catch (err) {
        skipped++;
        logger.error(
          {
            source: 'sbir',
            awardNumber: raw.award_number,
            error: err instanceof Error ? err.message : String(err),
          },
          'sbir_award_row_error',
        );
      }
    }
  }

  // Fetch open/pre-release topics
  const topicRecords = await fetchSBIRTopics(state);

  for (const raw of topicRecords) {
    try {
      const mapped = mapSBIRTopic(raw);
      if (!mapped) {
        skipped++;
        continue;
      }

      const outcome = await upsertSBIRTopic(mapped.topic, mapped.citations, globalSourceId);
      if (outcome === 'inserted') inserted++;
      else skipped++;
    } catch (err) {
      skipped++;
      logger.error(
        {
          source: 'sbir',
          topicCode: raw.topic_number,
          error: err instanceof Error ? err.message : String(err),
        },
        'sbir_topic_row_error',
      );
    }
  }

  logger.info(
    { source: 'sbir', inserted, updated, skipped, degraded: state.degraded },
    'sbir_ingest_complete',
  );

  return {
    inserted,
    updated,
    skipped,
    degraded: state.degraded,
    degradedReason: state.degradedReason,
  };
}
