/**
 * Load — write transformed records to V3 database.
 *
 * Idempotent: re-running produces the same V3 state.
 * Uses ON CONFLICT DO UPDATE with deterministic last-write-wins on updated_at.
 */

import pg from 'pg';
import type {
  V3Opportunity,
  V3Capture,
  V3ActionItem,
  V3Source,
  V3Partner,
  PreWarmJob,
} from './types.js';

const { Pool } = pg;

export interface LoadResult {
  opportunities: number;
  captures: number;
  action_items: number;
  sources: number;
  partners: number;
  pre_warm_jobs_enqueued: number;
}

async function ensureMigrationTables(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS sources (
      id BIGSERIAL PRIMARY KEY,
      kind TEXT NOT NULL,
      url TEXT,
      title TEXT,
      retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      confidence TEXT NOT NULL DEFAULT 'high',
      meta JSONB NOT NULL DEFAULT '{}',
      legacy_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_legacy_id
    ON sources (legacy_id) WHERE legacy_id IS NOT NULL
  `);

  await client.query(`
    INSERT INTO sources (id, kind, title, retrieved_at)
    VALUES (1, 'internal', 'Migration seed source', NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await client.query(`
    SELECT setval('sources_id_seq', GREATEST((SELECT MAX(id) FROM sources), 1))
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS v3_opportunities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      agency TEXT,
      sub_agency TEXT,
      solicitation_number TEXT,
      sam_notice_id TEXT,
      status TEXT NOT NULL DEFAULT 'discovery',
      value_min NUMERIC,
      value_max NUMERIC,
      naics TEXT,
      psc TEXT,
      set_aside TEXT,
      place_of_performance TEXT,
      response_due_at TIMESTAMPTZ,
      posted_at TIMESTAMPTZ,
      incumbent TEXT,
      description TEXT,
      tags TEXT[] NOT NULL DEFAULT '{}',
      data_source TEXT NOT NULL DEFAULT 'manual',
      analysis JSONB,
      analysis_version TEXT,
      ai_analyzed_at TIMESTAMPTZ,
      is_teaming_required BOOLEAN NOT NULL DEFAULT FALSE,
      qualified_at TIMESTAMPTZ,
      qualified_by TEXT,
      source_id BIGINT NOT NULL DEFAULT 1,
      legacy_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_v3_opportunities_legacy_id
    ON v3_opportunities (legacy_id) WHERE legacy_id IS NOT NULL
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS v3_captures (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      opportunity_id UUID NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      analysis JSONB,
      analysis_version TEXT,
      ai_analyzed_at TIMESTAMPTZ,
      legacy_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_v3_captures_legacy_id
    ON v3_captures (legacy_id) WHERE legacy_id IS NOT NULL
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS v3_action_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      detail TEXT,
      owner TEXT NOT NULL DEFAULT 'Shawn',
      status TEXT NOT NULL DEFAULT 'open',
      due_date TIMESTAMPTZ,
      source TEXT NOT NULL DEFAULT 'manual',
      source_id TEXT,
      linked_record_type TEXT,
      linked_record_id TEXT,
      completed_at TIMESTAMPTZ,
      legacy_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_v3_action_items_legacy_id
    ON v3_action_items (legacy_id) WHERE legacy_id IS NOT NULL
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS migration_partners (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      display_name TEXT,
      anchor_company TEXT,
      uei TEXT,
      cage TEXT,
      primary_naics TEXT,
      capabilities TEXT[] NOT NULL DEFAULT '{}',
      certifications JSONB NOT NULL DEFAULT '[]',
      vehicles JSONB NOT NULL DEFAULT '[]',
      legacy_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_migration_partners_legacy_id
    ON migration_partners (legacy_id) WHERE legacy_id IS NOT NULL
  `);
}

export async function loadOpportunities(
  client: pg.PoolClient,
  records: V3Opportunity[],
): Promise<number> {
  let count = 0;
  for (const r of records) {
    await client.query(
      `INSERT INTO v3_opportunities (
        id, title, agency, sub_agency, solicitation_number, sam_notice_id,
        status, value_min, value_max, naics, psc,
        set_aside, place_of_performance, response_due_at, posted_at,
        incumbent, description, tags, data_source, analysis,
        analysis_version, ai_analyzed_at, qualified_at, qualified_by,
        source_id, legacy_id, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
        $25, $26, $27, $28
      )
      ON CONFLICT (legacy_id) WHERE legacy_id IS NOT NULL
      DO UPDATE SET
        title = EXCLUDED.title,
        agency = EXCLUDED.agency,
        sub_agency = EXCLUDED.sub_agency,
        solicitation_number = EXCLUDED.solicitation_number,
        sam_notice_id = EXCLUDED.sam_notice_id,
        status = EXCLUDED.status,
        value_min = EXCLUDED.value_min,
        value_max = EXCLUDED.value_max,
        naics = EXCLUDED.naics,
        psc = EXCLUDED.psc,
        set_aside = EXCLUDED.set_aside,
        place_of_performance = EXCLUDED.place_of_performance,
        response_due_at = EXCLUDED.response_due_at,
        posted_at = EXCLUDED.posted_at,
        incumbent = EXCLUDED.incumbent,
        description = EXCLUDED.description,
        tags = EXCLUDED.tags,
        data_source = EXCLUDED.data_source,
        analysis = EXCLUDED.analysis,
        analysis_version = EXCLUDED.analysis_version,
        ai_analyzed_at = EXCLUDED.ai_analyzed_at,
        qualified_at = EXCLUDED.qualified_at,
        qualified_by = EXCLUDED.qualified_by,
        updated_at = CASE
          WHEN EXCLUDED.updated_at > v3_opportunities.updated_at
          THEN EXCLUDED.updated_at
          ELSE v3_opportunities.updated_at
        END`,
      [
        r.id, r.title, r.agency, r.sub_agency, r.solicitation_number,
        r.sam_notice_id, r.status, r.value_min,
        r.value_max, r.naics, r.psc, r.set_aside, r.place_of_performance,
        r.response_due_at, r.posted_at, r.incumbent, r.description, r.tags,
        r.data_source, r.analysis ? JSON.stringify(r.analysis) : null,
        r.analysis_version, r.ai_analyzed_at, r.qualified_at, r.qualified_by,
        r.source_id, r.legacy_id, r.created_at, r.updated_at,
      ],
    );
    count++;
  }
  return count;
}

export async function loadCaptures(
  client: pg.PoolClient,
  records: V3Capture[],
): Promise<number> {
  let count = 0;
  for (const r of records) {
    await client.query(
      `INSERT INTO v3_captures (
        id, opportunity_id, status, analysis, analysis_version,
        ai_analyzed_at, legacy_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (legacy_id) WHERE legacy_id IS NOT NULL
      DO UPDATE SET
        opportunity_id = EXCLUDED.opportunity_id,
        status = EXCLUDED.status,
        analysis = EXCLUDED.analysis,
        analysis_version = EXCLUDED.analysis_version,
        ai_analyzed_at = EXCLUDED.ai_analyzed_at,
        updated_at = CASE
          WHEN EXCLUDED.updated_at > v3_captures.updated_at
          THEN EXCLUDED.updated_at
          ELSE v3_captures.updated_at
        END`,
      [
        r.id, r.opportunity_id, r.status,
        r.analysis ? JSON.stringify(r.analysis) : null,
        r.analysis_version, r.ai_analyzed_at,
        r.legacy_id, r.created_at, r.updated_at,
      ],
    );
    count++;
  }
  return count;
}

export async function loadActionItems(
  client: pg.PoolClient,
  records: V3ActionItem[],
): Promise<number> {
  let count = 0;
  for (const r of records) {
    await client.query(
      `INSERT INTO v3_action_items (
        id, title, detail, owner, status, due_date, source, source_id,
        linked_record_type, linked_record_id, completed_at,
        legacy_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (legacy_id) WHERE legacy_id IS NOT NULL
      DO UPDATE SET
        title = EXCLUDED.title,
        detail = EXCLUDED.detail,
        owner = EXCLUDED.owner,
        status = EXCLUDED.status,
        due_date = EXCLUDED.due_date,
        source = EXCLUDED.source,
        source_id = EXCLUDED.source_id,
        linked_record_type = EXCLUDED.linked_record_type,
        linked_record_id = EXCLUDED.linked_record_id,
        completed_at = EXCLUDED.completed_at,
        updated_at = CASE
          WHEN EXCLUDED.updated_at > v3_action_items.updated_at
          THEN EXCLUDED.updated_at
          ELSE v3_action_items.updated_at
        END`,
      [
        r.id, r.title, r.detail, r.owner, r.status, r.due_date,
        r.source, r.source_id, r.linked_record_type, r.linked_record_id,
        r.completed_at, r.legacy_id, r.created_at, r.updated_at,
      ],
    );
    count++;
  }
  return count;
}

export async function loadSources(
  client: pg.PoolClient,
  records: V3Source[],
): Promise<number> {
  let count = 0;
  for (const r of records) {
    await client.query(
      `INSERT INTO sources (kind, url, title, retrieved_at, confidence, meta, legacy_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (legacy_id) WHERE legacy_id IS NOT NULL
       DO UPDATE SET
         kind = EXCLUDED.kind,
         url = EXCLUDED.url,
         title = EXCLUDED.title,
         retrieved_at = EXCLUDED.retrieved_at,
         confidence = EXCLUDED.confidence,
         meta = EXCLUDED.meta`,
      [r.kind, r.url, r.title, r.retrieved_at, r.confidence, JSON.stringify(r.meta), r.legacy_id, r.created_at],
    );
    count++;
  }
  return count;
}

export async function loadPartners(
  client: pg.PoolClient,
  records: V3Partner[],
): Promise<number> {
  let count = 0;
  for (const r of records) {
    await client.query(
      `INSERT INTO migration_partners (
        id, name, display_name, anchor_company, uei, cage,
        primary_naics, capabilities, certifications, vehicles,
        legacy_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (legacy_id) WHERE legacy_id IS NOT NULL
      DO UPDATE SET
        name = EXCLUDED.name,
        display_name = EXCLUDED.display_name,
        anchor_company = EXCLUDED.anchor_company,
        uei = EXCLUDED.uei,
        cage = EXCLUDED.cage,
        primary_naics = EXCLUDED.primary_naics,
        capabilities = EXCLUDED.capabilities,
        certifications = EXCLUDED.certifications,
        vehicles = EXCLUDED.vehicles,
        updated_at = CASE
          WHEN EXCLUDED.updated_at > migration_partners.updated_at
          THEN EXCLUDED.updated_at
          ELSE migration_partners.updated_at
        END`,
      [
        r.id, r.name, r.display_name, r.anchor_company, r.uei, r.cage,
        r.primary_naics, r.capabilities,
        JSON.stringify(r.certifications), JSON.stringify(r.vehicles),
        r.legacy_id, r.created_at, r.updated_at,
      ],
    );
    count++;
  }
  return count;
}

export async function enqueuePreWarmJobs(
  client: pg.PoolClient,
  jobs: PreWarmJob[],
): Promise<number> {
  if (jobs.length === 0) return 0;

  const pgbossExists = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'pgboss' AND table_name = 'job'
     ) AS "exists"`,
  );
  if (!pgbossExists.rows[0]?.exists) {
    console.log('  pgboss.job table not found — skipping pre-warm job enqueue (OK for CI)');
    return 0;
  }

  let count = 0;
  for (const job of jobs) {
    const queueName = job.entityType === 'opportunity'
      ? 'analysis-opportunity'
      : 'analysis-capture';

    await client.query(
      `INSERT INTO pgboss.job (name, data, priority, state, retrylimit, retrydelay, retrybackoff)
       VALUES ($1, $2, 0, 'created', 3, 5, true)
       ON CONFLICT DO NOTHING`,
      [queueName, JSON.stringify(job)],
    );
    count++;
  }
  return count;
}

export async function loadAll(
  v3DatabaseUrl: string,
  data: {
    opportunities: V3Opportunity[];
    captures: V3Capture[];
    actionItems: V3ActionItem[];
    sources: V3Source[];
    partners: V3Partner[];
    preWarmJobs: PreWarmJob[];
  },
): Promise<LoadResult> {
  const pool = new Pool({
    connectionString: v3DatabaseUrl,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await ensureMigrationTables(client);

    const opportunities = await loadOpportunities(client, data.opportunities);
    const captures = await loadCaptures(client, data.captures);
    const action_items = await loadActionItems(client, data.actionItems);
    const sources = await loadSources(client, data.sources);
    const partners = await loadPartners(client, data.partners);
    const preWarm = await enqueuePreWarmJobs(client, data.preWarmJobs);

    await client.query('COMMIT');

    return {
      opportunities,
      captures,
      action_items,
      sources,
      partners,
      pre_warm_jobs_enqueued: preWarm,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}
