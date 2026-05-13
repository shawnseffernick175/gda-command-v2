/**
 * Admin routes — user management (admin-only).
 * Provides CRUD operations for managing users, roles, and account status.
 */

import { Router, Request, Response } from "express";
import { requireRole, hashPassword } from "../lib/auth";
import { getPool } from "../lib/db";
import { successEnvelope } from "../middleware/envelope";
import { log } from "../lib/logger";
import crypto from "crypto";

const router = Router();

const VALID_ROLES = ["admin", "bd_manager", "capture_lead", "analyst", "viewer"] as const;

// GET /api/admin/users — list all users
router.get("/users", requireRole("admin"), async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.status(503).json({ success: false, error: "Database not configured" });
    return;
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, email, display_name, role, is_active, avatar_url,
              last_login_at, created_at, updated_at
       FROM users ORDER BY created_at DESC`
    );

    res.json(successEnvelope("admin", "list-users", {
      users: rows,
      total: rows.length,
      roles: VALID_ROLES,
    }));
  } catch (err) {
    log.error("admin_list_users_error", { error: (err as Error).message });
    res.status(500).json({ success: false, error: "Failed to list users" });
  }
});

// PATCH /api/admin/users/:id/role — update user role
router.patch("/users/:id/role", requireRole("admin"), async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.status(503).json({ success: false, error: "Database not configured" });
    return;
  }

  const { id } = req.params;
  const { role } = req.body;

  if (!role || !VALID_ROLES.includes(role)) {
    res.status(400).json({
      success: false,
      error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`,
    });
    return;
  }

  try {
    // Prevent demoting the last admin
    if (role !== "admin") {
      const adminCount = await pool.query(
        "SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = true AND id != $1",
        [id]
      );
      const currentUser = await pool.query("SELECT role FROM users WHERE id = $1", [id]);
      if (currentUser.rows[0]?.role === "admin" && parseInt(adminCount.rows[0].count) === 0) {
        res.status(400).json({
          success: false,
          error: "Cannot demote the last admin. Promote another user first.",
        });
        return;
      }
    }

    const { rows } = await pool.query(
      `UPDATE users SET role = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, display_name, role, is_active`,
      [role, id]
    );

    if (rows.length === 0) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    log.info("admin_role_updated", { targetUserId: id, newRole: role, updatedBy: req.user?.userId });
    res.json(successEnvelope("admin", "update-role", rows[0]));
  } catch (err) {
    log.error("admin_update_role_error", { error: (err as Error).message });
    res.status(500).json({ success: false, error: "Failed to update role" });
  }
});

// PATCH /api/admin/users/:id/status — activate/deactivate user
router.patch("/users/:id/status", requireRole("admin"), async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.status(503).json({ success: false, error: "Database not configured" });
    return;
  }

  const { id } = req.params;
  const { is_active } = req.body;

  if (typeof is_active !== "boolean") {
    res.status(400).json({ success: false, error: "is_active must be a boolean" });
    return;
  }

  // Prevent deactivating self
  if (!is_active && req.user?.userId === id) {
    res.status(400).json({ success: false, error: "Cannot deactivate your own account" });
    return;
  }

  try {
    // Prevent deactivating the last admin
    if (!is_active) {
      const user = await pool.query("SELECT role FROM users WHERE id = $1", [id]);
      if (user.rows[0]?.role === "admin") {
        const adminCount = await pool.query(
          "SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = true AND id != $1",
          [id]
        );
        if (parseInt(adminCount.rows[0].count) === 0) {
          res.status(400).json({
            success: false,
            error: "Cannot deactivate the last admin.",
          });
          return;
        }
      }
    }

    const { rows } = await pool.query(
      `UPDATE users SET is_active = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, display_name, role, is_active`,
      [is_active, id]
    );

    if (rows.length === 0) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    // Revoke refresh tokens when deactivating
    if (!is_active) {
      await pool.query("DELETE FROM refresh_tokens WHERE user_id = $1", [id]);
    }

    log.info("admin_status_updated", { targetUserId: id, is_active, updatedBy: req.user?.userId });
    res.json(successEnvelope("admin", "update-status", rows[0]));
  } catch (err) {
    log.error("admin_update_status_error", { error: (err as Error).message });
    res.status(500).json({ success: false, error: "Failed to update user status" });
  }
});

// POST /api/admin/users — create user (admin only)
router.post("/users", requireRole("admin"), async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.status(503).json({ success: false, error: "Database not configured" });
    return;
  }

  const { email, password, display_name, role } = req.body;

  if (!email || !password || !display_name) {
    res.status(400).json({
      success: false,
      error: "email, password, and display_name are required",
    });
    return;
  }

  const userRole = role && VALID_ROLES.includes(role) ? role : "viewer";

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      res.status(409).json({ success: false, error: "Email already registered" });
      return;
    }

    const password_hash = await hashPassword(password);
    const id = crypto.randomUUID();

    await pool.query(
      `INSERT INTO users (id, email, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, email, password_hash, display_name, userRole]
    );

    log.info("admin_user_created", { newUserId: id, role: userRole, createdBy: req.user?.userId });
    res.status(201).json(successEnvelope("admin", "create-user", {
      id, email, display_name, role: userRole, is_active: true,
    }));
  } catch (err) {
    log.error("admin_create_user_error", { error: (err as Error).message });
    res.status(500).json({ success: false, error: "Failed to create user" });
  }
});

// DELETE /api/admin/users/:id — permanently delete user (admin only)
router.delete("/users/:id", requireRole("admin"), async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.status(503).json({ success: false, error: "Database not configured" });
    return;
  }

  const { id } = req.params;

  // Prevent deleting self
  if (req.user?.userId === id) {
    res.status(400).json({ success: false, error: "Cannot delete your own account" });
    return;
  }

  try {
    // Prevent deleting the last admin
    const user = await pool.query("SELECT role FROM users WHERE id = $1", [id]);
    if (user.rows.length === 0) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }
    if (user.rows[0].role === "admin") {
      const adminCount = await pool.query(
        "SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = true AND id != $1",
        [id]
      );
      if (parseInt(adminCount.rows[0].count) === 0) {
        res.status(400).json({ success: false, error: "Cannot delete the last admin." });
        return;
      }
    }

    await pool.query("DELETE FROM refresh_tokens WHERE user_id = $1", [id]);
    await pool.query("DELETE FROM users WHERE id = $1", [id]);

    log.info("admin_user_deleted", { deletedUserId: id, deletedBy: req.user?.userId });
    res.json(successEnvelope("admin", "delete-user", { id, deleted: true }));
  } catch (err) {
    log.error("admin_delete_user_error", { error: (err as Error).message });
    res.status(500).json({ success: false, error: "Failed to delete user" });
  }
});

// GET /api/admin/roles — list available roles with descriptions
router.get("/roles", requireRole("admin"), (_req: Request, res: Response) => {
  res.json(successEnvelope("admin", "list-roles", {
    roles: [
      { id: "admin", label: "Administrator", description: "Full access — manage users, settings, and all data" },
      { id: "bd_manager", label: "BD Manager", description: "Create/edit opportunities, approvals, and capture plans" },
      { id: "capture_lead", label: "Capture Lead", description: "Manage capture plans, gate reviews, and proposals" },
      { id: "analyst", label: "Analyst", description: "Read-only access plus reports, analytics, and AI tools" },
      { id: "viewer", label: "Viewer", description: "Read-only access to dashboards and data" },
    ],
  }));
});

// POST /api/admin/invite — send email invitation
router.post("/invite", requireRole("admin"), async (req: Request, res: Response) => {
  const { email, role = "viewer" } = req.body;
  if (!email) {
    res.status(400).json({ success: false, error: "email is required" });
    return;
  }
  if (!VALID_ROLES.includes(role as typeof VALID_ROLES[number])) {
    res.status(400).json({ success: false, error: `Invalid role: ${role}` });
    return;
  }

  const pool = getPool();
  if (!pool) {
    res.status(503).json({ success: false, error: "Database not configured" });
    return;
  }

  try {
    const token = crypto.randomBytes(32).toString("hex");
    await pool.query(
      `INSERT INTO user_invitations (email, role, token, invited_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [email, role, token, req.user?.userId ?? null]
    );

    // Generate invitation link
    const inviteUrl = `${req.protocol}://${req.get("host")}/register?token=${token}`;

    log.info("admin_user_invited", { email, role, invitedBy: req.user?.userId });

    res.json(successEnvelope("admin", "invite-user", {
      email,
      role,
      token,
      invite_url: inviteUrl,
      message: `Invitation created. Share this link with ${email}: ${inviteUrl}`,
    }));
  } catch (err) {
    log.error("admin_invite_error", { error: (err as Error).message });
    res.status(500).json({ success: false, error: "Failed to create invitation" });
  }
});

// GET /api/admin/invitations — list pending invitations
router.get("/invitations", requireRole("admin"), async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.status(503).json({ success: false, error: "Database not configured" });
    return;
  }

  try {
    const { rows } = await pool.query(
      "SELECT id, email, role, created_at, expires_at, accepted_at FROM user_invitations ORDER BY created_at DESC"
    );
    res.json(successEnvelope("admin", "list-invitations", { invitations: rows, total: rows.length }));
  } catch (err) {
    log.error("admin_list_invitations_error", { error: (err as Error).message });
    res.status(500).json({ success: false, error: "Failed to list invitations" });
  }
});

export default router;
