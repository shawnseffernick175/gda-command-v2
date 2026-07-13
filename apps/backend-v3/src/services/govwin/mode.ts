/**
 * GovWin authentication mode.
 *
 * P0 (#1099): CAS session-cookie auth is the DEFAULT because the account lacks
 * the Deltek OAuth2 Web Services tier (oauth2 returns 401 invalid_client).
 * Set GOVWIN_AUTH_MODE=oauth2 to flip back if/when the real OAuth2 tier is
 * provisioned.
 */

export type GovWinAuthMode = 'cas' | 'oauth2';

export function getGovWinAuthMode(): GovWinAuthMode {
  return process.env['GOVWIN_AUTH_MODE']?.toLowerCase() === 'oauth2' ? 'oauth2' : 'cas';
}

export function isCasMode(): boolean {
  return getGovWinAuthMode() === 'cas';
}
