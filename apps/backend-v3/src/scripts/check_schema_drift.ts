/**
 * CI guard: schema drift detector
 *
 * Scans .ts/.tsx source files for SQL column/table references and
 * cross-references them against a schema snapshot JSON file.
 *
 * Usage:
 *   node dist/scripts/check_schema_drift.js \
 *     --schema dist/schema-snapshot.json \
 *     --scan apps/backend-v3/src packages/frontend-v3/src \
 *     --allowlist scripts/ci/schema-drift-allowlist.txt
 */

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Violation {
  file: string;
  line: number;
  reference: string;
  reason: 'unknown_table' | 'unknown_column';
}

type SchemaMap = Record<string, string[]>;

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): {
  schemaPath: string;
  scanDirs: string[];
  allowlistPath: string;
} {
  let schemaPath =
    process.env['SCHEMA_JSON_PATH'] ?? 'dist/schema-snapshot.json';
  let scanDirs: string[] = [];
  let allowlistPath = 'scripts/ci/schema-drift-allowlist.txt';

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--schema' && argv[i + 1]) {
      schemaPath = argv[++i];
    } else if (arg === '--scan') {
      while (argv[i + 1] && !argv[i + 1].startsWith('--')) {
        scanDirs.push(argv[++i]);
      }
    } else if (arg === '--allowlist' && argv[i + 1]) {
      allowlistPath = argv[++i];
    }
  }

  if (scanDirs.length === 0) {
    scanDirs = ['apps/backend-v3/src', 'packages/frontend-v3/src'];
  }

  return { schemaPath, scanDirs, allowlistPath };
}

// ---------------------------------------------------------------------------
// Schema loader
// ---------------------------------------------------------------------------

function loadSchema(filePath: string): SchemaMap {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Schema file must be a JSON object: ${filePath}`);
  }
  const schema: SchemaMap = {};
  for (const [table, cols] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    if (!Array.isArray(cols)) {
      throw new Error(
        `Schema entry for "${table}" must be an array of column names`,
      );
    }
    schema[table.toLowerCase()] = cols.map((c: unknown) =>
      String(c).toLowerCase(),
    );
  }
  return schema;
}

// ---------------------------------------------------------------------------
// Allowlist loader
// ---------------------------------------------------------------------------

function loadAllowlist(filePath: string): Set<string> {
  const entries = new Set<string>();
  if (!fs.existsSync(filePath)) return entries;
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    entries.add(line.toLowerCase());
  }
  return entries;
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

function collectFiles(dirs: string[]): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        files.push(full);
      }
    }
  }

  for (const d of dirs) walk(d);
  return files;
}

// ---------------------------------------------------------------------------
// SQL extraction & reference collection
// ---------------------------------------------------------------------------

const SQL_KEYWORDS =
  /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|FROM|JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|OUTER\s+JOIN|CROSS\s+JOIN|FULL\s+JOIN|SET|WHERE|ORDER\s+BY|GROUP\s+BY|ON|INTO|VALUES)\b/i;

/** Matches `table.column` patterns in SQL-like strings */
const TABLE_DOT_COL = /\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/gi;

/** Matches table names after FROM / JOIN / INTO / UPDATE */
const TABLE_AFTER_KEYWORD =
  /\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-z_][a-z0-9_]*)\b/gi;

/** Matches column names in SELECT ... FROM, WHERE, SET, ON, ORDER BY, GROUP BY contexts */
const COL_IN_CLAUSE =
  /\b(?:SELECT|WHERE|SET|ON|ORDER\s+BY|GROUP\s+BY)\s+([\s\S]*?)(?:\bFROM\b|\bWHERE\b|\bSET\b|\bLIMIT\b|\bORDER\b|\bGROUP\b|\bHAVING\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|;|$)/gi;

const BARE_IDENT = /\b([a-z_][a-z0-9_]*)\b/gi;

/** SQL keywords and common noise to skip when looking for bare identifiers */
const SQL_NOISE = new Set([
  'select', 'from', 'where', 'and', 'or', 'not', 'in', 'is', 'null',
  'true', 'false', 'as', 'on', 'set', 'into', 'values', 'insert',
  'update', 'delete', 'join', 'left', 'right', 'inner', 'outer',
  'cross', 'full', 'order', 'by', 'group', 'having', 'limit', 'offset',
  'asc', 'desc', 'distinct', 'count', 'sum', 'avg', 'min', 'max',
  'case', 'when', 'then', 'else', 'end', 'between', 'like', 'ilike',
  'exists', 'all', 'any', 'cast', 'coalesce', 'nullif', 'now',
  'current_timestamp', 'current_date', 'interval', 'extract', 'epoch',
  'varchar', 'text', 'integer', 'int', 'bigint', 'boolean', 'bool',
  'jsonb', 'json', 'uuid', 'timestamp', 'date', 'numeric', 'float',
  'serial', 'primary', 'key', 'references', 'foreign', 'constraint',
  'default', 'create', 'alter', 'drop', 'table', 'index', 'unique',
  'check', 'cascade', 'restrict', 'with', 'recursive', 'returning',
  'conflict', 'do', 'nothing', 'excluded', 'array', 'array_agg',
  'string_agg', 'row_number', 'over', 'partition', 'unnest', 'lateral',
  'public', 'information_schema', 'columns', 'table_name', 'column_name',
  'table_schema', 'ordinal_position', 'using', 'begin', 'commit',
  'rollback', 'transaction', 'to_char', 'to_timestamp', 'lower', 'upper',
  'trim', 'length', 'replace', 'concat', 'substring', 'position',
  'overlay', 'placing', 'for', 'if', 'elsif', 'loop', 'return',
  'declare', 'perform', 'raise', 'notice', 'exception', 'type',
  'enum', 'schema', 'grant', 'revoke', 'pg_catalog',
  'isnull', 'notnull', 'similar', 'escape', 'collate',
  'union', 'intersect', 'except', 'fetch', 'next', 'prior',
  'first', 'last', 'absolute', 'relative', 'forward', 'backward',
  'window', 'range', 'rows', 'groups', 'preceding', 'following',
  'unbounded', 'current', 'row', 'exclude', 'ties', 'no', 'others',
]);

interface Ref {
  table: string;
  column: string | null;
  line: number;
}

function isStringLikelySql(s: string): boolean {
  return SQL_KEYWORDS.test(s);
}

/**
 * Extracts string literal and template literal bodies from a source line.
 * Simplified — grabs content between quotes/backticks.
 */
function extractStrings(line: string): string[] {
  const results: string[] = [];
  // Template literals and regular strings — simplified extraction
  const patterns = [
    /`([^`]*)`/g,
    /'([^']*)'/g,
    /"([^"]*)"/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      if (m[1]) results.push(m[1]);
    }
  }
  return results;
}

function extractRefsFromSql(sql: string, lineNum: number): Ref[] {
  const refs: Ref[] = [];
  const seen = new Set<string>();

  // 1. table.column references
  let m: RegExpExecArray | null;
  TABLE_DOT_COL.lastIndex = 0;
  while ((m = TABLE_DOT_COL.exec(sql)) !== null) {
    const table = m[1].toLowerCase();
    const col = m[2].toLowerCase();
    if (SQL_NOISE.has(table)) continue;
    const key = `${table}.${col}`;
    if (!seen.has(key)) {
      seen.add(key);
      refs.push({ table, column: col, line: lineNum });
    }
  }

  // 2. table references after FROM / JOIN / INTO / UPDATE
  TABLE_AFTER_KEYWORD.lastIndex = 0;
  while ((m = TABLE_AFTER_KEYWORD.exec(sql)) !== null) {
    const table = m[1].toLowerCase();
    if (SQL_NOISE.has(table)) continue;
    const key = `table:${table}`;
    if (!seen.has(key)) {
      seen.add(key);
      refs.push({ table, column: null, line: lineNum });
    }
  }

  return refs;
}

// ---------------------------------------------------------------------------
// Multi-line SQL string handling
// ---------------------------------------------------------------------------

/**
 * Scans a file for SQL strings, handling multi-line template literals.
 * Returns all table/column references found.
 */
function scanFile(filePath: string): Ref[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const allRefs: Ref[] = [];

  // Strategy 1: scan for multi-line template literals containing SQL
  const templateLiteralRe = /`([\s\S]*?)`/g;
  let tm: RegExpExecArray | null;
  while ((tm = templateLiteralRe.exec(content)) !== null) {
    const body = tm[1];
    if (!isStringLikelySql(body)) continue;
    // Determine line number of the start of this match
    const startOffset = tm.index;
    let lineNum = 1;
    for (let i = 0; i < startOffset; i++) {
      if (content[i] === '\n') lineNum++;
    }
    const refs = extractRefsFromSql(body, lineNum);
    allRefs.push(...refs);
  }

  // Strategy 2: scan individual lines for single-line string literals
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Single-quoted and double-quoted strings
    const strings = extractStrings(line).filter(
      (s) => !s.includes('`') && isStringLikelySql(s),
    );
    for (const s of strings) {
      const refs = extractRefsFromSql(s, i + 1);
      allRefs.push(...refs);
    }
  }

  // Deduplicate refs (template literal scan may overlap with line scan)
  const deduped: Ref[] = [];
  const seenKeys = new Set<string>();
  for (const ref of allRefs) {
    const key = `${ref.table}:${ref.column ?? ''}:${ref.line}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      deduped.push(ref);
    }
  }

  return deduped;
}

// ---------------------------------------------------------------------------
// Violation checking
// ---------------------------------------------------------------------------

function checkRefs(
  refs: Ref[],
  schema: SchemaMap,
  allowlist: Set<string>,
  filePath: string,
): Violation[] {
  const violations: Violation[] = [];

  for (const ref of refs) {
    const table = ref.table;
    const col = ref.column;

    // Check allowlist
    if (allowlist.has(table)) continue;
    if (col && allowlist.has(`${table}.${col}`)) continue;

    // Check table existence
    if (!(table in schema)) {
      // Only flag as unknown_table if we have no column (pure table ref)
      // For table.column refs, we flag as unknown_table too since the table doesn't exist
      const reference = col ? `${table}.${col}` : table;
      violations.push({
        file: filePath,
        line: ref.line,
        reference,
        reason: 'unknown_table',
      });
      continue;
    }

    // Check column existence
    if (col && !schema[table].includes(col)) {
      violations.push({
        file: filePath,
        line: ref.line,
        reference: `${table}.${col}`,
        reason: 'unknown_column',
      });
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const { schemaPath, scanDirs, allowlistPath } = parseArgs(process.argv);

  // Load schema
  if (!fs.existsSync(schemaPath)) {
    console.error(`Schema file not found: ${schemaPath}`);
    process.exit(2);
  }
  const schema = loadSchema(schemaPath);
  const tableCount = Object.keys(schema).length;
  console.log(`Loaded schema: ${tableCount} tables from ${schemaPath}`);

  // Load allowlist
  const allowlist = loadAllowlist(allowlistPath);
  console.log(
    `Loaded allowlist: ${allowlist.size} entries from ${allowlistPath}`,
  );

  // Collect files
  const files = collectFiles(scanDirs);
  console.log(
    `Scanning ${files.length} .ts/.tsx files in: ${scanDirs.join(', ')}`,
  );

  // Scan and check
  const allViolations: Violation[] = [];
  for (const file of files) {
    const refs = scanFile(file);
    const violations = checkRefs(refs, schema, allowlist, file);
    allViolations.push(...violations);
  }

  // Report
  if (allViolations.length > 0) {
    console.log('');
    console.log(`Schema drift detected: ${allViolations.length} violation(s)`);
    console.log('');
    for (const v of allViolations) {
      console.log(`${v.file}:${v.line} — ${v.reference} (${v.reason})`);
    }
    console.log('');
    console.log(
      'Fix the references above or add them to the allowlist at:',
    );
    console.log(`  ${allowlistPath}`);
    process.exit(1);
  }

  console.log('');
  console.log('Schema drift check passed. 0 violations.');
  process.exit(0);
}

main();
