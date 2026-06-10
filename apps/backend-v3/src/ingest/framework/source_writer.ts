/**
 * Source writer — upserts an opportunity row and writes per-field
 * source citation rows in a single transaction.
 *
 * Follows R1: every data point has a clickable source.
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { requireBoss, QUEUE_NAMES, type AnalysisJobData } from '../../lib/queue.js';
import { mirrorOpportunityToUnified } from '../../services/opportunities/unified-mirror.js';
import { evaluateRelevance } from '../../constants/relevance.js';
import { validateAndRecompute, rejectReason } from './opportunity_validation.js';

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

export interface MappedContact {
  name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  contactType: string | null;
  agency: string | null;
  sourceUrl: string;
  rawJson?: unknown;
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
  contacts?: MappedContact[];
  department_name?: string | null;
  agency_name?: string | null;
  office?: string | null;
  contracting_office?: string | null;
  org_path?: string | null;
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

    // Layer 2 — deterministic recompute / normalize. Pure, no DB.
    const validated = validateAndRecompute(opp);

    // Layer 3 — storability guard. Rejected rows go in with relevance_status
    // = 'rejected' + the reason in relevance_reason for human audit, then we
    // skip every other side effect (no contacts, no analysis enqueue, no
    // unified mirror).
    const xReason = rejectReason(validated);

    const sourceUrl = citations[0]?.source_url ?? null;
    const { rows: sourceRows } = await client.query(
      `INSERT INTO sources (kind, url, title, confidence, meta)
       VALUES ($1, $2, $3, 'high', '{}')
       RETURNING id`,
      [sourceKind, sourceUrl, `SAM.gov Notice ${validated.sam_notice_id}`],
    );
    const sourceId = sourceRows[0].id;

    // PR-A4: evaluate relevance before upsert
    const rel = xReason !== null
      ? { status: 'rejected', reason: xReason }
      : evaluateRelevance({
          naics: validated.naics,
          set_aside: validated.set_aside,
          response_due_at: validated.response_due_at,
        });

    if (xReason !== null) {
      logger.warn(
        { sam_notice_id: validated.sam_notice_id, reason: xReason },
        'opportunity row rejected by validation guard (stored with relevance_status=rejected)',
      );
    }

    const { rows: upsertRows } = await client.query(
      `INSERT INTO opportunities (
         title, agency, sub_agency, department, solicitation_number,
         sam_notice_id, status, value_min, value_max, naics, psc,
         set_aside, place_of_performance, response_due_at, posted_at,
         description, data_source, tags, source_id, opportunity_type, source_uri,
         department_name, agency_name, office, contracting_office, org_path,
         relevance_status, relevance_reason
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
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
         department_name      = EXCLUDED.department_name,
         agency_name          = EXCLUDED.agency_name,
         office               = EXCLUDED.office,
         contracting_office   = EXCLUDED.contracting_office,
         org_path             = EXCLUDED.org_path,
         relevance_status     = EXCLUDED.relevance_status,
         relevance_reason     = EXCLUDED.relevance_reason,
         updated_at           = NOW()
       RETURNING id, (xmax = 0) AS was_inserted`,
      [
        validated.title,
        validated.agency,
        validated.sub_agency,
        validated.department,
        validated.solicitation_number,
        validated.sam_notice_id,
        validated.status,
        validated.value_min,
        validated.value_max,
        validated.naics,
        validated.psc,
        validated.set_aside,
        validated.place_of_performance,
        validated.response_due_at,
        validated.posted_at,
        validated.description,
        validated.data_source,
        validated.tags.length > 0 ? `{${validated.tags.join(',')}}` : '{}',
        sourceId,
        validated.opportunity_type ?? null,
        validated.source_uri ?? null,
        validated.department_name ?? null,
        validated.agency_name ?? null,
        validated.office ?? null,
        validated.contracting_office ?? null,
        validated.org_path ?? null,
        rel.status,
        rel.reason,
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

    if (xReason === null) {
      // Upsert contacts outside the opportunity transaction so a bad
      // contact never rolls back the opportunity write.
      if (validated.contacts && validated.contacts.length > 0) {
        await upsertContactsForOpportunity(oppId, validated.data_source, validated.contacts);
      }

      // F-605: auto-enqueue analysis on ingest
      enqueueIngestAnalysis(String(oppId));

      // F-401: mirror into unified_opportunities (best-effort, never fails ingest)
      try {
        await mirrorOpportunityToUnified(pool, {
          id: oppId,
          data_source: validated.data_source,
          sam_notice_id: validated.sam_notice_id,
          govtribe_id: null,
          external_id: null,
          title: validated.title,
          agency: validated.agency,
          sub_agency: validated.sub_agency,
          naics: validated.naics,
          psc: validated.psc,
          set_aside: validated.set_aside,
          value_min: validated.value_min,
          value_max: validated.value_max,
          posted_at: validated.posted_at,
          response_due_at: validated.response_due_at,
          status: validated.status,
        });
      } catch (mirrorErr) {
        logger.error(
          { oppId, error: mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr) },
          'unified_mirror_post_ingest_error',
        );
      }
    }

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

    // Layer 2 — deterministic recompute / normalize. Pure, no DB.
    const validated = validateAndRecompute(opp);

    // Layer 3 — storability guard. Rejected rows go in with relevance_status
    // = 'rejected' + the reason in relevance_reason for human audit, then we
    // skip every other side effect (no analysis enqueue, no unified mirror).
    const xReason = rejectReason(validated);

    const sourceUrl = citations[0]?.source_url ?? null;
    const { rows: sourceRows } = await client.query(
      `INSERT INTO sources (kind, url, title, confidence, meta)
       VALUES ($1, $2, $3, 'high', '{}')
       RETURNING id`,
      [sourceKind, sourceUrl, `${sourceKind.toUpperCase()} ${validated.external_id}`],
    );
    const sourceId = sourceRows[0].id;

    // PR-A4: evaluate relevance before upsert
    const rel = xReason !== null
      ? { status: 'rejected', reason: xReason }
      : evaluateRelevance({
          naics: validated.naics,
          set_aside: validated.set_aside,
          response_due_at: validated.response_due_at,
        });

    if (xReason !== null) {
      logger.warn(
        { external_id: validated.external_id, data_source: validated.data_source, reason: xReason },
        'opportunity row rejected by validation guard (stored with relevance_status=rejected)',
      );
    }

    const { rows: upsertRows } = await client.query(
      `INSERT INTO opportunities (
         title, agency, sub_agency, department, solicitation_number,
         external_id, status, value_min, value_max, naics, psc,
         set_aside, place_of_performance, response_due_at, posted_at,
         description, data_source, tags, source_id,
         agency_subtype, opportunity_type, part_number, quantity,
         relevance_status, relevance_reason
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
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
         relevance_status     = EXCLUDED.relevance_status,
         relevance_reason     = EXCLUDED.relevance_reason,
         updated_at           = NOW()
       RETURNING id, (xmax = 0) AS was_inserted`,
      [
        validated.title,
        validated.agency,
        validated.sub_agency,
        validated.department,
        validated.solicitation_number,
        validated.external_id,
        validated.status,
        validated.value_min,
        validated.value_max,
        validated.naics,
        validated.psc,
        validated.set_aside,
        validated.place_of_performance,
        validated.response_due_at,
        validated.posted_at,
        validated.description,
        validated.data_source,
        validated.tags.length > 0 ? `{${validated.tags.join(',')}}` : '{}',
        sourceId,
        validated.agency_subtype,
        validated.opportunity_type,
        validated.part_number,
        validated.quantity,
        rel.status,
        rel.reason,
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

    if (xReason === null) {
      // F-605: auto-enqueue analysis on ingest
      enqueueIngestAnalysis(String(oppId));

      // F-401: mirror into unified_opportunities (best-effort, never fails ingest)
      try {
        await mirrorOpportunityToUnified(pool, {
          id: oppId,
          data_source: validated.data_source,
          sam_notice_id: null,
          govtribe_id: validated.data_source === 'govtribe' ? validated.external_id : null,
          external_id: validated.external_id,
          title: validated.title,
          agency: validated.agency,
          sub_agency: validated.sub_agency,
          naics: validated.naics,
          psc: validated.psc,
          set_aside: validated.set_aside,
          value_min: validated.value_min,
          value_max: validated.value_max,
          posted_at: validated.posted_at,
          response_due_at: validated.response_due_at,
          status: validated.status,
        });
      } catch (mirrorErr) {
        logger.error(
          { oppId, error: mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr) },
          'unified_mirror_post_ingest_error',
        );
      }
    }

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

/**
 * Upsert contacts tied to an opportunity into govtribe_contacts.
 * Runs outside the opportunity transaction — a bad contact row
 * never aborts the opportunity write. Errors are logged and skipped.
 */
async function upsertContactsForOpportunity(
  oppId: number,
  dataSource: string,
  contacts: MappedContact[],
): Promise<void> {
  for (const contact of contacts) {
    try {
      let existingId: number | null = null;

      // Dedup: prefer email match, fall back to (name, agency)
      if (contact.email) {
        const { rows } = await pool.query<{ id: number }>(
          `SELECT id FROM govtribe_contacts
           WHERE source_label = $1 AND email IS NOT NULL AND lower(email) = lower($2)
           LIMIT 1`,
          [dataSource, contact.email],
        );
        existingId = rows[0]?.id ?? null;
      } else if (contact.name) {
        const { rows } = await pool.query<{ id: number }>(
          `SELECT id FROM govtribe_contacts
           WHERE source_label = $1 AND lower(name) = lower($2)
             AND agency IS NOT DISTINCT FROM $3
           LIMIT 1`,
          [dataSource, contact.name, contact.agency],
        );
        existingId = rows[0]?.id ?? null;
      }

      if (existingId) {
        await pool.query(
          `UPDATE govtribe_contacts SET
             name = COALESCE($1, name),
             title = COALESCE($2, title),
             phone = COALESCE($3, phone),
             contact_type = COALESCE($4, contact_type),
             source_url = COALESCE($5, source_url),
             raw_json = COALESCE($6, raw_json),
             last_seen_at = NOW(),
             linked_opportunity_ids = (
               SELECT ARRAY(SELECT DISTINCT unnest(linked_opportunity_ids || $7::int))
               FROM govtribe_contacts WHERE id = $8
             )
           WHERE id = $8`,
          [
            contact.name,
            contact.title,
            contact.phone,
            contact.contactType,
            contact.sourceUrl,
            contact.rawJson ? JSON.stringify(contact.rawJson) : null,
            oppId,
            existingId,
          ],
        );
      } else {
        await pool.query(
          `INSERT INTO govtribe_contacts (
             govtribe_id, source_label, contact_category, contact_type,
             name, title, email, phone, agency, source_url, raw_json,
             linked_opportunity_ids, last_seen_at
           ) VALUES (
             NULL, $1, 'government', $2,
             $3, $4, $5, $6, $7, $8, $9,
             ARRAY[$10::int], NOW()
           )`,
          [
            dataSource,
            contact.contactType,
            contact.name,
            contact.title,
            contact.email,
            contact.phone,
            contact.agency,
            contact.sourceUrl,
            contact.rawJson ? JSON.stringify(contact.rawJson) : null,
            oppId,
          ],
        );
      }
    } catch (err) {
      logger.error(
        {
          oppId,
          contactName: contact.name,
          contactEmail: contact.email,
          error: err instanceof Error ? err.message : String(err),
        },
        'source_writer_contact_row_error',
      );
    }
  }
}
