/**
 * JWT-based authentication middleware.
 * Issues access + refresh tokens. Verifies on every API call.
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { getPool } from "./db";

const JWT_SECRET = process.env.JWT_SECRET ?? "gda-dev-secret-change-in-production";
const ACCESS_TOKEN_TTL = "8h";
const REFRESH_TOKEN_TTL = "7d";

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

export function generateAccessToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

export function generateRefreshToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_TOKEN_TTL });
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Auth middleware. When AUTH_REQUIRED=false (default for dev), all requests
 * pass through with a default admin user. In production, set AUTH_REQUIRED=true.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authRequired = process.env.AUTH_REQUIRED === "true";

  if (!authRequired) {
    // Dev mode — inject default admin user
    req.user = {
      userId: "a0000000-0000-0000-0000-000000000001",
      email: "admin@gda-command.local",
      role: "admin",
    };
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      workflow: "auth",
      action: "verify",
      dryRun: false,
      data: null,
      meta: {},
      error: { code: "UNAUTHORIZED", message: "Missing or invalid token", detail: null },
    });
    return;
  }

  try {
    const token = authHeader.slice(7);
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({
      success: false,
      workflow: "auth",
      action: "verify",
      dryRun: false,
      data: null,
      meta: {},
      error: { code: "TOKEN_EXPIRED", message: "Token expired or invalid", detail: null },
    });
  }
}

/**
 * Role guard — checks if user has one of the allowed roles.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        workflow: "auth",
        action: "authorize",
        dryRun: false,
        data: null,
        meta: {},
        error: { code: "FORBIDDEN", message: "Insufficient permissions", detail: null },
      });
      return;
    }
    next();
  };
}
