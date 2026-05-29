// ---------------------------------------------------------------------------
// OU Tag — single source of truth for Operating Unit validation + helpers.
// Every future door imports from here.
// ---------------------------------------------------------------------------

import type { Pool } from "pg";

export type OuTag = "envision" | "riverstone" | "pd_systems" | "teaming" | "gda_rollup";

export const OU_TAGS: readonly OuTag[] = Object.freeze([
  "envision",
  "riverstone",
  "pd_systems",
  "teaming",
  "gda_rollup",
] as const);

export function isValidOuTag(value: unknown): value is OuTag {
  return typeof value === "string" && (OU_TAGS as readonly string[]).includes(value);
}

export function defaultOuTag(): OuTag {
  return "envision";
}

export interface OuRegistryRow {
  ou_tag: OuTag;
  display_name: string;
  anchor_company: string;
  is_primary: boolean;
  is_partner: boolean;
  uei: string | null;
  cage: string | null;
  primary_naics: string | null;
  notes: string | null;
  created_at: string;
}

let cachedRegistry: OuRegistryRow[] | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getOuRegistry(pool: Pool): Promise<OuRegistryRow[]> {
  if (cachedRegistry && Date.now() < cacheExpiry) {
    return cachedRegistry;
  }
  const result = await pool.query("SELECT * FROM ou_registry ORDER BY ou_tag");
  cachedRegistry = result.rows as OuRegistryRow[];
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return cachedRegistry;
}

export function requireOuTagColumn(_tableName: string): string {
  return "ou_tag ou_tag NOT NULL DEFAULT 'envision'";
}
