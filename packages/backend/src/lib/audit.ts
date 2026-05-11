/**
 * Audit logging — records who changed what, when.
 */

import { Request } from "express";
import { getPool } from "./db";
import { log } from "./logger";

interface AuditEntry {
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
}

export async function recordAudit(req: Request, entry: AuditEntry): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  const userId = req.user?.userId ?? null;
  const userEmail = req.user?.email ?? null;
  const ip = req.headers["x-forwarded-for"] as string ?? req.ip ?? null;

  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, user_email, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        userId,
        userEmail,
        entry.action,
        entry.resourceType,
        entry.resourceId ?? null,
        JSON.stringify(entry.details ?? {}),
        ip,
      ]
    );
  } catch (err) {
    log.error("audit_log_write_error", { error: (err as Error).message, ...entry });
  }
}
