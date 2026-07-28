/**
 * GovWin IQ Web Services API — OAuth2 client-credentials authentication.
 *
 * F-332: Replaces the CAS personal-login path with the official API.
 * Uses GOVWIN_CLIENT_ID + GOVWIN_CLIENT_SECRET (already provisioned).
 *
 * Token is cached in memory with a 60s buffer before expiry.
 * Token hash is persisted to govwin_auth_state for observability.
 */

import { createHash } from 'node:crypto';
import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { envStr } from '../../lib/env.js';

const TOKEN_URL = envStr('GOVWIN_TOKEN_URL', 'https://services.govwin.com/neo-ws/oauth/token');
const TOKEN_BUFFER_MS = 60_000; // refresh 60s before expiry

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let cached: TokenCache | null = null;

function getClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env['GOVWIN_CLIENT_ID'];
  const clientSecret = process.env['GOVWIN_CLIENT_SECRET'];
  if (!clientId || !clientSecret) {
    throw new Error(
      'GOVWIN_CLIENT_ID and GOVWIN_CLIENT_SECRET must be set for OAuth2 API access',
    );
  }
  return { clientId, clientSecret };
}

async function persistTokenHash(accessToken: string, expiresAt: Date): Promise<void> {
  try {
    const tokenHash = createHash('sha256').update(accessToken).digest('hex').slice(0, 16);
    await pool.query(
      `INSERT INTO govwin_auth_state (id, tgt_hash, expires_at, last_refresh_at, last_error)
       VALUES (1, $1, $2, NOW(), NULL)
       ON CONFLICT (id) DO UPDATE SET
         tgt_hash = $1,
         expires_at = $2,
         last_refresh_at = NOW(),
         last_error = NULL`,
      [tokenHash, expiresAt.toISOString()],
    );
  } catch (err) {
    logger.warn({ err }, 'govwin_oauth2_persist_token_hash_failed');
  }
}

/**
 * Get a valid OAuth2 Bearer token, refreshing if needed.
 * Never throws on transient errors — returns cached token if available.
 */
export async function getAccessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) {
    return cached.accessToken;
  }

  const { clientId, clientSecret } = getClientCredentials();

  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: clientId,
    client_secret: clientSecret,
    username: process.env['GOVWIN_USERNAME'] ?? '',
    password: process.env['GOVWIN_PASSWORD'] ?? '',
    scope: 'read',
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GovWin OAuth2 token request failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in?: number;
    token_type?: string;
  };

  if (!json.access_token) {
    throw new Error('GovWin OAuth2: no access_token in response');
  }

  const expiresInMs = (json.expires_in ?? 3600) * 1000;
  const now = Date.now();
  cached = {
    accessToken: json.access_token,
    expiresAt: now + expiresInMs - TOKEN_BUFFER_MS,
  };

  // Persist the token's true expiry (without the in-memory refresh buffer) so
  // the health endpoint reports the real remaining lifetime instead of a stale
  // value left over from the CAS path.
  await persistTokenHash(json.access_token, new Date(now + expiresInMs));
  logger.info(
    { tokenType: json.token_type, expiresIn: json.expires_in },
    'govwin_oauth2_token_acquired',
  );

  return cached.accessToken;
}

export function invalidateOAuth2Token(): void {
  cached = null;
}
