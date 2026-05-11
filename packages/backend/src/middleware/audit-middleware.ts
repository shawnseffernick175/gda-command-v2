/**
 * Audit middleware — automatically records POST/PUT/PATCH/DELETE requests.
 * Attaches to the response 'finish' event to capture the outcome.
 */

import { Request, Response, NextFunction } from "express";
import { getPool } from "../lib/db";
import { log } from "../lib/logger";

const SKIP_PATHS = [
  "/errors",
  "/audit",
  "/health",
  "/webhooks/registry",
];

function extractResourceInfo(req: Request): { resourceType: string; resourceId?: string } {
  const parts = req.path.replace(/^\/api\//, "").split("/").filter(Boolean);
  const resourceType = parts[0] ?? "unknown";
  const resourceId = parts.length > 1 ? parts[parts.length - 1] : undefined;
  return { resourceType, resourceId };
}

export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }

  if (SKIP_PATHS.some((p) => req.path.startsWith(p))) {
    next();
    return;
  }

  const startTime = Date.now();

  res.on("finish", () => {
    const pool = getPool();
    if (!pool) return;

    // Only log successful write operations (2xx/3xx)
    if (res.statusCode >= 400) return;

    const userId = req.user?.userId ?? null;
    const userEmail = req.user?.email ?? null;
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? null;
    const { resourceType, resourceId } = extractResourceInfo(req);
    const action = `${req.method} ${req.path}`;

    const details: Record<string, unknown> = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - startTime,
    };

    // Include body keys (not values) for context
    if (req.body && typeof req.body === "object") {
      details.bodyKeys = Object.keys(req.body);
    }

    pool.query(
      `INSERT INTO audit_log (user_id, user_email, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [userId, userEmail, action, resourceType, resourceId ?? null, JSON.stringify(details), ip]
    ).catch((err) => {
      log.error("audit_middleware_error", { error: (err as Error).message });
    });
  });

  next();
}
