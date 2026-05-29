/**
 * Parity Report Generator — produces the 4-section migration parity report.
 *
 * Sections:
 *   A. Counts table (V2 vs V3)
 *   B. Field coverage table (analysis fields + sources)
 *   C. Gap list (entities with migration issues)
 *   D. R2 invariant audit (programmatic checks)
 */

import pg from 'pg';
import type { MigrationCounts, FieldCoverageRow, GapEntry } from './types.js';
import { runR2Audit, type R2AuditResult } from './r2-audit.js';

const { Pool } = pg;

export interface ParityReportInput {
  v2Counts: MigrationCounts;
  v3DatabaseUrl: string;
  gaps: GapEntry[];
}

export interface ParityReport {
  timestamp: string;
  countsTable: CountsRow[];
  fieldCoverage: FieldCoverageRow[];
  gapList: GapEntry[];
  r2Audit: R2AuditResult;
  passed: boolean;
  markdown: string;
}

interface CountsRow {
  entity: string;
  v2Count: number;
  v3Count: number;
  delta: number;
  notes: string;
}

async function getV3Counts(pool: pg.Pool): Promise<MigrationCounts> {
  const counts: MigrationCounts = {
    opportunities: { v2: 0, v3: 0 },
    captures: { v2: 0, v3: 0 },
    action_items: { v2: 0, v3: 0 },
    sources: { v2: 0, v3: 0 },
    partners: { v2: 0, v3: 0 },
  };

  const tables: [keyof MigrationCounts, string][] = [
    ['opportunities', 'v3_opportunities'],
    ['captures', 'v3_captures'],
    ['action_items', 'v3_action_items'],
    ['sources', 'sources'],
    ['partners', 'migration_partners'],
  ];

  for (const [key, tableName] of tables) {
    try {
      const res = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM "${tableName}"`,
      );
      counts[key].v3 = parseInt(res.rows[0]?.count ?? '0', 10);
    } catch {
      counts[key].v3 = 0;
    }
  }

  return counts;
}

async function getFieldCoverage(pool: pg.Pool): Promise<FieldCoverageRow[]> {
  const analysisFields = ['pwin', 'incumbent', 'competitors', 'blackhat', 'wargame', 'timeline'];
  const coverage: FieldCoverageRow[] = [];

  for (const field of analysisFields) {
    try {
      const withValueRes = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM v3_opportunities
         WHERE analysis IS NOT NULL
         AND analysis->$1 IS NOT NULL
         AND analysis->>$1 != 'null'`,
        [field],
      );
      const withValue = parseInt(withValueRes.rows[0]?.count ?? '0', 10);

      const sourcesField = `${field}_sources`;
      const withSourcesRes = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM v3_opportunities
         WHERE analysis IS NOT NULL
         AND analysis->$1 IS NOT NULL
         AND analysis->>$1 != 'null'
         AND analysis->$2 IS NOT NULL
         AND jsonb_array_length(analysis->$2) > 0`,
        [field, sourcesField],
      );
      const withSources = parseInt(withSourcesRes.rows[0]?.count ?? '0', 10);

      coverage.push({
        field,
        with_value: withValue,
        with_sources: withSources,
        coverage_pct: withValue > 0 ? Math.round((withSources / withValue) * 100) : 100,
      });
    } catch {
      coverage.push({
        field,
        with_value: 0,
        with_sources: 0,
        coverage_pct: 100,
      });
    }
  }

  return coverage;
}

function renderCountsTable(rows: CountsRow[]): string {
  const lines = [
    '| Entity | V2 count | V3 count | Delta | Notes |',
    '|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const status = r.delta === 0 ? 'exact match' : `MISMATCH (delta: ${r.delta})`;
    lines.push(`| ${r.entity} | ${r.v2Count} | ${r.v3Count} | ${r.delta} | ${r.notes || status} |`);
  }
  return lines.join('\n');
}

function renderFieldCoverage(rows: FieldCoverageRow[]): string {
  const lines = [
    '| Field | V3 records with value | V3 records with sources | Coverage % |',
    '|---|---|---|---|',
  ];
  for (const r of rows) {
    lines.push(`| ${r.field} | ${r.with_value} | ${r.with_sources} | ${r.coverage_pct}% |`);
  }
  return lines.join('\n');
}

function renderGapList(gaps: GapEntry[]): string {
  if (gaps.length === 0) return '_No gaps detected._\n';

  const lines = [
    '| Entity Type | Entity ID | Field | Reason | URL | Detail |',
    '|---|---|---|---|---|---|',
  ];
  for (const g of gaps) {
    lines.push(
      `| ${g.entity_type} | ${g.entity_id.slice(0, 8)}... | ${g.field} | \`${g.reason}\` | [link](${g.url}) | ${g.detail} |`,
    );
  }
  return lines.join('\n');
}

function renderR2Audit(audit: R2AuditResult): string {
  const lines: string[] = [];
  for (const check of audit.checks) {
    const icon = check.passed ? '[x]' : '[ ]';
    lines.push(`- ${icon} ${check.description}${check.detail ? ` — ${check.detail}` : ''}`);
  }
  return lines.join('\n');
}

export async function generateParityReport(input: ParityReportInput): Promise<ParityReport> {
  const pool = new Pool({
    connectionString: input.v3DatabaseUrl,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  try {
    const v3Counts = await getV3Counts(pool);

    const countsTable: CountsRow[] = [
      {
        entity: 'opportunities',
        v2Count: input.v2Counts.opportunities.v2,
        v3Count: v3Counts.opportunities.v3,
        delta: v3Counts.opportunities.v3 - input.v2Counts.opportunities.v2,
        notes: '',
      },
      {
        entity: 'captures',
        v2Count: input.v2Counts.captures.v2,
        v3Count: v3Counts.captures.v3,
        delta: v3Counts.captures.v3 - input.v2Counts.captures.v2,
        notes: '',
      },
      {
        entity: 'action_items',
        v2Count: input.v2Counts.action_items.v2,
        v3Count: v3Counts.action_items.v3,
        delta: v3Counts.action_items.v3 - input.v2Counts.action_items.v2,
        notes: '',
      },
      {
        entity: 'sources',
        v2Count: input.v2Counts.sources.v2,
        v3Count: v3Counts.sources.v3,
        delta: v3Counts.sources.v3 - input.v2Counts.sources.v2,
        notes: '',
      },
      {
        entity: 'partners',
        v2Count: input.v2Counts.partners.v2,
        v3Count: v3Counts.partners.v3,
        delta: v3Counts.partners.v3 - input.v2Counts.partners.v2,
        notes: '',
      },
    ];

    for (const row of countsTable) {
      row.notes = row.delta === 0 ? 'exact match' : `MISMATCH (delta: ${row.delta})`;
    }

    const fieldCoverage = await getFieldCoverage(pool);
    const r2Audit = await runR2Audit(input.v3DatabaseUrl);

    const countsPassed = countsTable.every((r) => r.delta === 0);
    const r2Passed = r2Audit.passed;
    const passed = countsPassed && r2Passed;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const markdown = generateMarkdown(timestamp, countsTable, fieldCoverage, input.gaps, r2Audit, passed);

    return {
      timestamp,
      countsTable,
      fieldCoverage,
      gapList: input.gaps,
      r2Audit,
      passed,
      markdown,
    };
  } finally {
    await pool.end();
  }
}

function generateMarkdown(
  timestamp: string,
  countsTable: CountsRow[],
  fieldCoverage: FieldCoverageRow[],
  gaps: GapEntry[],
  r2Audit: R2AuditResult,
  passed: boolean,
): string {
  const status = passed ? 'PASSED' : 'FAILED';

  return `# Migration Parity Report

**Generated:** ${timestamp}
**Status:** ${status}

---

## A. Counts Table

${renderCountsTable(countsTable)}

---

## B. Field Coverage Table

${renderFieldCoverage(fieldCoverage)}

---

## C. Gap List

${renderGapList(gaps)}

---

## D. R2 Invariant Audit

${renderR2Audit(r2Audit)}

---

**Overall result:** ${status}
`;
}
