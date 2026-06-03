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

const TOKEN_URL = 'https://api.govwin.com/oauth/token';
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

async function persistTokenHash(accessToken: string): Promise<void> {
  try {
    const tokenHash = createHash('sha256').update(accessToken).digest('hex').slice(0, 16);
    await pool.query(
      `INSERT INTO govwin_auth_state (id, token_hash, authenticated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET
         token_hash = $1,
         authenticated_at = NOW()`,
      [tokenHash],
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
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
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
  cached = {
    accessToken: json.access_token,
    expiresAt: Date.now() + expiresInMs - TOKEN_BUFFER_MS,
  };

  await persistTokenHash(json.access_token);
  logger.info(
    { tokenType: json.token_type, expiresIn: json.expires_in },
    'govwin_oauth2_token_acquired',
  );

  return cached.accessToken;
}

export function invalidateOAuth2Token(): void {
  cached = null;
}
