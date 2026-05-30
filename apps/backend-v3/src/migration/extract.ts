/**
 * Extract — read from legacy V2 tables (read-only).
 *
 * Reads from `sam_opportunities`, `gda_opportunity_tracker`, `opportunities`,
 * `gda_capture_plans`, `gda_action_items`, `source_registry`,
 * and `gda_teaming_partners`.
 *
 * Connection via LEGACY_DATABASE_URL env var, separate Pool from V3.
 */

import pg from 'pg';
import type {
  LegacyOpportunity,
  LegacyCapture,
  LegacyActionItem,
  LegacySource,
  LegacyPartner,
} from './types.js';

const { Pool } = pg;

export interface ExtractResult {
  opportunities: LegacyOpportunity[];
  captures: LegacyCapture[];
  actionItems: LegacyActionItem[];
  sources: LegacySource[];
  partners: LegacyPartner[];
}

export interface ExtractCounts {
  opportunities: number;
  captures: number;
  action_items: number;
  sources: number;
  partners: number;
}

function safeString(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  return String(val);
}

function safeNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function safeArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') {
    try {
      const parsed: unknown = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch { /* not JSON */ }
    return val.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function safeJson(val: unknown): Record<string, unknown> | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object' && !Array.isArray(val)) return val as Record<string, unknown>;
  if (typeof val === 'string') {
    try {
      const parsed: unknown = JSON.parse(val);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch { /* not JSON */ }
  }
  return null;
}

async function tableExists(pool: pg.Pool, tableName: string): Promise<boolean> {
  const res = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_name = $1 AND table_schema = 'public'
     ) AS "exists"`,
    [tableName],
  );
  return res.rows[0]?.exists ?? false;
}

export async function extractOpportunities(legacyPool: pg.Pool): Promise<LegacyOpportunity[]> {
  const results: LegacyOpportunity[] = [];

  if (await tableExists(legacyPool, 'sam_opportunities')) {
    const res = await legacyPool.query('SELECT * FROM sam_opportunities ORDER BY id');
    for (const row of res.rows) {
      const r = row as Record<string, unknown>;
      results.push({
        id: String(r['id']),
        notice_id: safeString(r['notice_id']),
        solicitation_number: safeString(r['solicitation_number']),
        title: String(r['title'] ?? 'Untitled'),
        agency: safeString(r['agency']),
        sub_agency: safeString(r['sub_agency']),
        status: safeString(r['status']),
        posted_date: safeString(r['posted_date']),
        response_deadline: safeString(r['response_deadline']),
        naics: safeString(r['naics']),
        psc: safeString(r['psc']),
        set_aside: safeString(r['set_aside']),
        value: safeNumber(r['value']),
        place_of_performance: safeString(r['place_of_performance']),
        description: safeString(r['description']),
        raw_source_url: safeString(r['source_url'] ?? r['raw_source_url']),
        data_source: 'sam_gov',
        tags: safeArray(r['tags']),
        created_at: safeString(r['created_at']),
        updated_at: safeString(r['updated_at']),
      });
    }
  }

  if (await tableExists(legacyPool, 'gda_opportunity_tracker')) {
    const res = await legacyPool.query('SELECT * FROM gda_opportunity_tracker ORDER BY id');
    for (const row of res.rows) {
      const r = row as Record<string, unknown>;
      results.push({
        id: `tracker-${r['id']}`,
        solicitation_number: safeString(r['solicitation_number']),
        title: String(r['title'] ?? 'Untitled'),
        agency: safeString(r['agency']),
        status: safeString(r['status']),
        value: safeNumber(r['value_estimated'] ?? r['value']),
        naics: safeString(r['naics']),
        raw_source_url: safeString(r['source_url']),
        data_source: 'n8n_workflow',
        tags: safeArray(r['tags']),
        analysis: safeJson(r['analysis']),
        created_at: safeString(r['created_at']),
        updated_at: safeString(r['updated_at']),
      });
    }
  }

  if (await tableExists(legacyPool, 'opportunities')) {
    const res = await legacyPool.query('SELECT * FROM opportunities ORDER BY id');
    for (const row of res.rows) {
      const r = row as Record<string, unknown>;
      results.push({
        id: `legacy-${r['id']}`,
        solicitation_number: safeString(r['solicitation_number']),
        title: String(r['title'] ?? 'Untitled'),
        agency: safeString(r['agency']),
        sub_agency: safeString(r['sub_agency']),
        status: safeString(r['status']),
        value_min: safeNumber(r['value_min'] ?? r['value_estimated']),
        value_max: safeNumber(r['value_max']),
        naics: safeString(r['naics']),
        psc: safeString(r['psc']),
        set_aside: safeString(r['set_aside']),
        description: safeString(r['description']),
        raw_source_url: safeString(r['raw_source_url'] ?? r['source_url']),
        data_source: safeString(r['data_source']) ?? 'manual',
        incumbent: safeString(r['incumbent']),
        tags: safeArray(r['tags']),
        analysis: safeJson(r['analysis']),
        analysis_version: safeString(r['analysis_version']),
        ai_analyzed_at: safeString(r['ai_analyzed_at']),
        qualified_at: safeString(r['qualified_at']),
        qualified_by: safeString(r['qualified_by']),
        created_at: safeString(r['created_at']),
        updated_at: safeString(r['updated_at']),
      });
    }
  }

  return results;
}

export async function extractCaptures(legacyPool: pg.Pool): Promise<LegacyCapture[]> {
  const results: LegacyCapture[] = [];

  if (await tableExists(legacyPool, 'gda_capture_plans')) {
    const res = await legacyPool.query('SELECT * FROM gda_capture_plans ORDER BY id');
    for (const row of res.rows) {
      const r = row as Record<string, unknown>;
      results.push({
        id: String(r['id']),
        opportunity_id: safeString(r['opportunity_id']),
        title: safeString(r['title']),
        capture_owner: safeString(r['capture_owner'] ?? r['owner']),
        status: safeString(r['status']),
        win_probability: safeNumber(r['win_probability'] ?? r['pwin']),
        win_prob_evidence: safeString(r['win_prob_evidence']),
        milestone_90day: safeString(r['milestone_90day']),
        analysis: safeJson(r['analysis']),
        analysis_version: safeString(r['analysis_version']),
        ai_analyzed_at: safeString(r['ai_analyzed_at']),
        teaming_partners: safeArray(r['teaming_partners']),
        created_at: safeString(r['created_at']),
        updated_at: safeString(r['updated_at']),
      });
    }
  }

  return results;
}

export async function extractActionItems(legacyPool: pg.Pool): Promise<LegacyActionItem[]> {
  const results: LegacyActionItem[] = [];

  if (await tableExists(legacyPool, 'gda_action_items')) {
    const res = await legacyPool.query('SELECT * FROM gda_action_items ORDER BY id');
    for (const row of res.rows) {
      const r = row as Record<string, unknown>;
      results.push({
        id: String(r['id']),
        title: String(r['title'] ?? 'Untitled'),
        detail: safeString(r['detail'] ?? r['description']),
        owner: safeString(r['owner'] ?? r['assigned_to']) ?? 'Shawn',
        status: safeString(r['status']),
        due_date: safeString(r['due_date']),
        source: safeString(r['source']),
        source_id: safeString(r['source_id']),
        linked_record_type: safeString(r['linked_record_type'] ?? r['entity_type']),
        linked_record_id: safeString(r['linked_record_id'] ?? r['entity_id']),
        completed_at: safeString(r['completed_at']),
        created_at: safeString(r['created_at']),
        updated_at: safeString(r['updated_at']),
      });
    }
  }

  return results;
}

export async function extractSources(legacyPool: pg.Pool): Promise<LegacySource[]> {
  const results: LegacySource[] = [];

  if (await tableExists(legacyPool, 'source_registry')) {
    const res = await legacyPool.query('SELECT * FROM source_registry ORDER BY id');
    for (const row of res.rows) {
      const r = row as Record<string, unknown>;
      results.push({
        id: String(r['id']),
        kind: safeString(r['kind'] ?? r['source_type']),
        url: safeString(r['url'] ?? r['base_url']),
        title: safeString(r['title'] ?? r['name']),
        retrieved_at: safeString(r['retrieved_at'] ?? r['last_synced_at']),
        confidence: safeString(r['confidence']),
        meta: safeJson(r['meta'] ?? r['config']) ?? {},
        created_at: safeString(r['created_at']),
      });
    }
  }

  return results;
}

export async function extractPartners(legacyPool: pg.Pool): Promise<LegacyPartner[]> {
  const results: LegacyPartner[] = [];

  if (await tableExists(legacyPool, 'gda_teaming_partners')) {
    const res = await legacyPool.query('SELECT * FROM gda_teaming_partners ORDER BY id');
    for (const row of res.rows) {
      const r = row as Record<string, unknown>;
      results.push({
        id: String(r['id']),
        name: String(r['name'] ?? r['company_name'] ?? 'Unknown'),
        display_name: safeString(r['display_name']),
        anchor_company: safeString(r['anchor_company'] ?? r['company_name']),
        uei: safeString(r['uei']),
        cage: safeString(r['cage']),
        primary_naics: safeString(r['primary_naics'] ?? r['naics']),
        capabilities: safeArray(r['capabilities']),
        certifications: Array.isArray(r['certifications']) ? r['certifications'] as unknown[] : [],
        vehicles: Array.isArray(r['vehicles']) ? r['vehicles'] as unknown[] : [],
        created_at: safeString(r['created_at']),
        updated_at: safeString(r['updated_at']),
      });
    }
  }

  return results;
}

export async function extractAll(legacyDatabaseUrl: string): Promise<ExtractResult> {
  const pool = new Pool({
    connectionString: legacyDatabaseUrl,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  try {
    const [opportunities, captures, actionItems, sources, partners] = await Promise.all([
      extractOpportunities(pool),
      extractCaptures(pool),
      extractActionItems(pool),
      extractSources(pool),
      extractPartners(pool),
    ]);

    return { opportunities, captures, actionItems, sources, partners };
  } finally {
    await pool.end();
  }
}

export async function extractCounts(legacyDatabaseUrl: string): Promise<ExtractCounts> {
  const pool = new Pool({
    connectionString: legacyDatabaseUrl,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  try {
    const counts: ExtractCounts = {
      opportunities: 0,
      captures: 0,
      action_items: 0,
      sources: 0,
      partners: 0,
    };

    const tables: [keyof ExtractCounts, string[]][] = [
      ['opportunities', ['sam_opportunities', 'gda_opportunity_tracker', 'opportunities']],
      ['captures', ['gda_capture_plans']],
      ['action_items', ['gda_action_items']],
      ['sources', ['source_registry']],
      ['partners', ['gda_teaming_partners']],
    ];

    for (const [key, tableNames] of tables) {
      for (const t of tableNames) {
        if (await tableExists(pool, t)) {
          const res = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM "${t}"`);
          counts[key] += parseInt(res.rows[0]?.count ?? '0', 10);
        }
      }
    }

    return counts;
  } finally {
    await pool.end();
  }
}
