/**
 * Source writer — upserts an opportunity row and writes per-field
 * source citation rows in a single transaction.
 *
 * Follows R1: every data point has a clickable source.
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { requireBoss, QUEUE_NAMES, type AnalysisJobData } from '../../lib/queue.js';

function enqueueIngestAnalysis(oppId: string): void {
  try {
    const boss = requireBoss();
    const jobData: AnalysisJobData = {
      entityType: 'opportunity',
      entityId: oppId,
      priority: 'normal',
      trigger: 'ingest',
    };
    void boss.send(QUEUE_NAMES.ANALYSIS_OPPORTUNITY, jobData, {
      priority: 5,
      retryLimit: 3,
      retryDelay: 5,
      retryBackoff: true,
      singletonKey: `opp-${oppId}`,
    });
  } catch {
    // pg-boss not initialized — swallow
  }
}

export interface OpportunityRow {
  sam_notice_id: string;
  title: string;
  agency: string | null;
  sub_agency: string | null;
  department: string | null;
  solicitation_number: string | null;
  status: string;
  value_min: number | null;
  value_max: number | null;
  naics: string | null;
  psc: string | null;
  set_aside: string | null;
  place_of_performance: string | null;
  response_due_at: string | null;
  posted_at: string | null;
  description: string | null;
  data_source: string;
  tags: string[];
  opportunity_type?: string | null;
  source_uri?: string | null;
}

export interface SourceCitation {
  field: string;
  source_url: string;
}

const FIELD_TO_TABLE: Record<string, string> = {
  title: 'opportunity_title_sources',
  agency: 'opportunity_agency_sources',
  naics: 'opportunity_naics_sources',
  response_due_at: 'opportunity_response_due_at_sources',
  posted_at: 'opportunity_posted_at_sources',
  value_min: 'opportunity_value_min_sources',
  value_max: 'opportunity_value_max_sources',
};

export interface ExternalOpportunityRow {
  external_id: string;
  title: string;
  agency: string | null;
  sub_agency: string | null;
  department: string | null;
  solicitation_number: string | null;
  status: string;
  value_min: number | null;
  value_max: number | null;
  naics: string | null;
  psc: string | null;
  set_aside: string | null;
  place_of_performance: string | null;
  response_due_at: string | null;
  posted_at: string | null;
  description: string | null;
  data_source: string;
  tags: string[];
  agency_subtype: string | null;
  opportunity_type: string | null;
  part_number: string | null;
  quantity: number | null;
}

export type UpsertOutcome = 'inserted' | 'updated' | 'skipped';

/**
 * Upsert one opportunity + write per-field source citations.
 * Uses ON CONFLICT on sam_notice_id for idempotency.
 */
export async function upsertOpportunityWithSources(
  opp: OpportunityRow,
  citations: SourceCitation[],
  sourceKind: string,
): Promise<UpsertOutcome> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sourceUrl = citations[0]?.source_url ?? null;
    const { rows: sourceRows } = await client.query(
      `INSERT INTO sources (kind, url, title, confidence, meta)
       VALUES ($1, $2, $3, 'high', '{}')
       RETURNING id`,
      [sourceKind, sourceUrl, `SAM.gov Notice ${opp.sam_notice_id}`],
    );
    const sourceId = sourceRows[0].id;

    const { rows: upsertRows } = await client.query(
      `INSERT INTO opportunities (
         title, agency, sub_agency, department, solicitation_number,
         sam_notice_id, status, value_min, value_max, naics, psc,
         set_aside, place_of_performance, response_due_at, posted_at,
         description, data_source, tags, source_id, opportunity_type, source_uri
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       ON CONFLICT (sam_notice_id) DO UPDATE SET
         title                = EXCLUDED.title,
         agency               = EXCLUDED.agency,
         sub_agency           = EXCLUDED.sub_agency,
         department           = EXCLUDED.department,
         solicitation_number  = EXCLUDED.solicitation_number,
         value_min            = EXCLUDED.value_min,
         value_max            = EXCLUDED.value_max,
         naics                = EXCLUDED.naics,
         psc                  = EXCLUDED.psc,
         set_aside            = EXCLUDED.set_aside,
         place_of_performance = EXCLUDED.place_of_performance,
         response_due_at      = EXCLUDED.response_due_at,
         posted_at            = EXCLUDED.posted_at,
         description          = EXCLUDED.description,
         data_source          = EXCLUDED.data_source,
         tags                 = EXCLUDED.tags,
         source_id            = EXCLUDED.source_id,
         opportunity_type     = EXCLUDED.opportunity_type,
         source_uri           = COALESCE(EXCLUDED.source_uri, opportunities.source_uri),
         updated_at           = NOW()
       RETURNING id, (xmax = 0) AS was_inserted`,
      [
        opp.title,
        opp.agency,
        opp.sub_agency,
        opp.department,
        opp.solicitation_number,
        opp.sam_notice_id,
        opp.status,
        opp.value_min,
        opp.value_max,
        opp.naics,
        opp.psc,
        opp.set_aside,
        opp.place_of_performance,
        opp.response_due_at,
        opp.posted_at,
        opp.description,
        opp.data_source,
        opp.tags.length > 0 ? `{${opp.tags.join(',')}}` : '{}',
        sourceId,
        opp.opportunity_type ?? null,
        opp.source_uri ?? null,
      ],
    );

    const oppId = upsertRows[0].id;
    const wasInserted: boolean = upsertRows[0].was_inserted;

    for (const citation of citations) {
      const table = FIELD_TO_TABLE[citation.field];
      if (!table) continue;

      await client.query(
        `INSERT INTO ${table} (opportunity_id, source_id)
         VALUES ($1, $2)
         ON CONFLICT (opportunity_id, source_id) DO NOTHING`,
        [oppId, sourceId],
      );
    }

    await client.query('COMMIT');

    // F-605: auto-enqueue analysis on ingest
    enqueueIngestAnalysis(String(oppId));

    if (wasInserted) return 'inserted';
    return 'updated';
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error(
      {
        samNoticeId: opp.sam_notice_id,
        error: err instanceof Error ? err.message : String(err),
      },
      'source_writer_error',
    );
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Upsert one opportunity by (data_source, external_id) + write per-field
 * source citations. Used by non-SAM sources (DIBBS, NECO, etc.).
 */
export async function upsertExternalOpportunity(
  opp: ExternalOpportunityRow,
  citations: SourceCitation[],
  sourceKind: string,
): Promise<UpsertOutcome> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sourceUrl = citations[0]?.source_url ?? null;
    const { rows: sourceRows } = await client.query(
      `INSERT INTO sources (kind, url, title, confidence, meta)
       VALUES ($1, $2, $3, 'high', '{}')
       RETURNING id`,
      [sourceKind, sourceUrl, `${sourceKind.toUpperCase()} ${opp.external_id}`],
    );
    const sourceId = sourceRows[0].id;

    const { rows: upsertRows } = await client.query(
      `INSERT INTO opportunities (
         title, agency, sub_agency, department, solicitation_number,
         external_id, status, value_min, value_max, naics, psc,
         set_aside, place_of_performance, response_due_at, posted_at,
         description, data_source, tags, source_id,
         agency_subtype, opportunity_type, part_number, quantity
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       ON CONFLICT (data_source, external_id) WHERE external_id IS NOT NULL DO UPDATE SET
         title                = EXCLUDED.title,
         agency               = EXCLUDED.agency,
         sub_agency           = EXCLUDED.sub_agency,
         department           = EXCLUDED.department,
         solicitation_number  = EXCLUDED.solicitation_number,
         value_min            = EXCLUDED.value_min,
         value_max            = EXCLUDED.value_max,
         naics                = EXCLUDED.naics,
         psc                  = EXCLUDED.psc,
         set_aside            = EXCLUDED.set_aside,
         place_of_performance = EXCLUDED.place_of_performance,
         response_due_at      = EXCLUDED.response_due_at,
         posted_at            = EXCLUDED.posted_at,
         description          = EXCLUDED.description,
         tags                 = EXCLUDED.tags,
         source_id            = EXCLUDED.source_id,
         agency_subtype       = EXCLUDED.agency_subtype,
         opportunity_type     = EXCLUDED.opportunity_type,
         part_number          = EXCLUDED.part_number,
         quantity             = EXCLUDED.quantity,
         updated_at           = NOW()
       RETURNING id, (xmax = 0) AS was_inserted`,
      [
        opp.title,
        opp.agency,
        opp.sub_agency,
        opp.department,
        opp.solicitation_number,
        opp.external_id,
        opp.status,
        opp.value_min,
        opp.value_max,
        opp.naics,
        opp.psc,
        opp.set_aside,
        opp.place_of_performance,
        opp.response_due_at,
        opp.posted_at,
        opp.description,
        opp.data_source,
        opp.tags.length > 0 ? `{${opp.tags.join(',')}}` : '{}',
        sourceId,
        opp.agency_subtype,
        opp.opportunity_type,
        opp.part_number,
        opp.quantity,
      ],
    );

    const oppId = upsertRows[0].id;
    const wasInserted: boolean = upsertRows[0].was_inserted;

    for (const citation of citations) {
      const table = FIELD_TO_TABLE[citation.field];
      if (!table) continue;

      await client.query(
        `INSERT INTO ${table} (opportunity_id, source_id)
         VALUES ($1, $2)
         ON CONFLICT (opportunity_id, source_id) DO NOTHING`,
        [oppId, sourceId],
      );
    }

    await client.query('COMMIT');

    // F-605: auto-enqueue analysis on ingest
    enqueueIngestAnalysis(String(oppId));

    if (wasInserted) return 'inserted';
    return 'updated';
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error(
      {
        externalId: opp.external_id,
        dataSource: opp.data_source,
        error: err instanceof Error ? err.message : String(err),
      },
      'source_writer_error',
    );
    throw err;
  } finally {
    client.release();
  }
}
