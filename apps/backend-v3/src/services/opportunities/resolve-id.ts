/**
 * resolveOpportunityId
 *
 * Architecture note: opportunities.id (bigint) is the write-authoritative primary key.
 * unified_opportunities.internal_id (uuid) is a read-only canonical view key.
 * Some frontend pages (Pipeline, Launchpad, Capture) navigate with internal_id.
 * This helper resolves either form to a bigint id so the legacy detail routes
 * continue to work without migrating any page to the unified endpoint.
 *
 * Resolution rules:
 *  - /^\d+$/ → parse as bigint, return directly (current behavior, unchanged)
 *  - UUID regex → look up opportunity_id in unified_opportunity_links, return bigint
 *  - anything else → return null (caller should return 400)
 */

import pg from 'pg';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export { UUID_RE };

export async function resolveOpportunityId(
  pool: pg.Pool,
  idParam: string,
): Promise<number | null> {
  // Rule 1: plain bigint string
  if (/^\d+$/.test(idParam)) {
    return parseInt(idParam, 10);
  }

  // Rule 2: UUID → resolve via unified_opportunity_links
  if (UUID_RE.test(idParam)) {
    const result = await pool.query(
      'SELECT opportunity_id FROM unified_opportunity_links WHERE internal_id = $1 LIMIT 1',
      [idParam],
    );
    if (result.rows.length === 0) return null;
    return result.rows[0].opportunity_id as number;
  }

  // Rule 3: neither → invalid format
  return null;
}
