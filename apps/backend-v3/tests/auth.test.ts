import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

process.env['JWT_SECRET'] = 'test-jwt-secret-that-is-at-least-32-characters-long';
process.env['GDA_WEBHOOK_KEY'] = 'test-webhook-key';
process.env['DATABASE_URL'] ??= 'postgresql://gda:gda_dev_password@localhost:5432/gda_command';
process.env['NODE_ENV'] = 'test';

const { buildApp } = await import('../src/app.js');

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('JWT auth middleware', () => {
  it('returns 401 for missing Authorization header', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/opportunities/1' });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 for malformed Authorization header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/opportunities/1',
      headers: { authorization: 'Basic abc123' },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 for expired JWT on protected endpoints', async () => {
    const token = jwt.sign(
      { sub: 'user-1', email: 'test@gda.local' },
      'test-jwt-secret-that-is-at-least-32-characters-long',
      { algorithm: 'HS256', expiresIn: '-10s' }
    );
    const res = await app.inject({
      method: 'GET',
      url: '/v3/opportunities/1',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as { success: boolean; error: { code: string; message: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toBe('Token expired');
  });

  it('/v3/auth/refresh is public (no Bearer required)', async () => {
    // Without a cookie, should return 401 INVALID_REFRESH_TOKEN (not generic UNAUTHORIZED)
    const res = await app.inject({
      method: 'POST',
      url: '/v3/auth/refresh',
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('/v3/auth/logout is public (no Bearer required)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/auth/logout',
    });
    expect(res.statusCode).toBe(204);
  });

  it('returns 401 for invalid JWT secret', async () => {
    const token = jwt.sign(
      { sub: 'user-1' },
      'wrong-secret',
      { algorithm: 'HS256' }
    );
    const res = await app.inject({
      method: 'GET',
      url: '/v3/opportunities/1',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('allows valid JWT through to endpoint (not 401)', async () => {
    const token = jwt.sign(
      { sub: 'user-1', email: 'test@gda.local', role: 'admin' },
      'test-jwt-secret-that-is-at-least-32-characters-long',
      { algorithm: 'HS256', expiresIn: '1h' }
    );
    const res = await app.inject({
      method: 'GET',
      url: '/v3/opportunities/999999',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).not.toBe(401);
  });

  it('allows public paths without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/v3/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: { status: string } };
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
  });
});

describe('HMAC webhook verification', () => {
  const payload = JSON.stringify({ test: true });

  it('returns 401 for missing webhook auth headers', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/webhooks/sam-opportunity',
      payload,
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('WEBHOOK_AUTH_FAILED');
  });

  it('authenticates with x-gda-key header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/webhooks/sam-opportunity',
      payload,
      headers: {
        'content-type': 'application/json',
        'x-gda-key': 'test-webhook-key',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean };
    expect(body.success).toBe(true);
  });

  it('returns 401 for wrong x-gda-key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/webhooks/sam-opportunity',
      payload,
      headers: {
        'content-type': 'application/json',
        'x-gda-key': 'wrong-key',
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('authenticates with HMAC signature', async () => {
    const signature = createHmac('sha256', 'test-webhook-key')
      .update(payload)
      .digest('hex');
    const res = await app.inject({
      method: 'POST',
      url: '/v3/webhooks/sam-opportunity',
      payload,
      headers: {
        'content-type': 'application/json',
        'x-gda-signature': signature,
      },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 401 for wrong HMAC signature', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/webhooks/sam-opportunity',
      payload,
      headers: {
        'content-type': 'application/json',
        'x-gda-signature': 'deadbeef',
      },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('WEBHOOK_AUTH_FAILED');
  });
});
