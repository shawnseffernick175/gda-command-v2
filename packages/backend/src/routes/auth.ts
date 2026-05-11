/**
 * Auth routes: login, register, refresh, me, logout.
 */

import { Router, Request, Response } from "express";
import crypto from "crypto";
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  authMiddleware,
} from "../lib/auth";
import { getPool } from "../lib/db";

const router = Router();

function envelope(data: unknown, action: string, meta?: Record<string, unknown>) {
  return {
    success: true,
    workflow: "auth",
    action,
    dryRun: false,
    data,
    meta: meta ?? {},
    error: null,
  };
}

function errorEnvelope(code: string, message: string, action: string, status = 400) {
  return {
    success: false,
    workflow: "auth",
    action,
    dryRun: false,
    data: null,
    meta: {},
    error: { code, message, detail: null },
  };
}

// POST /api/auth/register
router.post("/register", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.status(503).json(errorEnvelope("DB_NOT_CONFIGURED", "Database not configured", "register", 503));
    return;
  }

  const { email, password, display_name } = req.body;
  if (!email || !password || !display_name) {
    res.status(400).json(errorEnvelope("MISSING_FIELDS", "email, password, and display_name required", "register"));
    return;
  }

  // Check existing
  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.rows.length > 0) {
    res.status(409).json(errorEnvelope("EMAIL_EXISTS", "Email already registered", "register", 409));
    return;
  }

  const password_hash = await hashPassword(password);
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, role)
     VALUES ($1, $2, $3, $4, 'viewer')`,
    [id, email, password_hash, display_name]
  );

  const payload = { userId: id, email, role: "viewer" };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  // Store refresh token hash
  const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
    [id, tokenHash]
  );

  res.status(201).json(envelope({ accessToken, refreshToken, user: { id, email, display_name, role: "viewer" } }, "register"));
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.status(503).json(errorEnvelope("DB_NOT_CONFIGURED", "Database not configured", "login", 503));
    return;
  }

  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json(errorEnvelope("MISSING_FIELDS", "email and password required", "login"));
    return;
  }

  const { rows } = await pool.query(
    "SELECT id, email, password_hash, display_name, role, is_active FROM users WHERE email = $1",
    [email]
  );
  if (rows.length === 0) {
    res.status(401).json(errorEnvelope("INVALID_CREDENTIALS", "Invalid email or password", "login", 401));
    return;
  }

  const user = rows[0];
  if (!user.is_active) {
    res.status(403).json(errorEnvelope("ACCOUNT_DISABLED", "Account is disabled", "login", 403));
    return;
  }

  if (!user.password_hash) {
    res.status(401).json(errorEnvelope("NO_PASSWORD", "Account uses OAuth — no password set", "login", 401));
    return;
  }

  const valid = await comparePassword(password, user.password_hash);
  if (!valid) {
    res.status(401).json(errorEnvelope("INVALID_CREDENTIALS", "Invalid email or password", "login", 401));
    return;
  }

  // Update last_login_at
  await pool.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);

  const payload = { userId: user.id, email: user.email, role: user.role };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
    [user.id, tokenHash]
  );

  res.json(envelope({
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, display_name: user.display_name, role: user.role },
  }, "login"));
});

// POST /api/auth/refresh
router.post("/refresh", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.status(503).json(errorEnvelope("DB_NOT_CONFIGURED", "Database not configured", "refresh", 503));
    return;
  }

  const { refreshToken: token } = req.body;
  if (!token) {
    res.status(400).json(errorEnvelope("MISSING_TOKEN", "refreshToken required", "refresh"));
    return;
  }

  try {
    const decoded = verifyToken(token);
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Verify token exists and hasn't been revoked
    const { rows } = await pool.query(
      "SELECT id FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2 AND expires_at > NOW()",
      [tokenHash, decoded.userId]
    );
    if (rows.length === 0) {
      res.status(401).json(errorEnvelope("TOKEN_REVOKED", "Refresh token revoked or expired", "refresh", 401));
      return;
    }

    // Rotate: delete old, issue new
    await pool.query("DELETE FROM refresh_tokens WHERE token_hash = $1", [tokenHash]);

    const payload = { userId: decoded.userId, email: decoded.email, role: decoded.role };
    const newAccess = generateAccessToken(payload);
    const newRefresh = generateRefreshToken(payload);
    const newHash = crypto.createHash("sha256").update(newRefresh).digest("hex");

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [decoded.userId, newHash]
    );

    res.json(envelope({ accessToken: newAccess, refreshToken: newRefresh }, "refresh"));
  } catch {
    res.status(401).json(errorEnvelope("INVALID_TOKEN", "Invalid refresh token", "refresh", 401));
  }
});

// GET /api/auth/me (requires auth)
router.get("/me", authMiddleware, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool || !req.user) {
    res.json(envelope({
      id: req.user?.userId ?? "dev-user",
      email: req.user?.email ?? "admin@gda-command.local",
      display_name: "GDA Admin",
      role: req.user?.role ?? "admin",
    }, "me"));
    return;
  }

  const { rows } = await pool.query(
    "SELECT id, email, display_name, role, avatar_url, is_active, last_login_at, created_at FROM users WHERE id = $1",
    [req.user.userId]
  );

  if (rows.length === 0) {
    res.status(404).json(errorEnvelope("USER_NOT_FOUND", "User not found", "me", 404));
    return;
  }

  res.json(envelope(rows[0], "me"));
});

// POST /api/auth/logout
router.post("/logout", authMiddleware, async (req: Request, res: Response) => {
  const pool = getPool();
  if (pool && req.user) {
    // Revoke all refresh tokens for this user
    await pool.query("DELETE FROM refresh_tokens WHERE user_id = $1", [req.user.userId]);
  }
  res.json(envelope({ message: "Logged out" }, "logout"));
});

export default router;
