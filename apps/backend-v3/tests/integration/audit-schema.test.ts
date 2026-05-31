/**
 * F-232 — Schema audit as an integration test.
 *
 * Walks src/routes/*.ts and src/workers/*.ts, extracts column names
 * from SQL strings, and verifies they exist in the testcontainer
 * Postgres via information_schema.columns.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import pg from 'pg';
import { getDbUrl } from './helpers.js';

const { Pool } = pg;

interface ColumnRef {
  table: string;
  column: string;
  file: string;
  line: number;
}

const TABLE_NAMES = new Set([
  'sources', 'users', 'opportunities', 'pipeline_items', 'captures',
  'compliance_items', 'action_items', 'action_item_drafts', 'partners',
  'teaming_attachments', 'launchpad_flags',
  'opportunity_analysis_cache', 'capture_analysis_cache',
  'fast_track_assessments', 'analysis_jobs',
  'soak_events', 'soak_metrics',
  'opportunity_analysis_pwin_sources',
  'opportunity_analysis_incumbent_sources',
  'opportunity_analysis_competitors_sources',
  'opportunity_analysis_blackhat_sources',
  'opportunity_analysis_wargame_sources',
  'opportunity_analysis_timeline_sources',
  'opportunity_title_sources',
  'opportunity_agency_sources',
  'opportunity_naics_sources',
  'opportunity_set_aside_sources',
  'opportunity_response_due_at_sources',
  'opportunity_value_sources',
]);

const KNOWN_ALIASES = new Set([
  'pipeline_capture_owner', 'opportunity_title', 'opportunity_agency',
  'opportunity_naics', 'opportunity_set_aside', 'opportunity_due_at',
  'opportunity_value_min', 'opportunity_value_max', 'opportunity_grade',
  'opportunity_ai_analyzed_at', 'opportunity_analysis_version',
  'opportunity_title_sources', 'opportunity_agency_sources',
  'opportunity_naics_sources', 'opportunity_set_aside_sources',
  'opportunity_due_at_sources', 'opportunity_value_min_sources',
  'opportunity_value_max_sources', 'opportunity_grade_sources',
  'pipeline_source_kind', 'pipeline_source_title',
  'pipeline_source_url', 'pipeline_source_retrieved_at',
  'teaming_partners', 'capture_count',
  'count', 'sum', 'avg', 'min', 'max',
  'day', 'api_version',
]);

function extractSqlColumns(filePath: string): ColumnRef[] {
  const content = readFileSync(filePath, 'utf-8');
  const refs: ColumnRef[] = [];

  const sqlPattern = /`([^`]*(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|SET|INTO)[^`]*)`/gs;
  let match;

  while ((match = sqlPattern.exec(content)) !== null) {
    const sql = match[1]!;
    const startLine = content.slice(0, match.index).split('\n').length;

    // INSERT INTO table (col1, col2, ...)
    const insertPattern = /INSERT\s+INTO\s+([a-z_][a-z0-9_]*)\s*\(([^)]+)\)/gi;
    let insertMatch;
    while ((insertMatch = insertPattern.exec(sql)) !== null) {
      const tableName = insertMatch[1]!.toLowerCase();
      if (!TABLE_NAMES.has(tableName)) continue;

      const cols = insertMatch[2]!.split(',').map((c) => c.trim().toLowerCase());
      for (const col of cols) {
        const cleanCol = col.replace(/\s+/g, '');
        if (cleanCol && /^[a-z_][a-z0-9_]*$/.test(cleanCol) && !KNOWN_ALIASES.has(cleanCol)) {
          refs.push({ table: tableName, column: cleanCol, file: basename(filePath), line: startLine });
        }
      }
    }

    // UPDATE table SET col1 = ...
    const updatePattern = /UPDATE\s+([a-z_][a-z0-9_]*)\s+SET\s+([\s\S]*?)(?:WHERE|RETURNING|$)/gi;
    let updateMatch;
    while ((updateMatch = updatePattern.exec(sql)) !== null) {
      const tableName = updateMatch[1]!.toLowerCase();
      if (!TABLE_NAMES.has(tableName)) continue;

      const setClause = updateMatch[2]!;
      const setCols = setClause.matchAll(/([a-z_][a-z0-9_]*)\s*=/gi);
      for (const sc of setCols) {
        const col = sc[1]!.toLowerCase();
        if (!KNOWN_ALIASES.has(col) && col !== 'excluded') {
          refs.push({ table: tableName, column: col, file: basename(filePath), line: startLine });
        }
      }
    }
  }

  return refs;
}

let dbColumns: Set<string>;

beforeAll(async () => {
  const dbUrl = getDbUrl();
  const pool = new Pool({ connectionString: dbUrl, max: 1 });
  try {
    const res = await pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'`,
    );
    dbColumns = new Set(res.rows.map((r) => `${r.table_name}.${r.column_name}`));
  } finally {
    await pool.end();
  }
});

describe('Schema audit', () => {
  it('all SQL column references in routes/ exist in the DB', () => {
    const routesDir = resolve(import.meta.dirname, '../../src/routes');
    const files = readdirSync(routesDir)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => resolve(routesDir, f));

    const missing: ColumnRef[] = [];
    for (const file of files) {
      for (const ref of extractSqlColumns(file)) {
        if (!dbColumns.has(`${ref.table}.${ref.column}`)) {
          missing.push(ref);
        }
      }
    }

    if (missing.length > 0) {
      const report = missing.map((m) => `  ${m.table}.${m.column} (${m.file}:${m.line})`).join('\n');
      expect.fail(`Schema drift: ${missing.length} column(s) referenced in routes/ but missing from DB:\n${report}`);
    }
  });

  it('all SQL column references in workers/ exist in the DB', () => {
    const workersDir = resolve(import.meta.dirname, '../../src/workers');
    const files = readdirSync(workersDir)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => resolve(workersDir, f));

    const missing: ColumnRef[] = [];
    for (const file of files) {
      for (const ref of extractSqlColumns(file)) {
        if (!dbColumns.has(`${ref.table}.${ref.column}`)) {
          missing.push(ref);
        }
      }
    }

    if (missing.length > 0) {
      const report = missing.map((m) => `  ${m.table}.${m.column} (${m.file}:${m.line})`).join('\n');
      expect.fail(`Schema drift: ${missing.length} column(s) referenced in workers/ but missing from DB:\n${report}`);
    }
  });

  it('all SQL column references in services/ exist in the DB', () => {
    const servicesDir = resolve(import.meta.dirname, '../../src/services');
    const files: string[] = [];
    try {
      for (const sub of readdirSync(servicesDir)) {
        const subDir = resolve(servicesDir, sub);
        try {
          const entries = readdirSync(subDir).filter((f) => f.endsWith('.ts'));
          files.push(...entries.map((f) => resolve(subDir, f)));
        } catch {
          // not a directory
        }
      }
    } catch {
      // no services dir
    }

    const missing: ColumnRef[] = [];
    for (const file of files) {
      for (const ref of extractSqlColumns(file)) {
        if (!dbColumns.has(`${ref.table}.${ref.column}`)) {
          missing.push(ref);
        }
      }
    }

    if (missing.length > 0) {
      const report = missing.map((m) => `  ${m.table}.${m.column} (${m.file}:${m.line})`).join('\n');
      expect.fail(`Schema drift: ${missing.length} column(s) referenced in services/ but missing from DB:\n${report}`);
    }
  });
});
