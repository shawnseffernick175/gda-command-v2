import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env['JWT_SECRET'] = 'test-jwt-secret-that-is-at-least-32-characters-long';
process.env['GDA_WEBHOOK_KEY'] = 'test-webhook-key';
process.env['DATABASE_URL'] ??= 'postgresql://gda:gda_dev_password@localhost:5432/gda_command';
process.env['NODE_ENV'] = 'test';
process.env['ANALYSIS_VERSION'] ??= 'v0.0.1-test';
process.env['MOCK_LLM'] = '1';

const emptyRows = { rows: [], rowCount: 0 };

interface MockRow {
  [key: string]: unknown;
}

/**
 * SQL-aware mock: routes queries to canned results by inspecting the SQL text,
 * so tests are robust to the interleaved door-summary queries used to build the
 * day's context.
 */
let sitrepRecord: MockRow | null = null;
let sitrepDocuments: MockRow[] = [];

const mockQuery = vi.fn(async (sql: string) => {
  const text = String(sql);
  if (/FROM launchpad_sitreps/i.test(text)) {
    return { rows: sitrepRecord ? [sitrepRecord] : [], rowCount: sitrepRecord ? 1 : 0 };
  }
  if (/INSERT INTO launchpad_sitreps/i.test(text)) {
    return { rows: [{ generated_at: '2026-07-13T12:00:00.000Z' }], rowCount: 1 };
  }
  if (/INTO launchpad_sitrep_documents/i.test(text)) {
    return emptyRows;
  }
  if (/FROM launchpad_sitrep_documents/i.test(text)) {
    return { rows: sitrepDocuments, rowCount: sitrepDocuments.length };
  }
  return emptyRows;
});

vi.mock('../src/lib/db.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...(args as [string])),
  },
}));

const { getSitrep, addSitrepDocument, todayEastern, isValidDate } = await import(
  '../src/services/launchpad/sitrep.js'
);

describe('F-SITREP: Launchpad SITREP service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sitrepRecord = null;
    sitrepDocuments = [];
  });

  describe('date helpers', () => {
    it('todayEastern returns a YYYY-MM-DD string', () => {
      expect(todayEastern()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('isValidDate accepts YYYY-MM-DD and rejects other formats', () => {
      expect(isValidDate('2026-07-13')).toBe(true);
      expect(isValidDate('13-07-2026')).toBe(false);
      expect(isValidDate('2026/07/13')).toBe(false);
      expect(isValidDate('nonsense')).toBe(false);
    });
  });

  describe('getSitrep', () => {
    it('returns the saved SITREP (bullets + documents) when a record exists', async () => {
      sitrepRecord = {
        sitrep_date: '2026-07-13',
        bullets: ['Saved bullet one.', 'Saved bullet two.'],
        generated_at: '2026-07-13T09:00:00.000Z',
      };
      sitrepDocuments = [
        {
          id: 7,
          filename: 'brief.pdf',
          file_size_bytes: '2048',
          uploaded_at: '2026-07-13T10:00:00.000Z',
        },
      ];

      const result = await getSitrep('2026-07-13');

      expect(result.date).toBe('2026-07-13');
      expect(result.bullets).toEqual(['Saved bullet one.', 'Saved bullet two.']);
      expect(result.documents).toHaveLength(1);
      expect(result.documents[0]).toMatchObject({
        id: 7,
        filename: 'brief.pdf',
        file_size_bytes: 2048,
      });
      // No INSERT should occur when a record already exists.
      const inserted = mockQuery.mock.calls.some((c) =>
        /INSERT INTO launchpad_sitreps/i.test(String(c[0])),
      );
      expect(inserted).toBe(false);
    });

    it('generates and persists initial bullets when no record exists', async () => {
      const result = await getSitrep('2026-07-13');

      // MOCK_LLM returns the launchpad_sitrep default mock bullets.
      expect(result.bullets.length).toBeGreaterThan(0);
      expect(result.date).toBe('2026-07-13');

      const inserted = mockQuery.mock.calls.some((c) =>
        /INSERT INTO launchpad_sitreps/i.test(String(c[0])),
      );
      expect(inserted).toBe(true);
    });
  });

  describe('addSitrepDocument', () => {
    it('extracts text, persists the document, and folds it into the bullets', async () => {
      sitrepDocuments = [
        {
          id: 1,
          filename: 'notes.txt',
          file_size_bytes: '12',
          uploaded_at: '2026-07-13T11:00:00.000Z',
        },
      ];

      const result = await addSitrepDocument({
        date: '2026-07-13',
        filename: 'notes.txt',
        buffer: Buffer.from('hello world'),
      });

      expect(result.date).toBe('2026-07-13');
      expect(result.bullets.length).toBeGreaterThan(0);
      expect(result.documents.some((d) => d.filename === 'notes.txt')).toBe(true);

      // Document row persisted with filename + extracted text.
      const docInsert = mockQuery.mock.calls.find((c) =>
        /INTO launchpad_sitrep_documents/i.test(String(c[0])),
      );
      expect(docInsert).toBeDefined();
      const params = docInsert?.[1] as unknown[];
      expect(params[1]).toBe('notes.txt');
      expect(params[4]).toBe('hello world');

      // Bullets upserted.
      const bulletUpsert = mockQuery.mock.calls.some((c) =>
        /INSERT INTO launchpad_sitreps/i.test(String(c[0])),
      );
      expect(bulletUpsert).toBe(true);
    });

    it('accepts supported document extensions', async () => {
      for (const filename of ['a.pdf', 'b.docx', 'c.txt', 'd.md']) {
        await expect(
          addSitrepDocument({
            date: '2026-07-13',
            filename,
            buffer: Buffer.from('content'),
          }),
        ).resolves.toBeDefined();
      }
    });
  });
});
