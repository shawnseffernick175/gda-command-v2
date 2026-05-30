/**
 * R1 source citation types and helpers.
 *
 * Source kind enum per F-207 / product_rules.md:
 *   sam_gov | fpds | usaspending | govwin | govtribe |
 *   news | doctrine | partner_site | internal | manual | n8n_workflow
 */

export const SOURCE_KINDS = [
  'sam_gov',
  'fpds',
  'usaspending',
  'govwin',
  'govtribe',
  'news',
  'doctrine',
  'partner_site',
  'internal',
  'manual',
  'n8n_workflow',
] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number];

export interface SourceRef {
  kind: SourceKind;
  title: string;
  url: string;
  retrieved_at: string;
}

export function makeSourceRef(
  kind: SourceKind,
  title: string,
  url: string,
  retrievedAt?: Date,
): SourceRef {
  return {
    kind,
    title,
    url,
    retrieved_at: (retrievedAt ?? new Date()).toISOString(),
  };
}

export function internalSource(title: string, url: string): SourceRef {
  return makeSourceRef('internal', title, url);
}

/**
 * Resolve source refs for an opportunity field from the join tables.
 * Returns SourceRef[] for a given opportunity_id and field name.
 */
const VALID_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export async function resolveFieldSources(
  pool: { query: (text: string, values: unknown[]) => Promise<{ rows: SourceRow[] }> },
  tableName: string,
  foreignKey: string,
  parentId: string,
): Promise<SourceRef[]> {
  if (!VALID_IDENTIFIER.test(tableName) || !VALID_IDENTIFIER.test(foreignKey)) {
    throw new Error(`Invalid SQL identifier: ${tableName} / ${foreignKey}`);
  }
  const res = await pool.query(
    `SELECT s.kind, s.title, s.url, s.retrieved_at
     FROM "${tableName}" jt
     JOIN sources s ON s.id = jt.source_id
     WHERE jt."${foreignKey}" = $1
     ORDER BY s.retrieved_at DESC`,
    [parentId],
  );
  return res.rows.map((r) => ({
    kind: r.kind as SourceKind,
    title: r.title ?? '',
    url: r.url ?? '',
    retrieved_at: new Date(r.retrieved_at).toISOString(),
  }));
}

interface SourceRow {
  kind: string;
  title: string | null;
  url: string | null;
  retrieved_at: string | Date;
}
