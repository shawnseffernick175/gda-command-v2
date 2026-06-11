/**
 * resolveOpportunityId
 *
 * Architecture note: opportunities.id (bigint) is the write-authoritative primary key.
 * unified_opportunities.internal_id (uuid) is a read-only canonical view key.
 * Some frontend pages (Pipeline, Launchpad, Capture) navigate with internal_id.
 * This helper resolves either form to a bigint id string so the legacy detail
 * routes continue to work without migrating any page to the unified endpoint.
 *
 * Returns a string (not a number) to avoid precision loss for bigint IDs that
 * exceed Number.MAX_SAFE_INTEGER.
 *
 * Resolution rules:
 *  - /^\d+$/ → return as-is (current behavior, unchanged)
 *  - UUID regex → look up opportunity_id in unified_opportunity_links, return as string
 *  - anything else → return null (caller should return 400)
 */

import pg from 'pg';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export { UUID_RE };

export async function resolveOpportunityId(
  pool: pg.Pool,
  idParam: string,
): Promise<string | null> {
  // Rule 1: plain bigint string — return as-is (no numeric conversion)
  if (/^\d+$/.test(idParam)) {
    return idParam;
  }

  // Rule 2: UUID → resolve via unified_opportunity_links
  if (UUID_RE.test(idParam)) {
    const result = await pool.query(
      'SELECT opportunity_id FROM unified_opportunity_links WHERE internal_id = $1 LIMIT 1',
      [idParam],
    );
    if (result.rows.length === 0) return null;
    return String(result.rows[0].opportunity_id);
  }

  // Rule 3: neither → invalid format
  return null;
}
