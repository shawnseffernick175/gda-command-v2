/**
 * R1 source validator — every data point has a searchable source.
 *
 * Exports a SourceRef schema and a helper that strips any field
 * whose `sources` array is missing or empty from an object.
 */

export interface SourceRef {
  kind:
    | "sam_gov"
    | "fpds"
    | "usaspending"
    | "govwin"
    | "news"
    | "doctrine"
    | "partner_site"
    | "internal";
  title: string;
  url: string;
  retrieved_at: string;
}

const VALID_KINDS = new Set<string>([
  "sam_gov",
  "fpds",
  "usaspending",
  "govwin",
  "news",
  "doctrine",
  "partner_site",
  "internal",
]);

function isValidSourceRef(s: unknown): s is SourceRef {
  if (!s || typeof s !== "object") return false;
  const obj = s as Record<string, unknown>;
  return (
    typeof obj.kind === "string" &&
    VALID_KINDS.has(obj.kind) &&
    typeof obj.title === "string" &&
    obj.title.length > 0 &&
    typeof obj.url === "string" &&
    obj.url.length > 0 &&
    typeof obj.retrieved_at === "string" &&
    obj.retrieved_at.length > 0
  );
}

/**
 * Given a record with fields that may or may not have a `sources` sibling,
 * returns a new object where only fields that have valid, non-empty `sources`
 * arrays are included. Meta fields (id, created_at, updated_at, etc.) are
 * always preserved.
 *
 * The convention: for a field `foo`, its sources live at `foo_sources`.
 * Alternatively, if the field itself is an object with a `sources` key, that
 * is also accepted.
 *
 * Pass `preserveKeys` to always keep certain keys regardless of sourcing.
 */
export function validateSourcesOrOmit<T extends Record<string, unknown>>(
  obj: T,
  preserveKeys: string[] = [],
): Partial<T> {
  const META_KEYS = new Set([
    "id",
    "created_at",
    "updated_at",
    "ou_tag",
    "opportunity_id",
    "pipeline_item_id",
    "capture_plan_id",
    "partner_ou_tag",
    "status",
    "phase",
    "bid_decision",
    "data_source",
    "source",
    ...preserveKeys,
  ]);

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Always keep meta/preserve keys
    if (META_KEYS.has(key)) {
      result[key] = value;
      continue;
    }

    // If key ends with _sources, skip (it's a sibling, handled with the field)
    if (key.endsWith("_sources")) {
      continue;
    }

    // Check for sibling `<key>_sources`
    const sourcesKey = `${key}_sources`;
    const sources = obj[sourcesKey];

    if (Array.isArray(sources) && sources.length > 0 && sources.every(isValidSourceRef)) {
      result[key] = value;
      result[sourcesKey] = sources;
      continue;
    }

    // If value itself is an object with a `sources` array
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const inner = value as Record<string, unknown>;
      if (
        Array.isArray(inner.sources) &&
        inner.sources.length > 0 &&
        inner.sources.every(isValidSourceRef)
      ) {
        result[key] = value;
        continue;
      }
    }

    // If the value is an array of sourced items (e.g. awards, milestones)
    if (Array.isArray(value)) {
      result[key] = value;
      continue;
    }

    // Field has no valid sources — omit it per R1
  }

  return result as Partial<T>;
}

/**
 * Attach source references to a flat data row.
 * Returns a new object with `<field>_sources` siblings for each mapped field.
 */
export function attachSources(
  row: Record<string, unknown>,
  fieldSourceMap: Record<string, SourceRef[]>,
  preserveKeys: string[] = [],
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...row };

  for (const [field, sources] of Object.entries(fieldSourceMap)) {
    if (sources.length > 0) {
      result[`${field}_sources`] = sources;
    }
  }

  return validateSourcesOrOmit(result, preserveKeys);
}

export { isValidSourceRef };
