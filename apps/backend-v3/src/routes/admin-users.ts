/**
 * Admin User Management routes — F-499
 *
 * GET    /v3/admin/users           — list all users (admin only)
 * POST   /v3/admin/users           — create a user (admin only)
 * PATCH  /v3/admin/users/:id       — update role / active status (admin only)
 * DELETE /v3/admin/users/:id       — deactivate user (admin only, no hard delete)
 */

import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';

interface UserRow {
  id: number;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

function requireAdmin(req: { user?: { role?: string } }, reply: { status: (n: number) => { send: (b: unknown) => unknown }; requestId?: string }): boolean {
  if ((req as { user?: { role?: string } }).user?.role !== 'admin') {
    reply.status(403).send(
      errorEnvelope('UNAUTHORIZED', 'Admin role required', (reply as { requestId?: string }).requestId ?? '')
    );
    return false;
  }
  return true;
}

export async function adminUsersRoutes(app: FastifyInstance): Promise<void> {
  // GET /v3/admin/users
  app.get('/v3/admin/users', async (req, reply) => {
    const user = (req as typeof req & { user?: { role?: string } }).user;
    if (user?.role !== 'admin') {
      return reply.status(403).send(errorEnvelope('UNAUTHORIZED', 'Admin role required', req.requestId));
    }

    const { rows } = await pool.query<UserRow>(
      `SELECT id, email, display_name, role, is_active, last_login_at, created_at, updated_at
       FROM users
       ORDER BY created_at ASC`
    );

    return reply.send(successEnvelope({ items: rows, total: rows.length }, req.requestId));
  });

  // POST /v3/admin/users
  app.post('/v3/admin/users', async (req, reply) => {
    const authUser = (req as typeof req & { user?: { role?: string } }).user;
    if (authUser?.role !== 'admin') {
      return reply.status(403).send(errorEnvelope('UNAUTHORIZED', 'Admin role required', req.requestId));
    }

    const body = req.body as {
      email?: string;
      display_name?: string;
      role?: string;
      password?: string;
    };

    if (!body.email?.trim() || !body.display_name?.trim()) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'email and display_name are required', req.requestId));
    }

    const validRoles = ['admin', 'operator', 'viewer'];
    const role = body.role && validRoles.includes(body.role) ? body.role : 'operator';
    const password = body.password?.trim() || Math.random().toString(36).slice(2, 12);
    const hash = await bcrypt.hash(password, 12);

    const { rows } = await pool.query<UserRow>(
      `INSERT INTO users (email, display_name, role, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, display_name, role, is_active, last_login_at, created_at, updated_at`,
      [body.email.trim().toLowerCase(), body.display_name.trim(), role, hash]
    );

    return reply.status(201).send(successEnvelope({ ...rows[0], _temp_password: body.password ? undefined : password }, req.requestId));
  });

  // PATCH /v3/admin/users/:id
  app.patch('/v3/admin/users/:id', async (req, reply) => {
    const authUser = (req as typeof req & { user?: { role?: string } }).user;
    if (authUser?.role !== 'admin') {
      return reply.status(403).send(errorEnvelope('UNAUTHORIZED', 'Admin role required', req.requestId));
    }

    const { id } = req.params as { id: string };
    const body = req.body as { role?: string; is_active?: boolean; display_name?: string };
    const sets: string[] = [];
    const params: unknown[] = [];

    const validRoles = ['admin', 'operator', 'viewer'];
    if (body.role !== undefined && validRoles.includes(body.role)) {
      params.push(body.role);
      sets.push(`role = $${params.length}`);
    }
    if (body.is_active !== undefined) {
      params.push(body.is_active);
      sets.push(`is_active = $${params.length}`);
    }
    if (body.display_name?.trim()) {
      params.push(body.display_name.trim());
      sets.push(`display_name = $${params.length}`);
    }

    if (!sets.length) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'No valid fields to update', req.requestId));
    }

    sets.push('updated_at = NOW()');
    params.push(Number(id));

    const { rows } = await pool.query<UserRow>(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, email, display_name, role, is_active, last_login_at, created_at, updated_at`,
      params
    );

    if (!rows.length) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'User not found', req.requestId));
    }

    return reply.send(successEnvelope(rows[0], req.requestId));
  });

  // DELETE /v3/admin/users/:id — deactivate, never hard delete
  app.delete('/v3/admin/users/:id', async (req, reply) => {
    const authUser = (req as typeof req & { user?: { role?: string } }).user;
    if (authUser?.role !== 'admin') {
      return reply.status(403).send(errorEnvelope('UNAUTHORIZED', 'Admin role required', req.requestId));
    }

    const { id } = req.params as { id: string };

    const { rows } = await pool.query<UserRow>(
      `UPDATE users SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, display_name, role, is_active`,
      [Number(id)]
    );

    if (!rows.length) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'User not found', req.requestId));
    }

    return reply.send(successEnvelope(rows[0], req.requestId));
  });
}
