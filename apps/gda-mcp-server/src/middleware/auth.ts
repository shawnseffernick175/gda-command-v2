import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface JwtPayload {
  sub: string;
  email?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

const JWT_ALGORITHM = 'HS256' as const;
const LEGACY_DEFAULT_SECRET = 'dev-jwt-secret-change-in-production';

/**
 * Resolve the JWT secret from the environment. There is intentionally NO
 * fallback: a public service must never verify tokens with a well-known
 * default secret (that would let anyone forge tokens). Throws if unset.
 */
function resolveJwtSecret(): string {
  const secret = process.env['JWT_SECRET'];
  if (!secret) {
    throw new Error('JWT_SECRET is not set — refusing to verify tokens without a configured secret.');
  }
  return secret;
}

/**
 * Fail-fast startup validation. Call once before the server starts listening.
 * In production the secret must be strong (>=32 chars) and must not be the
 * legacy hard-coded default.
 */
export function assertJwtSecret(): void {
  const secret = resolveJwtSecret();
  if (process.env['NODE_ENV'] === 'production') {
    if (secret === LEGACY_DEFAULT_SECRET) {
      throw new Error('JWT_SECRET must not be the built-in default in production.');
    }
    if (secret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters in production.');
    }
  }
}

export function requireBearerJwt(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, resolveJwtSecret(), {
      algorithms: [JWT_ALGORITHM],
    }) as JwtPayload;
    (req as Request & { user: JwtPayload }).user = decoded;
    next();
  } catch (err) {
    const message =
      err instanceof jwt.TokenExpiredError
        ? 'Token expired'
        : 'Missing or invalid authorization';
    res.status(401).json({ error: message });
  }
}
