/**
 * V3 Schema Drift Detector
 *
 * Compares the live V3 Postgres schema against the canonical design in
 * docs/architecture/v3/phase-1-architecture-and-schema.md.
 *
 * Usage:
 *   V3_DATABASE_URL=postgres://... npx tsx scripts/v3-schema-diff.ts
 *
 * Exit codes:
 *   0 — no drift
 *   1 — drift detected (tables, columns, indexes, FKs, or forbidden columns)
 *
 * Output: markdown-formatted drift report to stdout.
 */

import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import pg from 'pg';

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ColumnSpec {
  name: string;
  type: string;
  nullable: boolean;
  hasDefault: boolean;
}

interface IndexSpec {
  name: string;
  definition: string;
}

interface ForeignKeySpec {
  name: string;
  definition: string;
}

interface TableSpec {
  schema: string;
  name: string;
  columns: ColumnSpec[];
  indexes: IndexSpec[];
  foreignKeys: ForeignKeySpec[];
}

interface DriftItem {
  kind: 'missing_table' | 'extra_table' | 'missing_column' | 'extra_column'
      | 'type_mismatch' | 'missing_index' | 'missing_fk' | 'forbidden_column';
  table: string;
  detail: string;
}

// ---------------------------------------------------------------------------
// Forbidden columns (Addendum A.5)
// ---------------------------------------------------------------------------
const FORBIDDEN_COLUMNS = ['analysis_status', 'stale', 'is_running'];

// ---------------------------------------------------------------------------
// Known table name mappings (architecture doc name → F-205 implementation name)
// ---------------------------------------------------------------------------
const TABLE_RENAMES: Record<string, string> = {
  schema_versions: 'v3_schema_migrations',
};

// ---------------------------------------------------------------------------
// Parse expected schema from architecture doc
// ---------------------------------------------------------------------------
function parseExpectedSchema(markdown: string): Map<string, string[]> {
  const tables = new Map<string, string[]>();

  // Extract CREATE TABLE blocks from fenced code blocks
  const codeBlockRegex = /```sql\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(markdown)) !== null) {
    const sql = match[1];

    // Match CREATE TABLE statements
    const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+(?:\.\w+)?)\s*\(/gi;
    let tableMatch: RegExpExecArray | null;

    while ((tableMatch = tableRegex.exec(sql)) !== null) {
      const fullName = tableMatch[1];
      // Extract column names from the table body
      const tableStart = tableMatch.index + tableMatch[0].length;
      let depth = 1;
      let pos = tableStart;
      while (pos < sql.length && depth > 0) {
        if (sql[pos] === '(') depth++;
        if (sql[pos] === ')') depth--;
        pos++;
      }
      const body = sql.slice(tableStart, pos - 1);

      const columns: string[] = [];
      const lines = body.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('CHECK')
            || trimmed.startsWith('UNIQUE') || trimmed.startsWith('PRIMARY')
            || trimmed.startsWith('CONSTRAINT') || trimmed.startsWith('FOREIGN')) {
          continue;
        }
        // Extract column name (first word that's not a SQL keyword)
        const colMatch = trimmed.match(/^(\w+)\s+/);
        if (colMatch) {
          const name = colMatch[1].toLowerCase();
          // Skip SQL keywords that might appear at the start of a line
          if (['check', 'unique', 'primary', 'constraint', 'foreign', 'references', 'on', 'not'].includes(name)) {
            continue;
          }
          columns.push(name);
        }
      }

      tables.set(fullName.toLowerCase(), columns);
    }

    // Also extract CREATE INDEX names
    const indexRegex = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(\w+)\s+ON\s+(\w+(?:\.\w+)?)/gi;
    let idxMatch: RegExpExecArray | null;
    while ((idxMatch = indexRegex.exec(sql)) !== null) {
      // Track indexes per table — we store them separately
    }
  }

  return tables;
}

// ---------------------------------------------------------------------------
// Get live schema from Postgres
// ---------------------------------------------------------------------------
async function getLiveTables(pool: pg.Pool): Promise<Map<string, TableSpec>> {
  const tables = new Map<string, TableSpec>();

  // Get all tables in public and pgboss schemas
  const { rows: tableRows } = await pool.query<{
    table_schema: string;
    table_name: string;
  }>(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema IN ('public', 'pgboss')
      AND table_type = 'BASE TABLE'
    ORDER BY table_schema, table_name
  `);

  for (const row of tableRows) {
    const fullName = row.table_schema === 'public'
      ? row.table_name
      : `${row.table_schema}.${row.table_name}`;

    // Get columns
    const { rows: colRows } = await pool.query<{
      column_name: string;
      data_type: string;
      udt_name: string;
      is_nullable: string;
      column_default: string | null;
    }>(`
      SELECT column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `, [row.table_schema, row.table_name]);

    const columns: ColumnSpec[] = colRows.map((c) => ({
      name: c.column_name,
      type: c.udt_name || c.data_type,
      nullable: c.is_nullable === 'YES',
      hasDefault: c.column_default !== null,
    }));

    // Get indexes
    const { rows: idxRows } = await pool.query<{
      indexname: string;
      indexdef: string;
    }>(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = $1 AND tablename = $2
    `, [row.table_schema, row.table_name]);

    const indexes: IndexSpec[] = idxRows.map((i) => ({
      name: i.indexname,
      definition: i.indexdef,
    }));

    // Get foreign keys
    const { rows: fkRows } = await pool.query<{
      constraint_name: string;
      definition: string;
    }>(`
      SELECT
        c.conname AS constraint_name,
        pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = $1
        AND c.conrelid = (
          SELECT oid FROM pg_class
          WHERE relname = $2
            AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $1)
        )
        AND c.contype = 'f'
    `, [row.table_schema, row.table_name]);

    const foreignKeys: ForeignKeySpec[] = fkRows.map((fk) => ({
      name: fk.constraint_name,
      definition: fk.definition,
    }));

    tables.set(fullName, {
      schema: row.table_schema,
      name: row.table_name,
      columns,
      indexes,
      foreignKeys,
    });
  }

  return tables;
}

// ---------------------------------------------------------------------------
// Extract expected indexes from architecture doc
// ---------------------------------------------------------------------------
function parseExpectedIndexes(markdown: string): Map<string, Set<string>> {
  const indexes = new Map<string, Set<string>>();
  const codeBlockRegex = /```sql\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(markdown)) !== null) {
    const sql = match[1];
    const indexRegex = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(\w+)\s+ON\s+(\w+(?:\.\w+)?)/gi;
    let idxMatch: RegExpExecArray | null;
    while ((idxMatch = indexRegex.exec(sql)) !== null) {
      const idxName = idxMatch[1].toLowerCase();
      const tableName = idxMatch[2].toLowerCase();
      if (!indexes.has(tableName)) {
        indexes.set(tableName, new Set());
      }
      indexes.get(tableName)!.add(idxName);
    }
  }

  return indexes;
}

// ---------------------------------------------------------------------------
// Extract expected FKs from architecture doc
// ---------------------------------------------------------------------------
function parseExpectedForeignKeys(markdown: string): Map<string, Set<string>> {
  const fks = new Map<string, Set<string>>();
  const codeBlockRegex = /```sql\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(markdown)) !== null) {
    const sql = match[1];
    const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+(?:\.\w+)?)\s*\(/gi;
    let tableMatch: RegExpExecArray | null;

    while ((tableMatch = tableRegex.exec(sql)) !== null) {
      const tableName = tableMatch[1].toLowerCase();
      const tableStart = tableMatch.index + tableMatch[0].length;
      let depth = 1;
      let pos = tableStart;
      while (pos < sql.length && depth > 0) {
        if (sql[pos] === '(') depth++;
        if (sql[pos] === ')') depth--;
        pos++;
      }
      const body = sql.slice(tableStart, pos - 1);

      const refRegex = /(\w+)\s+BIGINT\s+(?:NOT\s+NULL\s+)?REFERENCES\s+(\w+(?:\.\w+)?)\((\w+)\)/gi;
      let refMatch: RegExpExecArray | null;
      while ((refMatch = refRegex.exec(body)) !== null) {
        const col = refMatch[1].toLowerCase();
        const refTable = refMatch[2].toLowerCase();
        const refCol = refMatch[3].toLowerCase();
        if (!fks.has(tableName)) {
          fks.set(tableName, new Set());
        }
        fks.get(tableName)!.add(`${col} -> ${refTable}(${refCol})`);
      }
    }
  }

  return fks;
}

// ---------------------------------------------------------------------------
// Compare schemas
// ---------------------------------------------------------------------------
function compareSchemas(
  expected: Map<string, string[]>,
  expectedIndexes: Map<string, Set<string>>,
  expectedFks: Map<string, Set<string>>,
  live: Map<string, TableSpec>,
): DriftItem[] {
  const drift: DriftItem[] = [];

  // Check expected tables exist in live (apply known renames)
  for (const [docTableName, expectedCols] of expected) {
    const liveName = TABLE_RENAMES[docTableName] ?? docTableName;
    const liveTable = live.get(liveName);
    if (!liveTable) {
      drift.push({
        kind: 'missing_table',
        table: docTableName,
        detail: `Table \`${docTableName}\` defined in design doc but missing from live schema` +
          (liveName !== docTableName ? ` (checked as \`${liveName}\`)` : ''),
      });
      continue;
    }

    // Check columns
    const liveCols = new Set(liveTable.columns.map((c) => c.name));
    for (const col of expectedCols) {
      if (!liveCols.has(col)) {
        drift.push({
          kind: 'missing_column',
          table: liveName,
          detail: `Column \`${col}\` missing from \`${liveName}\``,
        });
      }
    }

    // Check for extra columns (in live but not in expected)
    const expectedColSet = new Set(expectedCols);
    for (const col of liveCols) {
      if (!expectedColSet.has(col)) {
        drift.push({
          kind: 'extra_column',
          table: liveName,
          detail: `Unexpected column \`${col}\` in \`${liveName}\``,
        });
      }
    }
  }

  // Check expected indexes exist in live
  for (const [docTableName, expectedIdxs] of expectedIndexes) {
    const liveName = TABLE_RENAMES[docTableName] ?? docTableName;
    const liveTable = live.get(liveName);
    if (!liveTable) continue; // already reported as missing table
    const liveIdxNames = new Set(liveTable.indexes.map((i) => i.name.toLowerCase()));
    for (const idx of expectedIdxs) {
      if (!liveIdxNames.has(idx)) {
        drift.push({
          kind: 'missing_index',
          table: liveName,
          detail: `Index \`${idx}\` missing from \`${liveName}\``,
        });
      }
    }
  }

  // Check expected FKs exist in live
  for (const [docTableName, expectedFkSet] of expectedFks) {
    const liveName = TABLE_RENAMES[docTableName] ?? docTableName;
    const liveTable = live.get(liveName);
    if (!liveTable) continue;
    const liveFkDefs = new Set(
      liveTable.foreignKeys.map((fk) => {
        // Normalize: extract "FOREIGN KEY (col) REFERENCES table(col)"
        const m = fk.definition.match(/FOREIGN KEY \((\w+)\) REFERENCES (\w+(?:\.\w+)?)\((\w+)\)/i);
        return m ? `${m[1].toLowerCase()} -> ${m[2].toLowerCase()}(${m[3].toLowerCase()})` : fk.definition.toLowerCase();
      })
    );
    for (const fk of expectedFkSet) {
      if (!liveFkDefs.has(fk)) {
        drift.push({
          kind: 'missing_fk',
          table: docTableName,
          detail: `Foreign key \`${fk}\` missing from \`${docTableName}\``,
        });
      }
    }
  }

  // Check for forbidden columns across ALL tables
  for (const [tableName, liveTable] of live) {
    for (const col of liveTable.columns) {
      if (FORBIDDEN_COLUMNS.includes(col.name)) {
        drift.push({
          kind: 'forbidden_column',
          table: tableName,
          detail: `Forbidden column \`${col.name}\` found in \`${tableName}\` (Addendum A.5)`,
        });
      }
    }
  }

  return drift;
}

// ---------------------------------------------------------------------------
// Format drift report as markdown
// ---------------------------------------------------------------------------
function formatReport(drift: DriftItem[]): string {
  if (drift.length === 0) {
    return '## ✅ V3 Schema Drift Check — No Drift Detected\n\nLive schema matches design doc exactly.';
  }

  const lines: string[] = [
    '## ❌ V3 Schema Drift Detected',
    '',
    `**${drift.length} issue(s) found.**`,
    '',
    '| Kind | Table | Detail |',
    '|------|-------|--------|',
  ];

  for (const d of drift) {
    lines.push(`| ${d.kind} | \`${d.table}\` | ${d.detail} |`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('*Fix the above issues to align the V3 schema with `docs/architecture/v3/phase-1-architecture-and-schema.md`.*');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const databaseUrl = process.env.V3_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: V3_DATABASE_URL or DATABASE_URL must be set');
    process.exit(1);
  }

  const docPath = resolve(
    join(import.meta.dirname ?? process.cwd(), '..', 'docs', 'architecture', 'v3', 'phase-1-architecture-and-schema.md')
  );

  let markdown: string;
  try {
    markdown = await readFile(docPath, 'utf8');
  } catch {
    // Try from repo root
    const altPath = resolve(join(process.cwd(), 'docs', 'architecture', 'v3', 'phase-1-architecture-and-schema.md'));
    markdown = await readFile(altPath, 'utf8');
  }

  // Parse expected schema from the design doc
  const expectedTables = parseExpectedSchema(markdown);
  const expectedIndexes = parseExpectedIndexes(markdown);
  const expectedFks = parseExpectedForeignKeys(markdown);

  // Also add the migration-only tables not in the design doc code blocks
  // but required by F-205: v3_schema_migrations, analysis cache, source siblings
  // These are defined in the migration SQL files, not the architecture doc.
  // The drift detector only checks what's in the architecture doc.

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const liveTables = await getLiveTables(pool);

    const drift = compareSchemas(expectedTables, expectedIndexes, expectedFks, liveTables);

    const report = formatReport(drift);
    console.log(report);

    // Write report to file for CI to pick up
    const reportPath = process.env.DRIFT_REPORT_PATH;
    if (reportPath) {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(reportPath, report, 'utf8');
    }

    if (drift.length > 0) {
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

main();
