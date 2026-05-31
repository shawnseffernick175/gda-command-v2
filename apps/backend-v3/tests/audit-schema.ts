/**
 * F-232 — Schema audit CI gate.
 *
 * Walks apps/backend-v3/src/routes/*.ts and workers/*.ts, extracts
 * column names from SQL strings, connects to the testcontainer Postgres,
 * and compares against information_schema.columns.
 *
 * Exits non-zero if any referenced column is missing from the DB.
 *
 * Usage (requires DATABASE_URL pointing at the migrated testcontainer):
 *   npx tsx tests/audit-schema.ts
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import pg from 'pg';

const { Pool } = pg;

interface ColumnRef {
  table: string;
  column: string;
  file: string;
  line: number;
}

// ─── SQL column extraction ───────────────────────────────────────────

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

// Columns used in SQL template literals that are NOT real DB columns
// (e.g. computed aliases, parameter placeholders)
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
  // common SQL keywords that look like column refs
  'count', 'sum', 'avg', 'min', 'max',
  'day', 'api_version',
]);

function extractColumnRefs(filePath: string): ColumnRef[] {
  const content = readFileSync(filePath, 'utf-8');
  const refs: ColumnRef[] = [];
  const lines = content.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]!;

    // Match table.column references (e.g. c.color_review_stage, pi.capture_owner)
    const dotRefs = line.matchAll(/\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/gi);
    for (const m of dotRefs) {
      const alias = m[1]!;
      const col = m[2]!;

      // Skip common non-table prefixes
      if (['req', 'reply', 'res', 'body', 'row', 'err', 'config', 'app',
        'boss', 'job', 'pool', 'client', 'logger', 'JSON', 'Date',
        'Math', 'Number', 'String', 'process', 'console', 'import',
        'result', 'data', 'query', 'params', 'input', 'output',
        'Buffer', 'Array', 'Object', 'Promise'].includes(alias)) {
        continue;
      }
      if (KNOWN_ALIASES.has(col)) continue;

      refs.push({ table: alias, column: col, file: basename(filePath), line: lineNum + 1 });
    }
  }

  return refs;
}

// Extract columns used in INSERT/SELECT/UPDATE SQL template literals
function extractSqlColumns(filePath: string): ColumnRef[] {
  const content = readFileSync(filePath, 'utf-8');
  const refs: ColumnRef[] = [];
  const lines = content.split('\n');

  // Find SQL template literal strings (backtick strings containing SQL keywords)
  const sqlPattern = /`([^`]*(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|SET|INTO)[^`]*)`/gs;
  let match;

  while ((match = sqlPattern.exec(content)) !== null) {
    const sql = match[1]!;
    const startLine = content.slice(0, match.index).split('\n').length;

    // Extract table.column references from SQL
    const tableColPattern = /\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/gi;
    let colMatch;

    while ((colMatch = tableColPattern.exec(sql)) !== null) {
      const table = colMatch[1]!.toLowerCase();
      const column = colMatch[2]!.toLowerCase();

      // Skip SQL keywords/functions and known aliases
      if (['excluded', 'pg_catalog', 'information_schema'].includes(table)) continue;
      if (KNOWN_ALIASES.has(column)) continue;

      // Map SQL aliases to table names
      const tableMap: Record<string, string> = {
        c: 'captures', pi: 'pipeline_items', o: 'opportunities',
        s: 'sources', p: 'partners', ai: 'action_items',
        aid: 'action_item_drafts', ta: 'teaming_attachments',
        lf: 'launchpad_flags', fta: 'fast_track_assessments',
        oac: 'opportunity_analysis_cache', cac: 'capture_analysis_cache',
        js: 'opportunity_title_sources',
      };

      const resolvedTable = tableMap[table] ?? table;
      if (!TABLE_NAMES.has(resolvedTable)) continue;

      refs.push({ table: resolvedTable, column, file: basename(filePath), line: startLine });
    }

    // Extract column names from INSERT INTO ... (col1, col2, ...) and
    // SELECT col1, col2 FROM table patterns
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

    // UPDATE table SET col1 = ..., col2 = ...
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

// ─── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    console.error('DATABASE_URL not set — run via test:integration or set manually');
    process.exit(1);
  }

  const routesDir = resolve(import.meta.dirname, '../src/routes');
  const workersDir = resolve(import.meta.dirname, '../src/workers');
  const servicesDir = resolve(import.meta.dirname, '../src/services');

  const files: string[] = [];
  for (const dir of [routesDir, workersDir]) {
    const entries = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    files.push(...entries.map((f) => resolve(dir, f)));
  }
  // Also scan service subdirectories
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

  // Collect all column references
  const allRefs: ColumnRef[] = [];
  for (const file of files) {
    allRefs.push(...extractColumnRefs(file));
    allRefs.push(...extractSqlColumns(file));
  }

  // Deduplicate
  const uniqueRefs = new Map<string, ColumnRef>();
  for (const ref of allRefs) {
    const key = `${ref.table}.${ref.column}`;
    if (!uniqueRefs.has(key)) {
      uniqueRefs.set(key, ref);
    }
  }

  // Query information_schema.columns
  const pool = new Pool({ connectionString: dbUrl, max: 1 });
  try {
    const res = await pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'`,
    );

    const dbColumns = new Set<string>();
    for (const row of res.rows) {
      dbColumns.add(`${row.table_name}.${row.column_name}`);
    }

    // Compare
    const missing: ColumnRef[] = [];
    for (const [key, ref] of uniqueRefs) {
      if (!TABLE_NAMES.has(ref.table)) continue;
      if (!dbColumns.has(key)) {
        missing.push(ref);
      }
    }

    if (missing.length > 0) {
      console.error('\n❌ Schema audit FAILED — columns referenced in code but missing from DB:\n');
      for (const m of missing) {
        console.error(`  ${m.table}.${m.column}  (${m.file}:${m.line})`);
      }
      console.error(`\n${missing.length} missing column(s) found.\n`);
      process.exit(1);
    }

    console.log(`✅ Schema audit passed — ${uniqueRefs.size} column references checked, all present in DB.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Schema audit error:', err);
  process.exit(1);
});
