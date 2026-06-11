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
// SQL extraction helpers
// ---------------------------------------------------------------------------

const SQL_KEYWORDS =
  /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|FROM|JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|OUTER\s+JOIN|CROSS\s+JOIN|FULL\s+JOIN|WHERE|ORDER\s+BY|GROUP\s+BY|INTO|VALUES)\b/i;

/** Matches table names after FROM / JOIN / INTO / UPDATE */
const TABLE_AFTER_KEYWORD =
  /\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-z_][a-z0-9_]*)\b/gi;

/** Matches `table.column` patterns in SQL-like strings */
const TABLE_DOT_COL = /\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/gi;

/** SQL keywords and identifiers to skip */
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

function isStringLikelySql(s: string): boolean {
  return SQL_KEYWORDS.test(s);
}

/**
 * Remove ${...} template literal interpolations (including nested braces)
 * so that JS expressions inside template strings are not parsed as SQL.
 */
function stripInterpolations(s: string): string {
  let result = '';
  let i = 0;
  while (i < s.length) {
    if (s[i] === '$' && s[i + 1] === '{') {
      // Skip past the interpolation, tracking brace depth
      let depth = 1;
      i += 2;
      while (i < s.length && depth > 0) {
        if (s[i] === '{') depth++;
        else if (s[i] === '}') depth--;
        i++;
      }
      // Replace interpolation with a placeholder that won't match SQL patterns
      result += ' __INTERP__ ';
    } else {
      result += s[i];
      i++;
    }
  }
  return result;
}

interface Ref {
  table: string;
  column: string | null;
  line: number;
}

/**
 * Extract SQL references from a string known to contain SQL keywords.
 *
 * Strategy:
 * - table.column: only flag if `table` is a KNOWN schema table (catches real
 *   column drift). Unknown table prefixes (e.g. SQL aliases like `o.id`,
 *   `pi.opportunity_id`) are ignored — they are not schema references.
 * - FROM/JOIN/INTO/UPDATE table: flag unknown tables (but skip short aliases
 *   ≤2 chars and noise words).
 */
function extractRefsFromSql(
  sql: string,
  lineNum: number,
  schema: SchemaMap,
): Ref[] {
  const refs: Ref[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;

  // 1. table.column — only check if table is in the schema
  TABLE_DOT_COL.lastIndex = 0;
  while ((m = TABLE_DOT_COL.exec(sql)) !== null) {
    const table = m[1].toLowerCase();
    const col = m[2].toLowerCase();
    if (SQL_NOISE.has(table)) continue;
    if (!(table in schema)) continue; // alias or JS object — skip
    const key = `${table}.${col}`;
    if (!seen.has(key)) {
      seen.add(key);
      refs.push({ table, column: col, line: lineNum });
    }
  }

  // 2. table references after FROM / JOIN / INTO / UPDATE
  //    Only flag names that look like real DB tables: known schema tables,
  //    or snake_case identifiers (contain underscore). Single English words
  //    like "the", "cache", "analysis" are skipped — they appear in LLM
  //    prompt template literals that also contain SQL keywords.
  TABLE_AFTER_KEYWORD.lastIndex = 0;
  while ((m = TABLE_AFTER_KEYWORD.exec(sql)) !== null) {
    const table = m[1].toLowerCase();
    if (SQL_NOISE.has(table)) continue;
    if (table.length <= 2) continue; // short aliases like o, l, pi
    if (table === '__interp__') continue;
    const isKnownTable = table in schema;
    const looksLikeTable = table.includes('_');
    if (!isKnownTable && !looksLikeTable) continue;
    const key = `table:${table}`;
    if (!seen.has(key)) {
      seen.add(key);
      refs.push({ table, column: null, line: lineNum });
    }
  }

  return refs;
}

// ---------------------------------------------------------------------------
// File scanning
// ---------------------------------------------------------------------------

function scanFile(filePath: string, schema: SchemaMap): Ref[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const allRefs: Ref[] = [];

  // Strategy 1: multi-line template literals containing SQL
  const templateLiteralRe = /`([\s\S]*?)`/g;
  let tm: RegExpExecArray | null;
  while ((tm = templateLiteralRe.exec(content)) !== null) {
    const raw = tm[1];
    const body = stripInterpolations(raw);
    if (!isStringLikelySql(body)) continue;
    const startOffset = tm.index;
    let lineNum = 1;
    for (let i = 0; i < startOffset; i++) {
      if (content[i] === '\n') lineNum++;
    }
    const refs = extractRefsFromSql(body, lineNum, schema);
    allRefs.push(...refs);
  }

  // Strategy 2: single-line string literals (single and double quoted)
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const patterns = [/'([^']*)'/g, /"([^"]*)"/g];
    for (const re of patterns) {
      let sm: RegExpExecArray | null;
      while ((sm = re.exec(line)) !== null) {
        const s = sm[1];
        if (s && isStringLikelySql(s)) {
          const refs = extractRefsFromSql(s, i + 1, schema);
          allRefs.push(...refs);
        }
      }
    }
  }

  // Deduplicate
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

    if (allowlist.has(table)) continue;
    if (col && allowlist.has(`${table}.${col}`)) continue;

    if (!(table in schema)) {
      const reference = col ? `${table}.${col}` : table;
      violations.push({
        file: filePath,
        line: ref.line,
        reference,
        reason: 'unknown_table',
      });
      continue;
    }

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

  if (!fs.existsSync(schemaPath)) {
    console.error(`Schema file not found: ${schemaPath}`);
    process.exit(2);
  }
  const schema = loadSchema(schemaPath);
  const tableCount = Object.keys(schema).length;
  console.log(`Loaded schema: ${tableCount} tables from ${schemaPath}`);

  const allowlist = loadAllowlist(allowlistPath);
  console.log(
    `Loaded allowlist: ${allowlist.size} entries from ${allowlistPath}`,
  );

  const files = collectFiles(scanDirs);
  console.log(
    `Scanning ${files.length} .ts/.tsx files in: ${scanDirs.join(', ')}`,
  );

  const allViolations: Violation[] = [];
  for (const file of files) {
    const refs = scanFile(file, schema);
    const violations = checkRefs(refs, schema, allowlist, file);
    allViolations.push(...violations);
  }

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
