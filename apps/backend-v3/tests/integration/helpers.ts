/**
 * Shared helpers for integration tests.
 *
 * - Reads the DB URL written by globalSetup
 * - Provides JWT minting
 * - Provides a shared app instance + pg pool
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import type { SeedIds } from './seed.js';

const { Pool } = pg;

export const JWT_SECRET = 'test-jwt-secret-integration';
export const WEBHOOK_KEY = 'test-webhook-key-integration';

export function getDbUrl(): string {
  const envUrl = process.env['DATABASE_URL'];
  if (envUrl) return envUrl;

  const filePath = resolve(import.meta.dirname, '.db-url');
  return readFileSync(filePath, 'utf-8').trim();
}

export function getSeedIds(): SeedIds {
  const filePath = resolve(import.meta.dirname, '.seed-ids');
  return JSON.parse(readFileSync(filePath, 'utf-8')) as SeedIds;
}

export function authHeader(): Record<string, string> {
  const token = jwt.sign(
    { sub: 'test-user', email: 'test@gda.local', role: 'admin' },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
  return { authorization: `Bearer ${token}` };
}

let _pool: InstanceType<typeof Pool> | null = null;
let _app: FastifyInstance | null = null;

export function getPool(): InstanceType<typeof Pool> {
  if (!_pool) {
    _pool = new Pool({ connectionString: getDbUrl(), max: 5 });
  }
  return _pool;
}

export async function getApp(): Promise<FastifyInstance> {
  if (_app) return _app;

  // Set env vars before importing app (config reads them at import time)
  process.env['JWT_SECRET'] = JWT_SECRET;
  process.env['GDA_WEBHOOK_KEY'] = WEBHOOK_KEY;
  process.env['DATABASE_URL'] = getDbUrl();
  process.env['NODE_ENV'] = 'test';
  process.env['ANALYSIS_VERSION'] = 'v0.0.1-test';
  process.env['ANALYSIS_TIMEOUT_MS'] = '5000';
  process.env['ANALYSIS_POLL_INTERVAL_MS'] = '50';

  const { buildApp } = await import('../../src/app.js');
  _app = await buildApp();
  await _app.ready();
  return _app;
}

export async function closeApp(): Promise<void> {
  if (_app) {
    await _app.close();
    _app = null;
  }
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
