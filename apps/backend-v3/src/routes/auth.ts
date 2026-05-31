import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import type { JwtPayload } from '../middleware/auth.js';

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MINUTES = 15;
const TOKEN_TTL = '12h';

interface LoginBody {
  email: string;
  password: string;
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

export async function authRoutes(app: FastifyInstance): Promise<void> {
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

    // Check lockout
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

    // Verify password
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
      expiresIn: TOKEN_TTL,
    });

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
    const userPayload = (req as FastifyRequest & { user: JwtPayload }).user;
    if (!userPayload) {
      return reply.status(401).send(
        errorEnvelope('UNAUTHORIZED', 'Missing or invalid authorization', req.requestId),
      );
    }

    const newPayload: JwtPayload = {
      sub: userPayload.sub,
      email: userPayload.email,
      role: userPayload.role,
    };

    const token = jwt.sign(newPayload, config.jwtSecret, {
      algorithm: config.jwtAlgorithm,
      expiresIn: TOKEN_TTL,
    });

    await recordAudit(
      Number(userPayload.sub) || null,
      userPayload.email || 'unknown',
      'token_refresh',
      req,
    );

    return reply.status(200).send(
      successEnvelope({ token }, req.requestId),
    );
  });

  app.post('/v3/auth/logout', async (req: FastifyRequest, reply: FastifyReply) => {
    const userPayload = (req as FastifyRequest & { user: JwtPayload }).user;
    if (!userPayload) {
      return reply.status(401).send(
        errorEnvelope('UNAUTHORIZED', 'Missing or invalid authorization', req.requestId),
      );
    }

    await recordAudit(
      Number(userPayload.sub) || null,
      userPayload.email || 'unknown',
      'logout',
      req,
    );

    return reply.status(204).send();
  });
}
