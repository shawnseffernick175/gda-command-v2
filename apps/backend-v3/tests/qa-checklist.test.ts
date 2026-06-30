import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

vi.mock('../src/lib/db.js', () => ({
  pool: { query: vi.fn() },
}));
vi.mock('../src/config/index.js', () => ({
  config: {
    databaseUrl: 'postgresql://localhost/test',
    port: 3001,
    host: '0.0.0.0',
    version: 'test',
    jwtSecret: 'test-secret',
    jwtAlgorithm: 'HS256',
    webhookKey: 'test-webhook-key',
    gitSha: 'test',
    analysisVersion: 'v1.0.0',
    analysisTimeoutMs: 20_000,
    analysisPollIntervalMs: 100,
    logLevel: 'info',
    nodeEnv: 'test',
    agentV3Url: 'http://localhost:8001',
    agentServiceToken: '',
    fpdsApiBaseUrl: 'https://www.fpds.gov',
    samApiKey: '',
  },
}));
vi.mock('../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: vi.fn().mockReturnValue({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }) },
}));
vi.mock('../src/lib/metrics.js', () => ({
  httpRequestsTotal: { inc: vi.fn() },
}));

import { pool } from '../src/lib/db.js';
import { buildApp } from '../src/app.js';

const mockPool = pool as unknown as { query: ReturnType<typeof vi.fn> };

const JWT_SECRET = 'test-secret';

function authHeader(): { authorization: string } {
  const token = jwt.sign({ sub: 'test-user', role: 'admin' }, JWT_SECRET, { algorithm: 'HS256' });
  return { authorization: `Bearer ${token}` };
}

describe('QA Checklist CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /v3/qa-checklist', () => {
    it('returns empty array when no items exist', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const app = await buildApp();

      const res = await app.inject({
        method: 'GET',
        url: '/v3/qa-checklist',
        headers: authHeader(),
      });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
    });

    it('passes page_area filter to query', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const app = await buildApp();

      await app.inject({
        method: 'GET',
        url: '/v3/qa-checklist?page_area=Pipeline',
        headers: authHeader(),
      });

      const call = mockPool.query.mock.calls[0];
      expect(call[0]).toContain('page_area = $1');
      expect(call[1]).toEqual(['Pipeline']);
    });

    it('returns items when rows exist', async () => {
      const row = {
        id: 1,
        page_area: 'Launchpad',
        problem_summary: 'Button broken',
        category: 'ui',
        severity: 'high',
        status: 'queued',
      };
      mockPool.query.mockResolvedValueOnce({ rows: [row] });
      const app = await buildApp();

      const res = await app.inject({
        method: 'GET',
        url: '/v3/qa-checklist',
        headers: authHeader(),
      });
      const body = JSON.parse(res.body);

      expect(body.data).toHaveLength(1);
      expect(body.data[0].page_area).toBe('Launchpad');
    });
  });

  describe('POST /v3/qa-checklist', () => {
    it('returns 400 when page_area is missing', async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/v3/qa-checklist',
        headers: authHeader(),
        payload: { problem_summary: 'test', category: 'ui', severity: 'high' },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when problem_summary is missing', async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/v3/qa-checklist',
        headers: authHeader(),
        payload: { page_area: 'Launchpad', category: 'ui', severity: 'high' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when category is missing', async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/v3/qa-checklist',
        headers: authHeader(),
        payload: { page_area: 'Launchpad', problem_summary: 'test', severity: 'high' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when severity is missing', async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/v3/qa-checklist',
        headers: authHeader(),
        payload: { page_area: 'Launchpad', problem_summary: 'test', category: 'ui' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('creates item and returns 201', async () => {
      const created = {
        id: 1,
        page_area: 'Pipeline',
        problem_summary: 'Sort broken',
        category: 'data',
        severity: 'critical',
        status: 'queued',
        verified_live: false,
        is_seed: false,
      };
      mockPool.query.mockResolvedValueOnce({ rows: [created] });
      const app = await buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/v3/qa-checklist',
        headers: authHeader(),
        payload: {
          page_area: 'Pipeline',
          problem_summary: 'Sort broken',
          category: 'data',
          severity: 'critical',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.page_area).toBe('Pipeline');
    });
  });

  describe('PATCH /v3/qa-checklist/:id', () => {
    it('returns 400 when no valid fields provided', async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: 'PATCH',
        url: '/v3/qa-checklist/1',
        headers: authHeader(),
        payload: { unknown_field: 'x' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 404 when item does not exist', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const app = await buildApp();

      const res = await app.inject({
        method: 'PATCH',
        url: '/v3/qa-checklist/999',
        headers: authHeader(),
        payload: { status: 'fixed' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('updates item and returns 200', async () => {
      const updated = {
        id: 1,
        page_area: 'Launchpad',
        problem_summary: 'Button broken',
        category: 'ui',
        severity: 'high',
        status: 'fixed',
        verified_live: true,
      };
      mockPool.query.mockResolvedValueOnce({ rows: [updated] });
      const app = await buildApp();

      const res = await app.inject({
        method: 'PATCH',
        url: '/v3/qa-checklist/1',
        headers: authHeader(),
        payload: { status: 'fixed', verified_live: true },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.status).toBe('fixed');
      expect(body.data.verified_live).toBe(true);
    });
  });

  describe('DELETE /v3/qa-checklist/:id', () => {
    it('returns 404 when item does not exist', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });
      const app = await buildApp();

      const res = await app.inject({
        method: 'DELETE',
        url: '/v3/qa-checklist/999',
        headers: authHeader(),
      });

      expect(res.statusCode).toBe(404);
    });

    it('deletes item and returns 204', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });
      const app = await buildApp();

      const res = await app.inject({
        method: 'DELETE',
        url: '/v3/qa-checklist/1',
        headers: authHeader(),
      });

      expect(res.statusCode).toBe(204);
    });
  });
});
