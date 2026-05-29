import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

process.env['DATABASE_URL'] ??= 'postgresql://gda:gda_dev_password@localhost:5432/gda_command';
process.env['NODE_ENV'] = 'test';

const DB_URL = process.env['DATABASE_URL']!;
const { Pool } = pg;

let pool: InstanceType<typeof Pool>;

describe('Migration Pipeline', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: DB_URL, max: 3 });
    const client = await pool.connect();
    try {
      // Load the fixture SQL
      const fixtureSQL = readFileSync(
        resolve(__dirname, '../../src/migration/fixtures/legacy/seed.sql'),
        'utf-8',
      );

      // Check if legacy tables already exist (CI seeds them before tests)
      const existing = await client.query(
        `SELECT COUNT(*)::int AS c FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'sam_opportunities'`,
      );

      if (existing.rows[0]?.c === 0) {
        // Tables not yet seeded — execute fixture SQL in public schema
        await client.query('SET search_path TO public');
        const statements = fixtureSQL
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && !s.startsWith('--'));
        for (const stmt of statements) {
          await client.query(stmt);
        }
      }

      await client.query('SET search_path TO public');
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  describe('Extract', () => {
    it('should extract opportunities from legacy tables', async () => {
      const { extractOpportunities } = await import('../../src/migration/extract.js');
      const legacyPool = new Pool({ connectionString: DB_URL, max: 2 });
      try {
        // Use public schema (fixture loaded there)
        const opps = await extractOpportunities(legacyPool);
        expect(opps.length).toBeGreaterThan(0);
        expect(opps[0]).toHaveProperty('title');
        expect(opps[0]).toHaveProperty('id');
      } finally {
        await legacyPool.end();
      }
    });

    it('should extract captures from legacy tables', async () => {
      const { extractCaptures } = await import('../../src/migration/extract.js');
      const legacyPool = new Pool({ connectionString: DB_URL, max: 2 });
      try {
        const captures = await extractCaptures(legacyPool);
        expect(captures.length).toBeGreaterThan(0);
        expect(captures[0]).toHaveProperty('id');
      } finally {
        await legacyPool.end();
      }
    });

    it('should extract action items from legacy tables', async () => {
      const { extractActionItems } = await import('../../src/migration/extract.js');
      const legacyPool = new Pool({ connectionString: DB_URL, max: 2 });
      try {
        const items = await extractActionItems(legacyPool);
        expect(items.length).toBeGreaterThan(0);
        expect(items[0]).toHaveProperty('title');
      } finally {
        await legacyPool.end();
      }
    });

    it('should extract sources from legacy tables', async () => {
      const { extractSources } = await import('../../src/migration/extract.js');
      const legacyPool = new Pool({ connectionString: DB_URL, max: 2 });
      try {
        const sources = await extractSources(legacyPool);
        expect(sources.length).toBeGreaterThan(0);
      } finally {
        await legacyPool.end();
      }
    });

    it('should extract partners from legacy tables', async () => {
      const { extractPartners } = await import('../../src/migration/extract.js');
      const legacyPool = new Pool({ connectionString: DB_URL, max: 2 });
      try {
        const partners = await extractPartners(legacyPool);
        expect(partners.length).toBeGreaterThan(0);
        expect(partners[0]).toHaveProperty('name');
      } finally {
        await legacyPool.end();
      }
    });
  });

  describe('Transform', () => {
    it('should transform opportunities to V3 schema', async () => {
      const { transformOpportunities } = await import('../../src/migration/transform.js');
      const { records, gaps, preWarmJobs } = transformOpportunities([
        {
          id: '1',
          title: 'Test Opportunity',
          agency: 'Army',
          notice_id: 'SAM-001',
          solicitation_number: 'SOL-001',
          status: 'active',
          naics: '541611',
          value: 5000000,
          raw_source_url: 'https://sam.gov/opp/SAM-001',
          data_source: 'sam_gov',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ]);

      expect(records).toHaveLength(1);
      expect(records[0]!.title).toBe('Test Opportunity');
      expect(records[0]!.agency).toBe('Army');
      expect(records[0]!.sam_notice_id).toBe('SAM-001');
      expect(records[0]!.value_min).toBe(5000000);
      expect(records[0]!.data_source).toBe('sam_gov');
      expect(records[0]!.legacy_id).toBe('1');
      expect(records[0]!.created_at).toBe('2026-01-01T00:00:00.000Z');
      expect(gaps).toEqual([]);
      expect(preWarmJobs).toHaveLength(1);
      expect(preWarmJobs[0]!.entityType).toBe('opportunity');
    });

    it('should deduplicate opportunities by solicitation number', async () => {
      const { transformOpportunities } = await import('../../src/migration/transform.js');
      const { records, gaps } = transformOpportunities([
        { id: '1', title: 'First', solicitation_number: 'SOL-DUP' },
        { id: '2', title: 'Second', solicitation_number: 'SOL-DUP' },
      ]);

      expect(records).toHaveLength(1);
      expect(gaps).toHaveLength(1);
      expect(gaps[0]!.reason).toBe('DUPLICATE_KEY');
    });

    it('should not create pre-warm jobs for opportunities with analysis', async () => {
      const { transformOpportunities } = await import('../../src/migration/transform.js');
      const { preWarmJobs } = transformOpportunities([
        {
          id: '1',
          title: 'Analyzed',
          analysis: {
            pwin: 65,
            pwin_sources: [{ kind: 'internal', title: 't', url: '/u', retrieved_at: '2026-01-01T00:00:00Z' }],
          },
          raw_source_url: 'https://sam.gov/opp/1',
        },
      ]);

      expect(preWarmJobs).toHaveLength(0);
    });

    it('should flag MISSING_SOURCES when analysis field has no source URL', async () => {
      const { transformOpportunities } = await import('../../src/migration/transform.js');
      const { gaps } = transformOpportunities([
        {
          id: '1',
          title: 'No Sources',
          analysis: { pwin: 55 },
        },
      ]);

      const missingSourceGaps = gaps.filter((g) => g.reason === 'MISSING_SOURCES');
      expect(missingSourceGaps.length).toBeGreaterThan(0);
    });

    it('should transform captures and detect orphaned references', async () => {
      const { transformCaptures } = await import('../../src/migration/transform.js');
      const oppIdMap = new Map([['opp-1', 'v3-uuid-1']]);
      const { records, gaps } = transformCaptures(
        [
          { id: '1', opportunity_id: 'opp-1', status: 'active' },
          { id: '2', opportunity_id: 'missing-opp', status: 'active' },
        ],
        oppIdMap,
      );

      expect(records).toHaveLength(2);
      expect(records[0]!.opportunity_id).toBe('v3-uuid-1');
      expect(gaps).toHaveLength(1);
      expect(gaps[0]!.reason).toBe('ORPHANED_REFERENCE');
    });

    it('should transform action items with status normalization', async () => {
      const { transformActionItems } = await import('../../src/migration/transform.js');
      const { records } = transformActionItems([
        { id: '1', title: 'Open item', status: 'open' },
        { id: '2', title: 'Completed item', status: 'completed' },
        { id: '3', title: 'In progress item', status: 'in progress' },
      ]);

      expect(records).toHaveLength(3);
      expect(records[0]!.status).toBe('open');
      expect(records[1]!.status).toBe('done');
      expect(records[2]!.status).toBe('in_progress');
    });

    it('should transform sources with kind normalization', async () => {
      const { transformSources } = await import('../../src/migration/transform.js');
      const { records } = transformSources([
        { id: '1', kind: 'sam_gov', title: 'SAM', url: 'https://sam.gov' },
        { id: '2', kind: 'unknown_kind', title: 'Unknown' },
      ]);

      expect(records).toHaveLength(2);
      expect(records[0]!.kind).toBe('sam_gov');
      expect(records[1]!.kind).toBe('internal');
    });

    it('should transform partners preserving certifications and vehicles', async () => {
      const { transformPartners } = await import('../../src/migration/transform.js');
      const { records } = transformPartners([
        {
          id: '1',
          name: 'Riverstone Solutions',
          uei: 'TECGLUBFP6N6',
          cage: '71WX3',
          capabilities: ['TechSIGINT', 'Cyber'],
          certifications: [{ name: 'HUBZone', status: 'active' }],
          vehicles: [{ name: 'SHIELD', contract: 'HQ085926DF469' }],
        },
      ]);

      expect(records).toHaveLength(1);
      expect(records[0]!.name).toBe('Riverstone Solutions');
      expect(records[0]!.uei).toBe('TECGLUBFP6N6');
      expect(records[0]!.certifications).toHaveLength(1);
      expect(records[0]!.vehicles).toHaveLength(1);
    });
  });

  describe('R2 Audit', () => {
    it('should pass R2 audit when no forbidden columns exist', async () => {
      const { runR2Audit } = await import('../../src/migration/r2-audit.js');
      const result = await runR2Audit(DB_URL);

      expect(result).toHaveProperty('checks');
      expect(result).toHaveProperty('passed');
      expect(Array.isArray(result.checks)).toBe(true);

      for (const check of result.checks) {
        expect(check).toHaveProperty('name');
        expect(check).toHaveProperty('description');
        expect(check).toHaveProperty('passed');
      }
    });
  });

  describe('Parity Report', () => {
    it('should generate a valid parity report markdown', async () => {
      const { generateParityReport } = await import('../../src/migration/parity-report.js');

      const report = await generateParityReport({
        v2Counts: {
          opportunities: { v2: 0, v3: 0 },
          captures: { v2: 0, v3: 0 },
          action_items: { v2: 0, v3: 0 },
          sources: { v2: 0, v3: 0 },
          partners: { v2: 0, v3: 0 },
        },
        v3DatabaseUrl: DB_URL,
        gaps: [],
      });

      expect(report).toHaveProperty('markdown');
      expect(report).toHaveProperty('passed');
      expect(report.markdown).toContain('# Migration Parity Report');
      expect(report.markdown).toContain('## A. Counts Table');
      expect(report.markdown).toContain('## B. Field Coverage Table');
      expect(report.markdown).toContain('## C. Gap List');
      expect(report.markdown).toContain('## D. R2 Invariant Audit');
    });

    it('should report count mismatches correctly', async () => {
      const { generateParityReport } = await import('../../src/migration/parity-report.js');

      const report = await generateParityReport({
        v2Counts: {
          opportunities: { v2: 100, v3: 0 },
          captures: { v2: 0, v3: 0 },
          action_items: { v2: 0, v3: 0 },
          sources: { v2: 0, v3: 0 },
          partners: { v2: 0, v3: 0 },
        },
        v3DatabaseUrl: DB_URL,
        gaps: [],
      });

      expect(report.markdown).toContain('MISMATCH');
    });
  });
});
