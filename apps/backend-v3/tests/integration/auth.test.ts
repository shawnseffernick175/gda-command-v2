import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { getApp, closeApp, getPool, JWT_SECRET } from './helpers.js';

const TEST_EMAIL = 'authtest@gda.local';
const TEST_PASSWORD = 'SuperSecure123!';
const TEST_DISPLAY = 'Auth Test User';

describe('Auth routes (F-235)', () => {
  let app: FastifyInstance;
  let testUserId: number;

  beforeAll(async () => {
    app = await getApp();
    const pool = getPool();

    const hash = await bcrypt.hash(TEST_PASSWORD, 12);
    const res = await pool.query(
      `INSERT INTO users (email, display_name, role, is_active, password_hash, password_set_at)
       VALUES ($1, $2, 'admin', TRUE, $3, NOW())
       ON CONFLICT (email) DO UPDATE SET password_hash = $3, failed_login_count = 0, locked_until = NULL
       RETURNING id`,
      [TEST_EMAIL, TEST_DISPLAY, hash],
    );
    testUserId = res.rows[0].id;
  });

  afterAll(async () => {
    const pool = getPool();
    await pool.query(`DELETE FROM auth_audit WHERE email = $1`, [TEST_EMAIL]);
    await pool.query(`DELETE FROM users WHERE email = $1`, [TEST_EMAIL]);
    await closeApp();
  });

  it('happy path: login → token → GET /me', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/v3/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(loginRes.statusCode).toBe(200);
    const loginBody = loginRes.json();
    expect(loginBody.success).toBe(true);
    expect(loginBody.data.token).toBeDefined();
    expect(loginBody.data.user.email).toBe(TEST_EMAIL);
    expect(loginBody.data.user.role).toBe('admin');

    const token = loginBody.data.token;

    const meRes = await app.inject({
      method: 'GET',
      url: '/v3/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(meRes.statusCode).toBe(200);
    const meBody = meRes.json();
    expect(meBody.data.email).toBe(TEST_EMAIL);
    expect(meBody.data.display_name).toBe(TEST_DISPLAY);
  });

  it('wrong password returns 401 and increments failed_login_count', async () => {
    const pool = getPool();
    await pool.query(`UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = $1`, [testUserId]);

    const res = await app.inject({
      method: 'POST',
      url: '/v3/auth/login',
      payload: { email: TEST_EMAIL, password: 'WrongPassword!' },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toBe('Invalid credentials');

    const userRes = await pool.query(`SELECT failed_login_count FROM users WHERE id = $1`, [testUserId]);
    expect(userRes.rows[0].failed_login_count).toBe(1);
  });

  it('5th wrong password triggers lockout (423)', async () => {
    const pool = getPool();
    await pool.query(`UPDATE users SET failed_login_count = 4, locked_until = NULL WHERE id = $1`, [testUserId]);

    const res = await app.inject({
      method: 'POST',
      url: '/v3/auth/login',
      payload: { email: TEST_EMAIL, password: 'Wrong5th!' },
    });
    expect(res.statusCode).toBe(423);
    const body = res.json();
    expect(body.code).toBe('ACCOUNT_LOCKED');
    expect(body.retryAfter).toBeGreaterThan(0);

    const userRes = await pool.query(`SELECT locked_until FROM users WHERE id = $1`, [testUserId]);
    expect(userRes.rows[0].locked_until).not.toBeNull();
  });

  it('locked user login returns 423 with retryAfter', async () => {
    const pool = getPool();
    const lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
    await pool.query(
      `UPDATE users SET failed_login_count = 5, locked_until = $1 WHERE id = $2`,
      [lockedUntil.toISOString(), testUserId],
    );

    const res = await app.inject({
      method: 'POST',
      url: '/v3/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(res.statusCode).toBe(423);
    const body = res.json();
    expect(body.code).toBe('ACCOUNT_LOCKED');
    expect(body.retryAfter).toBeGreaterThan(0);
    expect(body.retryAfter).toBeLessThanOrEqual(600);
  });

  it('login succeeds after lockout expires, counters reset', async () => {
    const pool = getPool();
    const pastLockout = new Date(Date.now() - 1000);
    await pool.query(
      `UPDATE users SET failed_login_count = 5, locked_until = $1 WHERE id = $2`,
      [pastLockout.toISOString(), testUserId],
    );

    const res = await app.inject({
      method: 'POST',
      url: '/v3/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(res.statusCode).toBe(200);

    const userRes = await pool.query(
      `SELECT failed_login_count, locked_until FROM users WHERE id = $1`,
      [testUserId],
    );
    expect(userRes.rows[0].failed_login_count).toBe(0);
    expect(userRes.rows[0].locked_until).toBeNull();
  });

  it('/me without token returns 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v3/auth/me',
    });
    expect(res.statusCode).toBe(401);
  });

  it('/me with expired token returns 401 "Token expired"', async () => {
    const expiredToken = jwt.sign(
      { sub: String(testUserId), email: TEST_EMAIL, role: 'admin' },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '-1s' },
    );

    const res = await app.inject({
      method: 'GET',
      url: '/v3/auth/me',
      headers: { authorization: `Bearer ${expiredToken}` },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error.message).toBe('Token expired');
  });

  it('/refresh with valid token returns new token with later exp', async () => {
    const originalToken = jwt.sign(
      { sub: String(testUserId), email: TEST_EMAIL, role: 'admin' },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' },
    );
    const originalPayload = jwt.decode(originalToken) as { exp: number };

    // small delay to ensure new token has later iat
    await new Promise((r) => setTimeout(r, 1100));

    const res = await app.inject({
      method: 'POST',
      url: '/v3/auth/refresh',
      headers: { authorization: `Bearer ${originalToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.token).toBeDefined();

    const newPayload = jwt.decode(body.data.token) as { exp: number };
    expect(newPayload.exp).toBeGreaterThan(originalPayload.exp);
  });

  it('audit table populated for login_success, login_failure, lockout', async () => {
    const pool = getPool();
    const auditRes = await pool.query(
      `SELECT event, count(*)::int as cnt FROM auth_audit WHERE email = $1 GROUP BY event`,
      [TEST_EMAIL],
    );
    const events = Object.fromEntries(
      auditRes.rows.map((r: { event: string; cnt: number }) => [r.event, r.cnt]),
    );

    expect(events['login_success']).toBeGreaterThanOrEqual(1);
    expect(events['login_failure']).toBeGreaterThanOrEqual(1);
    expect(events['lockout']).toBeGreaterThanOrEqual(1);
  });
});
