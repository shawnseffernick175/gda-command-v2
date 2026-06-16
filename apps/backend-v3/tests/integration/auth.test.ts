import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { getApp, closeApp, getPool, JWT_SECRET } from './helpers.js';

const TEST_EMAIL = 'authtest@gda.local';
const TEST_PASSWORD = 'SuperSecure123!';
const TEST_DISPLAY = 'Auth Test User';

function extractCookie(res: { headers: Record<string, string | string[] | undefined> }, name: string): string | undefined {
  const raw = res.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const c of cookies) {
    if (c.startsWith(`${name}=`)) {
      return c.split(';')[0]!.split('=').slice(1).join('=');
    }
  }
  return undefined;
}

describe('Auth routes (F-235 + refresh tokens)', () => {
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

    // Clean up any existing refresh tokens for this user
    await pool.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [testUserId]);
  });

  afterAll(async () => {
    const pool = getPool();
    await pool.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [testUserId]);
    await pool.query(`DELETE FROM auth_audit WHERE email = $1`, [TEST_EMAIL]);
    await pool.query(`DELETE FROM users WHERE email = $1`, [TEST_EMAIL]);
    await closeApp();
  });

  it('happy path: login → access token + refresh cookie → GET /me', async () => {
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

    // Login must set gda_refresh cookie
    const refreshCookie = extractCookie(loginRes, 'gda_refresh');
    expect(refreshCookie).toBeDefined();

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

  /* ── Refresh token flow tests ───────────────────────────────── */

  it('/refresh with valid cookie returns new access token + rotates cookie', async () => {
    const pool = getPool();
    await pool.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [testUserId]);
    await pool.query(`UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = $1`, [testUserId]);

    // Login to get a refresh cookie
    const loginRes = await app.inject({
      method: 'POST',
      url: '/v3/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(loginRes.statusCode).toBe(200);
    const refreshCookie = extractCookie(loginRes, 'gda_refresh');
    expect(refreshCookie).toBeDefined();

    // Use refresh cookie to get new access token
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/v3/auth/refresh',
      cookies: { gda_refresh: refreshCookie! },
    });
    expect(refreshRes.statusCode).toBe(200);
    const body = refreshRes.json();
    expect(body.success).toBe(true);
    expect(body.data.token).toBeDefined();

    // Should set a new rotated cookie
    const newCookie = extractCookie(refreshRes, 'gda_refresh');
    expect(newCookie).toBeDefined();
    expect(newCookie).not.toBe(refreshCookie);

    // Old token should be revoked in DB
    const oldHash = createHash('sha256').update(refreshCookie!).digest('hex');
    const oldRow = await pool.query(
      `SELECT revoked_at, replaced_by_id FROM refresh_tokens WHERE token_hash = $1`,
      [oldHash],
    );
    expect(oldRow.rows[0].revoked_at).not.toBeNull();
    expect(oldRow.rows[0].replaced_by_id).not.toBeNull();
  });

  it('/refresh without cookie returns 401 INVALID_REFRESH_TOKEN', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v3/auth/refresh',
    });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('/refresh with revoked token revokes entire family', async () => {
    const pool = getPool();
    await pool.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [testUserId]);
    await pool.query(`UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = $1`, [testUserId]);

    // Login to get initial refresh token
    const loginRes = await app.inject({
      method: 'POST',
      url: '/v3/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const cookie1 = extractCookie(loginRes, 'gda_refresh')!;

    // Refresh to rotate (cookie1 → cookie2)
    const refresh1 = await app.inject({
      method: 'POST',
      url: '/v3/auth/refresh',
      cookies: { gda_refresh: cookie1 },
    });
    expect(refresh1.statusCode).toBe(200);
    const cookie2 = extractCookie(refresh1, 'gda_refresh')!;

    // Attempt reuse of revoked cookie1 → should fail AND revoke all tokens for user
    const reuse = await app.inject({
      method: 'POST',
      url: '/v3/auth/refresh',
      cookies: { gda_refresh: cookie1 },
    });
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json().error.code).toBe('REVOKED_REFRESH_TOKEN');

    // cookie2 should now also be revoked (family-wide revocation)
    const tryC2 = await app.inject({
      method: 'POST',
      url: '/v3/auth/refresh',
      cookies: { gda_refresh: cookie2 },
    });
    expect(tryC2.statusCode).toBe(401);

    // Verify in DB: all tokens for this user are revoked
    const active = await pool.query(
      `SELECT count(*)::int as cnt FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL`,
      [testUserId],
    );
    expect(active.rows[0].cnt).toBe(0);
  });

  it('/refresh with expired token returns 401 EXPIRED_REFRESH_TOKEN', async () => {
    const pool = getPool();
    await pool.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [testUserId]);
    await pool.query(`UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = $1`, [testUserId]);

    // Login to get a refresh token
    const loginRes = await app.inject({
      method: 'POST',
      url: '/v3/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const cookie = extractCookie(loginRes, 'gda_refresh')!;

    // Manually expire the token in DB
    const tokenHash = createHash('sha256').update(cookie).digest('hex');
    await pool.query(
      `UPDATE refresh_tokens SET expires_at = NOW() - INTERVAL '1 hour' WHERE token_hash = $1`,
      [tokenHash],
    );

    const res = await app.inject({
      method: 'POST',
      url: '/v3/auth/refresh',
      cookies: { gda_refresh: cookie },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('EXPIRED_REFRESH_TOKEN');
  });

  it('/logout revokes refresh token and clears cookie', async () => {
    const pool = getPool();
    await pool.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [testUserId]);
    await pool.query(`UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = $1`, [testUserId]);

    // Login
    const loginRes = await app.inject({
      method: 'POST',
      url: '/v3/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const cookie = extractCookie(loginRes, 'gda_refresh')!;

    // Logout
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/v3/auth/logout',
      cookies: { gda_refresh: cookie },
    });
    expect(logoutRes.statusCode).toBe(204);

    // Cookie should be cleared
    const cleared = extractCookie(logoutRes, 'gda_refresh');
    expect(cleared === undefined || cleared === '').toBe(true);

    // Token should be revoked in DB
    const tokenHash = createHash('sha256').update(cookie).digest('hex');
    const row = await pool.query(
      `SELECT revoked_at FROM refresh_tokens WHERE token_hash = $1`,
      [tokenHash],
    );
    expect(row.rows[0].revoked_at).not.toBeNull();

    // Using the cookie again should fail
    const retryRefresh = await app.inject({
      method: 'POST',
      url: '/v3/auth/refresh',
      cookies: { gda_refresh: cookie },
    });
    expect(retryRefresh.statusCode).toBe(401);
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
