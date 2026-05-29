import { getPool } from "../../lib/db";

export interface StoredSourceRow {
  id: string;
  opportunity_id: string;
  kind: string;
  title: string;
  url: string | null;
  retrieved_at: string | null;
}

/**
 * Fetch all stored sources for an opportunity from the opportunity_sources
 * table (created in migration 129). Returns an empty array if the table
 * does not exist or the query fails.
 */
export async function fetchSourcesForOpportunity(
  oppId: string,
): Promise<StoredSourceRow[]> {
  const pool = getPool();
  if (!pool) return [];

  try {
    const result = await pool.query(
      `SELECT id, opportunity_id, type AS kind, title, url, retrieved_at
       FROM opportunity_sources
       WHERE opportunity_id = $1
       ORDER BY retrieved_at DESC NULLS LAST`,
      [oppId],
    );
    return result.rows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      opportunity_id: String(r.opportunity_id),
      kind: String(r.kind ?? "internal"),
      title: String(r.title ?? ""),
      url: r.url ? String(r.url) : null,
      retrieved_at: r.retrieved_at ? String(r.retrieved_at) : null,
    }));
  } catch {
    // Table may not exist in all environments
    return [];
  }
}
