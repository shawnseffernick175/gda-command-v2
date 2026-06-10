/**
 * Route tests for the vault-buckets-v2 redesign (17 buckets).
 *
 * Tests:
 * 1. POST upload with doc_type='financial' succeeds (valid new bucket)
 * 2. POST upload with doc_type='invoice' returns 400 (old value no longer accepted)
 * 3. POST upload with user-supplied bucket overrides LLM inference
 * 4. GET list with doc_type=financial filter returns only financial rows
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;

const queryImpl = { fn: vi.fn() as unknown as QueryFn };

vi.mock('../../src/lib/db.js', () => ({
  pool: {
    query: (sql: string, params?: unknown[]) => queryImpl.fn(sql, params),
  },
}));

vi.mock('../../src/lib/llm-router.js', () => ({
  llmRouter: {
    route: vi.fn().mockResolvedValue({
      ok: true,
      output: {
        summary: 'Test summary',
        tags: ['test'],
        entities: [],
        doc_type_confirmed: 'other',
      },
    }),
  },
}));

vi.mock('../../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/services/financials/ingest.js', () => ({
  ingestFinancialRows: vi.fn().mockResolvedValue({ plan: 0, actual: 0, rejected: 0 }),
}));

process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'test-secret-test-secret-test-secret-1234';
process.env['DATABASE_URL'] = 'postgres://test:test@localhost:5432/test';

import Fastify, { type FastifyInstance } from 'fastify';
import { VAULT_BUCKETS } from '../../src/routes/vault.js';

// Helper to create proper multipart/form-data payload for Fastify inject
function buildMultipart(fields: Record<string, string>, file?: { name: string; content: string }) {
  const boundary = '----FormBoundary' + Date.now();
  let body = '';

  for (const [key, value] of Object.entries(fields)) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
    body += `${value}\r\n`;
  }

  if (file) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="file"; filename="${file.name}"\r\n`;
    body += `Content-Type: text/plain\r\n\r\n`;
    body += `${file.content}\r\n`;
  }

  body += `--${boundary}--\r\n`;

  return {
    payload: body,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('vault-buckets-v2 route tests', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();

    const { vaultRoutes } = await import('../../src/routes/vault.js');
    await app.register(vaultRoutes);
    await app.ready();
  });

  it('exports VAULT_BUCKETS with exactly 17 entries', () => {
    expect(VAULT_BUCKETS).toHaveLength(17);
    expect(VAULT_BUCKETS).toContain('financial');
    expect(VAULT_BUCKETS).toContain('capability_statement');
    expect(VAULT_BUCKETS).toContain('correspondence');
    expect(VAULT_BUCKETS).toContain('personnel');
    expect(VAULT_BUCKETS).toContain('technical_artifact');
    expect(VAULT_BUCKETS).toContain('training_material');
    expect(VAULT_BUCKETS).toContain('policy_regulatory');
    expect(VAULT_BUCKETS).toContain('subcontract_teaming');
    // Old values should NOT be present
    expect(VAULT_BUCKETS).not.toContain('invoice');
    expect(VAULT_BUCKETS).not.toContain('teaming_agreement');
    expect(VAULT_BUCKETS).not.toContain('far');
  });

  it('POST upload with doc_type=financial succeeds', async () => {
    queryImpl.fn = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO vault_documents')) {
        return { rows: [{ id: 1 }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO vault_audit_trail')) {
        return { rows: [], rowCount: 1 };
      }
      return {
        rows: [{
          id: 1, filename: 'test.txt', doc_type: 'financial', doc_category: 'work_product',
          is_system_doc: false, file_size_bytes: '100', file_path: 'vault/test.txt',
          extracted_text: null, ai_summary: 'Test summary', ai_tags: ['test'], ai_entities: null,
          regulatory_citation: null, effective_date: null, applicable_naics: null,
          linked_opportunity_id: null, linked_capture_id: null, linked_award_id: null,
          uploaded_by: 'admin', uploaded_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null,
          opp_title: null, capture_title: null, award_title: null,
        }],
        rowCount: 1,
      };
    }) as unknown as QueryFn;

    const { payload, headers } = buildMultipart(
      { doc_type: 'financial' },
      { name: 'financial_report.txt', content: 'test content' },
    );

    const res = await app.inject({
      method: 'POST',
      url: '/v3/vault/upload',
      payload,
      headers,
    });

    expect(res.statusCode).toBe(201);
  });

  it('POST upload with doc_type=invoice returns 400', async () => {
    const { payload, headers } = buildMultipart(
      { doc_type: 'invoice' },
      { name: 'invoice.txt', content: 'test content' },
    );

    const res = await app.inject({
      method: 'POST',
      url: '/v3/vault/upload',
      payload,
      headers,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error?.message).toContain('Invalid doc_type: invoice');
  });

  it('user-supplied bucket overrides LLM doc_type_confirmed', async () => {
    // When user supplies 'financial', even if LLM returns 'other', the result should be 'financial'
    queryImpl.fn = vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT INTO vault_documents')) {
        // Verify that the doc_type param (index 1, 0-based) is 'financial' not 'other'
        if (params && Array.isArray(params)) {
          expect(params[1]).toBe('financial');
        }
        return { rows: [{ id: 1 }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO vault_audit_trail')) {
        return { rows: [], rowCount: 1 };
      }
      return {
        rows: [{
          id: 1, filename: 'test.txt', doc_type: 'financial', doc_category: 'work_product',
          is_system_doc: false, file_size_bytes: '100', file_path: 'vault/test.txt',
          extracted_text: null, ai_summary: 'Test summary', ai_tags: ['test'], ai_entities: null,
          regulatory_citation: null, effective_date: null, applicable_naics: null,
          linked_opportunity_id: null, linked_capture_id: null, linked_award_id: null,
          uploaded_by: 'admin', uploaded_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null,
          opp_title: null, capture_title: null, award_title: null,
        }],
        rowCount: 1,
      };
    }) as unknown as QueryFn;

    const { payload, headers } = buildMultipart(
      { doc_type: 'financial' },
      { name: 'report.txt', content: 'some financial data here' },
    );

    const res = await app.inject({
      method: 'POST',
      url: '/v3/vault/upload',
      payload,
      headers,
    });

    expect(res.statusCode).toBe(201);
  });

  it('GET /v3/vault with doc_type=financial filter returns only financial rows', async () => {
    queryImpl.fn = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('COUNT')) {
        return { rows: [{ total: 2 }], rowCount: 1 };
      }
      return {
        rows: [
          { id: 1, filename: 'budget.pdf', doc_type: 'financial', doc_category: 'work_product', is_system_doc: false, file_size_bytes: '500', file_path: 'vault/budget.pdf', ai_summary: 'Budget doc', ai_tags: ['budget'], ai_entities: null, regulatory_citation: null, effective_date: null, applicable_naics: null, linked_opportunity_id: null, linked_capture_id: null, linked_award_id: null, uploaded_by: 'admin', uploaded_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null, opp_title: null, capture_title: null, award_title: null },
          { id: 2, filename: 'invoice.pdf', doc_type: 'financial', doc_category: 'work_product', is_system_doc: false, file_size_bytes: '300', file_path: 'vault/invoice.pdf', ai_summary: null, ai_tags: null, ai_entities: null, regulatory_citation: null, effective_date: null, applicable_naics: null, linked_opportunity_id: null, linked_capture_id: null, linked_award_id: null, uploaded_by: 'admin', uploaded_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null, opp_title: null, capture_title: null, award_title: null },
        ],
        rowCount: 2,
      };
    }) as unknown as QueryFn;

    const res = await app.inject({
      method: 'GET',
      url: '/v3/vault?doc_type=financial',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(2);
    expect(body.data.items.every((d: { doc_type: string }) => d.doc_type === 'financial')).toBe(true);
  });
});
