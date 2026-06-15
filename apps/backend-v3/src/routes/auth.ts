import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'node:crypto';
import { config } from '../config/index.js';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import type { JwtPayload } from '../middleware/auth.js';

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MINUTES = 15;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_DAYS = 30;
const REFRESH_TOKEN_SECONDS = REFRESH_TOKEN_DAYS * 24 * 60 * 60;

interface LoginBody {
  email: string;
  password: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function refreshCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict' as const,
    path: '/v3/auth',
    maxAge: REFRESH_TOKEN_SECONDS,
  };
}

async function recordAudit(
  userId: number | null,
  email: string,
  event: string,
  req: FastifyRequest,
): Promise<void> {
  const ip = req.ip || null;
  const userAgent = req.headers['user-agent'] || null;
  const requestId = req.requestId || null;
  await pool.query(
    `INSERT INTO auth_audit (user_id, email, event, ip, user_agent, request_id)
     VALUES ($1, $2, $3, $4::inet, $5, $6)`,
    [userId, email, event, ip, userAgent, requestId],
  );
}

async function issueRefreshToken(
  userId: number,
  req: FastifyRequest,
): Promise<string> {
  const plaintext = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(plaintext);
  const userAgent = req.headers['user-agent'] || null;
  const ip = req.ip || null;

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1, $2, NOW() + INTERVAL '${REFRESH_TOKEN_DAYS} days', $3, $4::inet)`,
    [userId, tokenHash, userAgent, ip],
  );

  return plaintext;
}

async function revokeTokenFamily(userId: number): Promise<void> {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const isSecure = config.nodeEnv === 'production';

  app.post('/v3/auth/login', async (req: FastifyRequest, reply: FastifyReply) => {
    const { email, password } = req.body as LoginBody;

    if (!email || !password) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Email and password are required', req.requestId),
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    const userRes = await pool.query(
      `SELECT id, email, display_name, role, is_active, password_hash,
              failed_login_count, locked_until
       FROM users WHERE email = $1`,
      [normalizedEmail],
    );

    if (userRes.rows.length === 0) {
      await recordAudit(null, normalizedEmail, 'login_failure', req);
      return reply.status(401).send(
        errorEnvelope('UNAUTHORIZED', 'Invalid credentials', req.requestId),
      );
    }

    const user = userRes.rows[0];

    if (!user.is_active) {
      await recordAudit(user.id, normalizedEmail, 'login_failure', req);
      return reply.status(401).send(
        errorEnvelope('UNAUTHORIZED', 'Invalid credentials', req.requestId),
      );
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const retryAfter = Math.ceil(
        (new Date(user.locked_until).getTime() - Date.now()) / 1000,
      );
      await recordAudit(user.id, normalizedEmail, 'login_failure', req);
      return reply.status(423).send({
        success: false,
        code: 'ACCOUNT_LOCKED',
        message: 'Account is temporarily locked due to too many failed attempts',
        retryAfter,
        meta: { requestId: req.requestId },
      });
    }

    if (!user.password_hash) {
      await recordAudit(user.id, normalizedEmail, 'login_failure', req);
      return reply.status(401).send(
        errorEnvelope('UNAUTHORIZED', 'Invalid credentials', req.requestId),
      );
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordValid) {
      const newCount = (user.failed_login_count || 0) + 1;

      if (newCount >= LOCKOUT_THRESHOLD) {
        const lockedUntil = new Date(
          Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000,
        );
        await pool.query(
          `UPDATE users SET failed_login_count = $1, locked_until = $2 WHERE id = $3`,
          [newCount, lockedUntil.toISOString(), user.id],
        );
        await recordAudit(user.id, normalizedEmail, 'lockout', req);
        const retryAfter = LOCKOUT_DURATION_MINUTES * 60;
        return reply.status(423).send({
          success: false,
          code: 'ACCOUNT_LOCKED',
          message: 'Account is temporarily locked due to too many failed attempts',
          retryAfter,
          meta: { requestId: req.requestId },
        });
      }

      await pool.query(
        `UPDATE users SET failed_login_count = $1 WHERE id = $2`,
        [newCount, user.id],
      );
      await recordAudit(user.id, normalizedEmail, 'login_failure', req);
      return reply.status(401).send(
        errorEnvelope('UNAUTHORIZED', 'Invalid credentials', req.requestId),
      );
    }

    // Successful login — reset counters
    await pool.query(
      `UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW() WHERE id = $1`,
      [user.id],
    );

    const payload: JwtPayload = {
      sub: String(user.id),
      email: user.email,
      role: user.role,
    };

    const token = jwt.sign(payload, config.jwtSecret, {
      algorithm: config.jwtAlgorithm,
      expiresIn: ACCESS_TOKEN_TTL,
    });

    const refreshToken = await issueRefreshToken(user.id, req);

    void reply.setCookie('gda_refresh', refreshToken, refreshCookieOptions(isSecure));

    await recordAudit(user.id, normalizedEmail, 'login_success', req);

    return reply.status(200).send(
      successEnvelope({
        token,
        user: {
          id: user.id,
          email: user.email,
          display_name: user.display_name,
          role: user.role,
        },
      }, req.requestId),
    );
  });

  app.get('/v3/auth/me', async (req: FastifyRequest, reply: FastifyReply) => {
    const userPayload = (req as FastifyRequest & { user: JwtPayload }).user;
    if (!userPayload) {
      return reply.status(401).send(
        errorEnvelope('UNAUTHORIZED', 'Missing or invalid authorization', req.requestId),
      );
    }

    const result = await pool.query(
      `SELECT id, email, display_name, role, is_active, last_login_at, created_at
       FROM users WHERE id = $1`,
      [userPayload.sub],
    );

    if (result.rows.length === 0) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'User not found', req.requestId),
      );
    }

    const user = result.rows[0];
    return reply.status(200).send(
      successEnvelope({
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        role: user.role,
        is_active: user.is_active,
        last_login_at: user.last_login_at,
        created_at: user.created_at,
      }, req.requestId),
    );
  });

  app.post('/v3/auth/refresh', async (req: FastifyRequest, reply: FastifyReply) => {
    const cookieValue = (req.cookies as Record<string, string | undefined>)?.gda_refresh;

    if (!cookieValue) {
      return reply.status(401).send(
        errorEnvelope('INVALID_REFRESH_TOKEN', 'No refresh token provided', req.requestId),
      );
    }

    const tokenHash = hashToken(cookieValue);

    const tokenRes = await pool.query(
      `SELECT rt.id, rt.user_id, rt.revoked_at, rt.expires_at,
              u.email, u.role, u.is_active
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1`,
      [tokenHash],
    );

    if (tokenRes.rows.length === 0) {
      void reply.clearCookie('gda_refresh', { path: '/v3/auth' });
      return reply.status(401).send(
        errorEnvelope('INVALID_REFRESH_TOKEN', 'Invalid refresh token', req.requestId),
      );
    }

    const row = tokenRes.rows[0];

    // Revoked token reuse → compromise detected, revoke entire family
    if (row.revoked_at) {
      await revokeTokenFamily(row.user_id);
      void reply.clearCookie('gda_refresh', { path: '/v3/auth' });
      await recordAudit(row.user_id, row.email ?? 'unknown', 'refresh_revoked_reuse', req);
      return reply.status(401).send(
        errorEnvelope('REVOKED_REFRESH_TOKEN', 'Refresh token has been revoked', req.requestId),
      );
    }

    if (new Date(row.expires_at) < new Date()) {
      void reply.clearCookie('gda_refresh', { path: '/v3/auth' });
      return reply.status(401).send(
        errorEnvelope('EXPIRED_REFRESH_TOKEN', 'Refresh token has expired', req.requestId),
      );
    }

    if (!row.is_active) {
      void reply.clearCookie('gda_refresh', { path: '/v3/auth' });
      return reply.status(401).send(
        errorEnvelope('UNAUTHORIZED', 'Account is disabled', req.requestId),
      );
    }

    // Rotate: issue new refresh token, revoke old one
    const newRefreshToken = await issueRefreshToken(row.user_id, req);

    // Get the new token's id for replaced_by_id tracking
    const newTokenHash = hashToken(newRefreshToken);
    const newTokenRes = await pool.query(
      `SELECT id FROM refresh_tokens WHERE token_hash = $1`,
      [newTokenHash],
    );
    const newTokenId = newTokenRes.rows[0]?.id ?? null;

    await pool.query(
      `UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by_id = $1 WHERE id = $2`,
      [newTokenId, row.id],
    );

    // Issue new access token
    const jwtPayload: JwtPayload = {
      sub: String(row.user_id),
      email: row.email,
      role: row.role,
    };

    const accessToken = jwt.sign(jwtPayload, config.jwtSecret, {
      algorithm: config.jwtAlgorithm,
      expiresIn: ACCESS_TOKEN_TTL,
    });

    void reply.setCookie('gda_refresh', newRefreshToken, refreshCookieOptions(isSecure));

    await recordAudit(row.user_id, row.email ?? 'unknown', 'refresh', req);

    return reply.status(200).send(
      successEnvelope({ token: accessToken }, req.requestId),
    );
  });

  app.post('/v3/auth/logout', async (req: FastifyRequest, reply: FastifyReply) => {
    const cookieValue = (req.cookies as Record<string, string | undefined>)?.gda_refresh;

    if (cookieValue) {
      const tokenHash = hashToken(cookieValue);
      const tokenRes = await pool.query(
        `SELECT id, user_id FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL`,
        [tokenHash],
      );
      if (tokenRes.rows.length > 0) {
        const row = tokenRes.rows[0];
        await pool.query(
          `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`,
          [row.id],
        );

        // Try to get email for audit from JWT if present, otherwise query
        const userPayload = (req as FastifyRequest & { user?: JwtPayload }).user;
        const email = userPayload?.email ?? 'unknown';
        await recordAudit(row.user_id, email, 'logout', req);
      }
    }

    void reply.clearCookie('gda_refresh', { path: '/v3/auth' });
    return reply.status(204).send();
  });
}
