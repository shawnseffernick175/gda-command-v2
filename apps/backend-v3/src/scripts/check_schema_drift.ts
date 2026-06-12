/**
 * CI guard: schema drift detector (v2 — bare column detection)
 *
 * Scans .ts/.tsx source files for SQL column/table references and
 * cross-references them against a schema snapshot JSON file.
 *
 * v2 adds bare-column detection: when a query has a single unambiguous
 * FROM table (no JOINs, no subqueries), bare identifiers in SELECT and
 * WHERE clauses are validated against that table's columns.
 *
 * Usage:
 *   node dist/scripts/check_schema_drift.js \
 *     --schema dist/schema-snapshot.json \
 *     --scan apps/backend-v3/src packages/frontend-v3/src \
 *     --allowlist scripts/ci/schema-drift-allowlist.txt
 *
 * Allowlist formats:
 *   table                         — suppress all refs to a table
 *   table.column                  — suppress a specific qualified ref
 *   bare-column:table:column      — suppress a bare column ref for a table
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

interface Allowlists {
  general: Set<string>;
  bareColumn: Set<string>;
}

function loadAllowlist(filePath: string): Allowlists {
  const general = new Set<string>();
  const bareColumn = new Set<string>();
  if (!fs.existsSync(filePath)) return { general, bareColumn };
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const lower = line.toLowerCase();
    if (lower.startsWith('bare-column:')) {
      // bare-column:table:column → "table:column"
      const rest = lower.slice('bare-column:'.length);
      bareColumn.add(rest);
    } else {
      general.add(lower);
    }
  }
  return { general, bareColumn };
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
  bare?: boolean;
}

// ---------------------------------------------------------------------------
// Bare-column detection helpers (v2)
// ---------------------------------------------------------------------------

/** Detect whether the query is single-table (no JOINs, no subqueries). */
const JOIN_RE = /\bJOIN\b/i;
const SUBQUERY_RE = /\(\s*SELECT\b/i;
const FROM_TABLE_RE = /\bFROM\s+([a-z_][a-z0-9_]*)\b/gi;

function getSingleFromTable(
  sql: string,
  schema: SchemaMap,
): string | null {
  if (JOIN_RE.test(sql)) return null;
  if (SUBQUERY_RE.test(sql)) return null;

  FROM_TABLE_RE.lastIndex = 0;
  const tables: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = FROM_TABLE_RE.exec(sql)) !== null) {
    const t = m[1].toLowerCase();
    if (SQL_NOISE.has(t)) continue;
    if (t === '__interp__') continue;
    tables.push(t);
  }

  if (tables.length !== 1) return null;
  const table = tables[0];
  return table in schema ? table : null;
}

/** Bare identifier pattern */
const BARE_IDENT_RE = /^[a-z_][a-z0-9_]*$/;

/**
 * Tokenize a SELECT projection list by commas, respecting parenthesis depth.
 * Returns individual projection expressions.
 */
function tokenizeProjection(projectionStr: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let current = '';

  for (const ch of projectionStr) {
    if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      tokens.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

/**
 * Extract bare identifiers from a single projection expression.
 * Strips casts (::type), aliases (AS name), and extracts identifiers
 * from inside function wrappers.
 */
function extractBareIdents(expr: string): string[] {
  // Skip "*"
  if (expr.trim() === '*') return [];

  // Strip trailing alias: remove "AS identifier" at the end
  let cleaned = expr.replace(/\bAS\s+[a-z_][a-z0-9_]*\s*$/i, '').trim();

  // Strip type casts (::type, ::type[])
  cleaned = cleaned.replace(/::[a-z_][a-z0-9_]*(\[\])?/gi, '');

  // If this is a function call like COUNT(col), COALESCE(a, b), extract inner args
  const funcMatch = cleaned.match(/^[a-z_][a-z0-9_]*\s*\((.*)\)\s*$/i);
  if (funcMatch) {
    const inner = funcMatch[1].trim();
    // Handle COUNT(*), etc.
    if (inner === '*') return [];
    // Recursively tokenize inner args
    const innerTokens = tokenizeProjection(inner);
    const idents: string[] = [];
    for (const t of innerTokens) {
      idents.push(...extractBareIdents(t));
    }
    return idents;
  }

  // If remaining is a simple bare identifier, return it
  const trimmed = cleaned.trim().toLowerCase();
  if (BARE_IDENT_RE.test(trimmed)) {
    return [trimmed];
  }

  return [];
}

/** Extract the SELECT projection string (between SELECT and FROM). */
function extractSelectProjection(sql: string): string | null {
  const match = sql.match(/\bSELECT\s+(DISTINCT\s+)?(.*?)\bFROM\b/is);
  if (!match) return null;
  return match[2].trim();
}

/** Extract WHERE clause (between WHERE and ORDER BY / GROUP BY / LIMIT / end). */
function extractWhereClause(sql: string): string | null {
  const match = sql.match(
    /\bWHERE\b\s+(.*?)(?:\bORDER\s+BY\b|\bGROUP\s+BY\b|\bLIMIT\b|\bHAVING\b|\bRETURNING\b|$)/is,
  );
  if (!match) return null;
  return match[1].trim();
}

/**
 * Extract bare column identifiers from a WHERE clause.
 * Looks for patterns: <ident> <op> and AND/OR <ident> <op>
 */
function extractWhereIdents(whereStr: string): string[] {
  // Strip type casts
  let cleaned = whereStr.replace(/::[a-z_][a-z0-9_]*(\[\])?/gi, '');
  // Strip string literals to avoid false positives
  cleaned = cleaned.replace(/'[^']*'/g, ' __STR__ ');
  // Strip JSON path operators (->>, ->) and their operands
  cleaned = cleaned.replace(/->>?\s*'[^']*'/g, ' ');
  cleaned = cleaned.replace(/->>?\s*[a-z_][a-z0-9_]*/gi, ' ');

  const idents: string[] = [];
  // Match bare identifiers that appear before an operator or IS
  const whereIdentRe =
    /\b([a-z_][a-z0-9_]*)\s*(?:=|!=|<>|>=|<=|>|<|\bIS\b|\bIN\b|\bLIKE\b|\bILIKE\b|\bBETWEEN\b|\bSIMILAR\b)/gi;
  let wm: RegExpExecArray | null;
  while ((wm = whereIdentRe.exec(cleaned)) !== null) {
    const ident = wm[1].toLowerCase();
    if (ident === '__str__' || ident === '__interp__') continue;
    if (BARE_IDENT_RE.test(ident) && !ident.includes('.')) {
      idents.push(ident);
    }
  }
  return idents;
}

/**
 * Extract bare-column refs from a single-table query.
 * Returns Ref[] with bare=true for each bare identifier that doesn't match
 * the table's column list.
 */
function extractBareColumnRefs(
  sql: string,
  lineNum: number,
  schema: SchemaMap,
): Ref[] {
  const table = getSingleFromTable(sql, schema);
  if (!table) return [];

  const refs: Ref[] = [];
  const seen = new Set<string>();

  // --- SELECT clause bare columns ---
  const projection = extractSelectProjection(sql);
  if (projection && projection.trim() !== '*') {
    const tokens = tokenizeProjection(projection);
    for (const tok of tokens) {
      const idents = extractBareIdents(tok);
      for (const ident of idents) {
        if (SQL_NOISE.has(ident)) continue;
        if (ident === '__interp__') continue;
        const key = `bare:${table}.${ident}`;
        if (!seen.has(key)) {
          seen.add(key);
          refs.push({ table, column: ident, line: lineNum, bare: true });
        }
      }
    }
  }

  // --- WHERE clause bare columns ---
  const whereClause = extractWhereClause(sql);
  if (whereClause) {
    const whereIdents = extractWhereIdents(whereClause);
    for (const ident of whereIdents) {
      if (SQL_NOISE.has(ident)) continue;
      if (ident === '__interp__') continue;
      const key = `bare:${table}.${ident}`;
      if (!seen.has(key)) {
        seen.add(key);
        refs.push({ table, column: ident, line: lineNum, bare: true });
      }
    }
  }

  return refs;
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
 * - (v2) Bare column refs in single-table queries: validated against the
 *   FROM table's column list.
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

  // 3. (v2) Bare column refs in single-table queries
  const bareRefs = extractBareColumnRefs(sql, lineNum, schema);
  refs.push(...bareRefs);

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
  allowlists: Allowlists,
  filePath: string,
): Violation[] {
  const violations: Violation[] = [];

  for (const ref of refs) {
    const table = ref.table;
    const col = ref.column;

    if (allowlists.general.has(table)) continue;
    if (col && allowlists.general.has(`${table}.${col}`)) continue;

    // bare-column allowlist: "table:column"
    if (ref.bare && col && allowlists.bareColumn.has(`${table}:${col}`)) {
      continue;
    }

    if (!(table in schema)) {
      // bare refs always have a known table (enforced in extractBareColumnRefs)
      if (ref.bare) continue;
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
      const reference = ref.bare ? `${col} (bare ref → ${table})` : `${table}.${col}`;
      violations.push({
        file: filePath,
        line: ref.line,
        reference,
        reason: 'unknown_column',
      });
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

export {
  extractRefsFromSql,
  extractBareColumnRefs,
  extractBareIdents,
  extractSelectProjection,
  extractWhereIdents,
  getSingleFromTable,
  tokenizeProjection,
  checkRefs,
  loadAllowlist,
  stripInterpolations,
  SQL_NOISE,
};
export type { SchemaMap, Violation, Ref, Allowlists };

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

  const allowlists = loadAllowlist(allowlistPath);
  console.log(
    `Loaded allowlist: ${allowlists.general.size + allowlists.bareColumn.size} entries from ${allowlistPath}`,
  );

  const files = collectFiles(scanDirs);
  console.log(
    `Scanning ${files.length} .ts/.tsx files in: ${scanDirs.join(', ')}`,
  );

  const allViolations: Violation[] = [];
  for (const file of files) {
    const refs = scanFile(file, schema);
    const violations = checkRefs(refs, schema, allowlists, file);
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

// Only run main when executed directly (not when imported for tests)
const isDirectRun =
  process.argv[1]?.endsWith('check_schema_drift.js') ||
  process.argv[1]?.endsWith('check_schema_drift.ts');
if (isDirectRun) {
  main();
}
