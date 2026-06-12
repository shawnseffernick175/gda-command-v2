import { describe, it, expect } from 'vitest';
import {
  extractRefsFromSql,
  extractBareColumnRefs,
  extractBareIdents,
  extractSelectProjection,
  extractWhereIdents,
  getSingleFromTable,
  tokenizeProjection,
  checkRefs,
  stripInterpolations,
  SQL_NOISE,
} from '../src/scripts/check_schema_drift.js';
import type { SchemaMap, Allowlists } from '../src/scripts/check_schema_drift.js';

// ---------------------------------------------------------------------------
// Shared test schema — mirrors a subset of the real `opportunities` table
// ---------------------------------------------------------------------------

const TEST_SCHEMA: SchemaMap = {
  opportunities: [
    'id', 'solicitation_number', 'naics', 'agency',
    'place_of_performance', 'value_min', 'value_max',
    'deleted_at', 'title', 'description', 'status',
    'posted_at', 'response_due_at', 'link_id', 'created_at',
    'updated_at', 'incumbent', 'incumbent_confidence',
  ],
  captures: [
    'id', 'opportunity_id', 'stage', 'owner_id', 'notes',
    'created_at', 'updated_at',
  ],
  users: [
    'id', 'email', 'display_name', 'role', 'is_active',
  ],
};

const EMPTY_ALLOWLISTS: Allowlists = {
  general: new Set(),
  bareColumn: new Set(),
};

// ---------------------------------------------------------------------------
// PR #795 regression fixture — the exact SQL that slipped past v1
// ---------------------------------------------------------------------------

const PR795_SQL = `SELECT id, solicitation_number, naics, agency,
       place_of_performance_state,
       value_min::text, value_max::text
FROM opportunities
WHERE deleted_at IS NULL`;

// ---------------------------------------------------------------------------
// getSingleFromTable
// ---------------------------------------------------------------------------

describe('getSingleFromTable', () => {
  it('returns the table for a simple single-table query', () => {
    expect(getSingleFromTable('SELECT id FROM opportunities WHERE id = 1', TEST_SCHEMA)).toBe('opportunities');
  });

  it('returns null for JOIN queries', () => {
    expect(getSingleFromTable(
      'SELECT o.id FROM opportunities o JOIN captures c ON c.opportunity_id = o.id',
      TEST_SCHEMA,
    )).toBeNull();
  });

  it('returns null for subqueries', () => {
    expect(getSingleFromTable(
      'SELECT id FROM opportunities WHERE id IN (SELECT opportunity_id FROM captures)',
      TEST_SCHEMA,
    )).toBeNull();
  });

  it('returns null for unknown tables', () => {
    expect(getSingleFromTable(
      'SELECT id FROM nonexistent_table WHERE id = 1',
      TEST_SCHEMA,
    )).toBeNull();
  });

  it('returns null for multi-FROM queries', () => {
    expect(getSingleFromTable(
      'DELETE FROM opportunities WHERE id IN (SELECT id FROM captures)',
      TEST_SCHEMA,
    )).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// tokenizeProjection
// ---------------------------------------------------------------------------

describe('tokenizeProjection', () => {
  it('splits simple comma-separated columns', () => {
    expect(tokenizeProjection('id, name, status')).toEqual(['id', 'name', 'status']);
  });

  it('respects parenthesis depth for function calls', () => {
    expect(tokenizeProjection('id, COALESCE(a, b), status')).toEqual([
      'id', 'COALESCE(a, b)', 'status',
    ]);
  });

  it('handles casts', () => {
    expect(tokenizeProjection('value_min::text, value_max::text')).toEqual([
      'value_min::text', 'value_max::text',
    ]);
  });
});

// ---------------------------------------------------------------------------
// extractBareIdents
// ---------------------------------------------------------------------------

describe('extractBareIdents', () => {
  it('extracts a simple bare identifier', () => {
    expect(extractBareIdents('naics')).toEqual(['naics']);
  });

  it('strips type casts', () => {
    expect(extractBareIdents('value_min::text')).toEqual(['value_min']);
  });

  it('strips aliases', () => {
    expect(extractBareIdents('naics AS code')).toEqual(['naics']);
  });

  it('returns empty for *', () => {
    expect(extractBareIdents('*')).toEqual([]);
  });

  it('extracts identifiers from function calls', () => {
    expect(extractBareIdents('COUNT(naics)')).toEqual(['naics']);
  });

  it('returns empty for COUNT(*)', () => {
    expect(extractBareIdents('COUNT(*)')).toEqual([]);
  });

  it('extracts multiple idents from COALESCE', () => {
    const result = extractBareIdents('COALESCE(agency, title)');
    expect(result).toContain('agency');
    expect(result).toContain('title');
  });
});

// ---------------------------------------------------------------------------
// extractSelectProjection
// ---------------------------------------------------------------------------

describe('extractSelectProjection', () => {
  it('extracts columns between SELECT and FROM', () => {
    expect(extractSelectProjection('SELECT id, name FROM users')).toBe('id, name');
  });

  it('handles DISTINCT', () => {
    expect(extractSelectProjection('SELECT DISTINCT id, name FROM users')).toBe('id, name');
  });

  it('handles multiline', () => {
    const result = extractSelectProjection(PR795_SQL);
    expect(result).toContain('place_of_performance_state');
  });
});

// ---------------------------------------------------------------------------
// extractWhereIdents
// ---------------------------------------------------------------------------

describe('extractWhereIdents', () => {
  it('extracts bare idents before operators', () => {
    const result = extractWhereIdents('deleted_at IS NULL AND status = __STR__');
    expect(result).toContain('deleted_at');
    expect(result).toContain('status');
  });

  it('ignores SQL noise words', () => {
    const result = extractWhereIdents('id = 1');
    // id is not in SQL_NOISE, so it should be extracted
    expect(result).toContain('id');
  });

  it('strips type casts before matching', () => {
    const result = extractWhereIdents('value_min::int > 0');
    expect(result).toContain('value_min');
  });

  it('does not emit __str__ placeholder as an identifier', () => {
    const result = extractWhereIdents("settings->>'briefing_auto_delivery' = 'true'");
    expect(result).not.toContain('__str__');
  });

  it('does not emit __interp__ placeholder as an identifier', () => {
    const result = extractWhereIdents('status = __INTERP__');
    expect(result).not.toContain('__interp__');
  });
});

// ---------------------------------------------------------------------------
// extractBareColumnRefs (core v2 logic)
// ---------------------------------------------------------------------------

describe('extractBareColumnRefs', () => {
  it('returns bare refs for single-table queries', () => {
    const refs = extractBareColumnRefs(
      'SELECT id, naics, place_of_performance_state FROM opportunities',
      10,
      TEST_SCHEMA,
    );
    const cols = refs.map(r => r.column);
    expect(cols).toContain('id');
    expect(cols).toContain('naics');
    expect(cols).toContain('place_of_performance_state');
    expect(refs.every(r => r.bare === true)).toBe(true);
    expect(refs.every(r => r.table === 'opportunities')).toBe(true);
  });

  it('returns empty for JOIN queries', () => {
    const refs = extractBareColumnRefs(
      'SELECT id FROM opportunities o JOIN captures c ON c.opportunity_id = o.id',
      1,
      TEST_SCHEMA,
    );
    expect(refs).toEqual([]);
  });

  it('returns empty for SELECT *', () => {
    const refs = extractBareColumnRefs(
      'SELECT * FROM opportunities',
      1,
      TEST_SCHEMA,
    );
    expect(refs).toEqual([]);
  });

  it('extracts WHERE clause bare refs', () => {
    const refs = extractBareColumnRefs(
      'SELECT id FROM opportunities WHERE deleted_at IS NULL',
      1,
      TEST_SCHEMA,
    );
    const cols = refs.map(r => r.column);
    expect(cols).toContain('deleted_at');
  });

  it('handles casts in SELECT', () => {
    const refs = extractBareColumnRefs(
      'SELECT value_min::text FROM opportunities',
      1,
      TEST_SCHEMA,
    );
    const cols = refs.map(r => r.column);
    expect(cols).toContain('value_min');
  });

  it('extracts idents from function wrappers', () => {
    const refs = extractBareColumnRefs(
      'SELECT COUNT(naics) FROM opportunities',
      1,
      TEST_SCHEMA,
    );
    const cols = refs.map(r => r.column);
    expect(cols).toContain('naics');
  });

  it('skips SQL noise words in projection', () => {
    const refs = extractBareColumnRefs(
      'SELECT id, naics FROM opportunities',
      1,
      TEST_SCHEMA,
    );
    const cols = refs.map(r => r.column);
    // Should not include SQL noise words even if they appeared in projection
    for (const col of cols) {
      expect(SQL_NOISE.has(col!)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// extractRefsFromSql — integration (v1 + v2 combined)
// ---------------------------------------------------------------------------

describe('extractRefsFromSql', () => {
  it('still detects table.column refs (v1 behavior)', () => {
    const refs = extractRefsFromSql(
      'SELECT opportunities.fake_col FROM opportunities',
      1,
      TEST_SCHEMA,
    );
    const qualified = refs.filter(r => !r.bare);
    expect(qualified.some(r => r.table === 'opportunities' && r.column === 'fake_col')).toBe(true);
  });

  it('detects bare column refs in single-table queries (v2)', () => {
    const refs = extractRefsFromSql(
      'SELECT id, place_of_performance_state FROM opportunities',
      1,
      TEST_SCHEMA,
    );
    const bareRefs = refs.filter(r => r.bare);
    expect(bareRefs.some(r => r.column === 'place_of_performance_state')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkRefs — violation detection
// ---------------------------------------------------------------------------

describe('checkRefs', () => {
  it('flags bare unknown column as violation', () => {
    const refs = extractRefsFromSql(
      'SELECT id, place_of_performance_state FROM opportunities',
      1,
      TEST_SCHEMA,
    );
    const violations = checkRefs(refs, TEST_SCHEMA, EMPTY_ALLOWLISTS, 'test.ts');
    expect(violations.some(v =>
      v.reason === 'unknown_column' &&
      v.reference.includes('place_of_performance_state'),
    )).toBe(true);
  });

  it('does not flag bare known columns', () => {
    const refs = extractRefsFromSql(
      'SELECT id, naics, agency FROM opportunities',
      1,
      TEST_SCHEMA,
    );
    const violations = checkRefs(refs, TEST_SCHEMA, EMPTY_ALLOWLISTS, 'test.ts');
    expect(violations).toEqual([]);
  });

  it('does not flag bare columns in multi-table JOIN', () => {
    const refs = extractRefsFromSql(
      'SELECT fake_column FROM opportunities o JOIN captures c ON c.opportunity_id = o.id',
      1,
      TEST_SCHEMA,
    );
    const violations = checkRefs(refs, TEST_SCHEMA, EMPTY_ALLOWLISTS, 'test.ts');
    // Should not flag bare columns in multi-table queries
    const bareViolations = violations.filter(v =>
      v.reference.includes('fake_column'),
    );
    expect(bareViolations).toEqual([]);
  });

  it('flags bare unknown column with cast', () => {
    const refs = extractRefsFromSql(
      'SELECT fake_col::text FROM opportunities',
      1,
      TEST_SCHEMA,
    );
    const violations = checkRefs(refs, TEST_SCHEMA, EMPTY_ALLOWLISTS, 'test.ts');
    expect(violations.some(v =>
      v.reason === 'unknown_column' &&
      v.reference.includes('fake_col'),
    )).toBe(true);
  });

  it('flags COUNT(unknown_col) wrapping unknown column', () => {
    const refs = extractRefsFromSql(
      'SELECT COUNT(nonexistent_col) FROM opportunities',
      1,
      TEST_SCHEMA,
    );
    const violations = checkRefs(refs, TEST_SCHEMA, EMPTY_ALLOWLISTS, 'test.ts');
    expect(violations.some(v =>
      v.reason === 'unknown_column' &&
      v.reference.includes('nonexistent_col'),
    )).toBe(true);
  });

  it('does not enforce on SELECT *', () => {
    const refs = extractRefsFromSql(
      'SELECT * FROM opportunities',
      1,
      TEST_SCHEMA,
    );
    const violations = checkRefs(refs, TEST_SCHEMA, EMPTY_ALLOWLISTS, 'test.ts');
    expect(violations).toEqual([]);
  });

  it('skips bare columns matching SQL_NOISE', () => {
    // SQL_NOISE words should not be flagged even if not in schema
    const refs = extractRefsFromSql(
      'SELECT id FROM opportunities WHERE deleted_at IS NULL',
      1,
      TEST_SCHEMA,
    );
    const violations = checkRefs(refs, TEST_SCHEMA, EMPTY_ALLOWLISTS, 'test.ts');
    expect(violations).toEqual([]);
  });

  it('flags WHERE clause bare unknown column', () => {
    const refs = extractRefsFromSql(
      'SELECT id FROM opportunities WHERE nonexistent_field = 1',
      1,
      TEST_SCHEMA,
    );
    const violations = checkRefs(refs, TEST_SCHEMA, EMPTY_ALLOWLISTS, 'test.ts');
    expect(violations.some(v =>
      v.reason === 'unknown_column' &&
      v.reference.includes('nonexistent_field'),
    )).toBe(true);
  });

  it('respects bare-column allowlist', () => {
    const allowlists: Allowlists = {
      general: new Set(),
      bareColumn: new Set(['opportunities:place_of_performance_state']),
    };
    const refs = extractRefsFromSql(
      'SELECT place_of_performance_state FROM opportunities',
      1,
      TEST_SCHEMA,
    );
    const violations = checkRefs(refs, TEST_SCHEMA, allowlists, 'test.ts');
    expect(violations.filter(v =>
      v.reference.includes('place_of_performance_state'),
    )).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// PR #795 regression test — the exact SQL that caused the production crash
// ---------------------------------------------------------------------------

describe('PR #795 regression — place_of_performance_state', () => {
  it('MUST flag place_of_performance_state as unknown_column', () => {
    const cleaned = stripInterpolations(PR795_SQL);
    const refs = extractRefsFromSql(cleaned, 1, TEST_SCHEMA);
    const violations = checkRefs(refs, TEST_SCHEMA, EMPTY_ALLOWLISTS, 'fixture.ts');

    const driftHit = violations.find(v =>
      v.reason === 'unknown_column' &&
      v.reference.includes('place_of_performance_state'),
    );
    expect(driftHit).toBeDefined();
    expect(driftHit!.reason).toBe('unknown_column');
  });

  it('does NOT flag the other (valid) columns in the PR #795 SELECT', () => {
    const cleaned = stripInterpolations(PR795_SQL);
    const refs = extractRefsFromSql(cleaned, 1, TEST_SCHEMA);
    const violations = checkRefs(refs, TEST_SCHEMA, EMPTY_ALLOWLISTS, 'fixture.ts');

    const validCols = ['id', 'solicitation_number', 'naics', 'agency', 'value_min', 'value_max'];
    for (const col of validCols) {
      const hit = violations.find(v => v.reference.includes(col));
      expect(hit, `should not flag valid column: ${col}`).toBeUndefined();
    }
  });
});
