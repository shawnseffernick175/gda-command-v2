/**
 * GovWin IQ CAS REST authentication service.
 *
 * P0 (#1099): CAS session-cookie auth is the DEFAULT GovWin auth path. The
 * account does NOT have the Deltek OAuth2 Web Services tier (oauth2 returns
 * 401 invalid_client), and the CAS flow verifiably works: POST /cas/v1/tickets
 * returns a TGT, the service ticket validates against j_spring_cas_security_check,
 * and the portal issues a JSESSIONID session cookie for data calls.
 *
 * GovWin uses Apereo CAS (not OAuth2 client-credentials).
 * Flow: POST /cas/v1/tickets with username+password → TGT,
 * then POST /cas/v1/tickets/{TGT} with service URL → ST,
 * then validate ST to get a session cookie for API calls.
 *
 * This path is enabled whenever GOVWIN_AUTH_MODE=cas (the default). Set
 * GOVWIN_AUTH_MODE=oauth2 (or GOVWIN_ALLOW_SCRAPE=true for dev override) to
 * change behaviour.
 *
 * Credentials are read from env: GOVWIN_USERNAME, GOVWIN_PASSWORD.
 * No secret is ever logged or serialized.
 */

import { createHash } from 'node:crypto';
import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { isCasMode } from './mode.js';

function casEnabled(): boolean {
  return isCasMode() || process.env['GOVWIN_ALLOW_SCRAPE'] === 'true';
}

const CAS_BASE = 'https://iq.govwin.com/cas/v1/tickets';
const SERVICE_URL = 'https://iq.govwin.com/neo/j_spring_cas_security_check';
const TGT_TTL_MS = 50 * 60 * 1000; // 50 minutes

interface AuthState {
  tgt: string | null;
  cookies: string[];
  expiresAt: number;
}

let cached: AuthState = { tgt: null, cookies: [], expiresAt: 0 };

function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function getCredentials(): { username: string; password: string } {
  const username = process.env['GOVWIN_USERNAME'];
  const password = process.env['GOVWIN_PASSWORD'];
  if (!username || !password) {
    throw new Error('GOVWIN_USERNAME and GOVWIN_PASSWORD must be set');
  }
  return { username, password };
}

async function obtainTGT(username: string, password: string): Promise<string> {
  const body = new URLSearchParams({
    username,
    password,
  });

  const res = await fetch(CAS_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    redirect: 'manual',
  });

  const html = await res.text();
  const match = html.match(/TGT-[^"]+/);
  if (!match) {
    throw new Error(`CAS TGT acquisition failed (HTTP ${res.status})`);
  }
  return match[0];
}

async function obtainServiceTicket(tgt: string): Promise<string> {
  const res = await fetch(`${CAS_BASE}/${tgt}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `service=${encodeURIComponent(SERVICE_URL)}`,
  });

  const st = await res.text();
  if (!st.startsWith('ST-')) {
    throw new Error(`CAS ST acquisition failed: ${st.slice(0, 80)}`);
  }
  return st.trim();
}

async function validateTicketForSession(st: string): Promise<string[]> {
  const url = `${SERVICE_URL}?ticket=${encodeURIComponent(st)}`;
  const res = await fetch(url, { redirect: 'manual' });

  const setCookies = res.headers.getSetCookie?.() ?? [];
  if (setCookies.length === 0) {
    const raw = res.headers.get('set-cookie');
    if (raw) return [raw];
  }
  return setCookies;
}

async function persistAuthState(
  tgtHash: string,
  expiresAt: Date,
  error: string | null,
): Promise<void> {
  try {
    await pool.query(
      `UPDATE govwin_auth_state
       SET tgt_hash = $1, expires_at = $2, last_refresh_at = NOW(), last_error = $3
       WHERE id = 1`,
      [tgtHash, expiresAt.toISOString(), error],
    );
  } catch (err) {
    logger.warn({ err }, 'govwin_auth_state persist failed');
  }
}

export async function authenticate(): Promise<string[]> {
  if (!casEnabled()) {
    logger.error('govwin_cas_disabled: GOVWIN_AUTH_MODE=oauth2 — CAS session auth is off');
    throw new Error('GovWin CAS auth disabled (GOVWIN_AUTH_MODE=oauth2). Set GOVWIN_AUTH_MODE=cas.');
  }

  if (cached.tgt && cached.cookies.length > 0 && Date.now() < cached.expiresAt) {
    return cached.cookies;
  }

  const { username, password } = getCredentials();

  try {
    const tgt = await obtainTGT(username, password);
    const st = await obtainServiceTicket(tgt);
    const cookies = await validateTicketForSession(st);

    const expiresAt = Date.now() + TGT_TTL_MS;
    cached = { tgt, cookies, expiresAt };

    await persistAuthState(
      hashSecret(tgt),
      new Date(expiresAt),
      null,
    );

    logger.info('govwin_auth_success');
    return cookies;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    cached = { tgt: null, cookies: [], expiresAt: 0 };

    await persistAuthState('', new Date(), message);

    logger.error({ error: message }, 'govwin_auth_failed');
    throw err;
  }
}

export function invalidateAuth(): void {
  cached = { tgt: null, cookies: [], expiresAt: 0 };
}

export async function getAuthHealth(): Promise<{
  token_valid: boolean;
  expires_in_minutes: number;
  last_refresh_at: string | null;
  last_error: string | null;
}> {
  try {
    const { rows } = await pool.query(
      `SELECT tgt_hash, expires_at, last_refresh_at, last_error
       FROM govwin_auth_state WHERE id = 1`,
    );
    const row = rows[0];
    if (!row) {
      return { token_valid: false, expires_in_minutes: 0, last_refresh_at: null, last_error: 'No auth state row' };
    }
    const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
    const valid = !!row.tgt_hash && expiresAt > Date.now();
    const minutesLeft = valid ? Math.round((expiresAt - Date.now()) / 60000) : 0;
    return {
      token_valid: valid,
      expires_in_minutes: minutesLeft,
      last_refresh_at: row.last_refresh_at ? new Date(row.last_refresh_at).toISOString() : null,
      last_error: row.last_error ?? null,
    };
  } catch {
    return { token_valid: false, expires_in_minutes: 0, last_refresh_at: null, last_error: 'DB query failed' };
  }
}
