/**
 * Deterministic opportunity vehicle classifier (report item 1).
 *
 * Categorizes an opportunity as a Broad Agency Announcement (BAA), Other
 * Transaction (OTA), or Indefinite Delivery / Indefinite Quantity (IDIQ) —
 * otherwise 'standard'.
 *
 * CONSERVATIVE BY DESIGN. SAM's noticeType does NOT distinguish BAA/OTA (it only
 * carries sources_sought / presolicitation / solicitation / award_notice / …),
 * so classification relies on explicit, distinctive phrases in the authoritative
 * title/description plus the existing $1-placeholder IDIQ flag. Anything without
 * a strong signal stays 'standard' — never mislabeled. Every classified row
 * carries a human-readable source string for R1 lineage.
 *
 * The SQL predicates below MUST mirror the JS matchers so server-side filtering
 * and displayed badges agree on the same rows.
 */

export type OpportunityClass = 'baa' | 'ota' | 'idiq' | 'standard';

/** Distinctive phrase for a Broad Agency Announcement. */
const BAA_RE = /broad\s+agency\s+announcement/i;

/**
 * Other Transaction (Authority/Agreement). The full "other transaction(s)"
 * phrase is specific to OTAs in federal contracting; the bare "OTA" acronym is
 * too ambiguous, so it is intentionally NOT matched.
 */
const OTA_RE = /other\s+transactions?/i;

/** IDIQ named explicitly in the text (complements the $1-placeholder flag). */
const IDIQ_TEXT_RE = /indefinite\s+delivery|\bid\/?iq\b/i;

export interface VehicleClassInput {
  title: string | null | undefined;
  description: string | null | undefined;
  is_idiq: boolean | null | undefined;
}

export interface VehicleClassResult {
  class: OpportunityClass;
  /** R1 lineage: why the row was classified, or null when 'standard'. */
  source: string | null;
}

/**
 * Classify a single opportunity. Precedence: BAA > OTA > IDIQ > standard.
 * BAA and OTA are explicit solicitation/agreement mechanisms; when one is named
 * outright it is the most informative label. IDIQ is a contract vehicle and is
 * treated as the fallback categorization.
 */
export function classifyOpportunityVehicle(input: VehicleClassInput): VehicleClassResult {
  const haystack = `${input.title ?? ''}\n${input.description ?? ''}`;

  if (BAA_RE.test(haystack)) {
    return { class: 'baa', source: "Classified from title/description containing 'Broad Agency Announcement'" };
  }
  if (OTA_RE.test(haystack)) {
    return { class: 'ota', source: "Classified from title/description containing 'Other Transaction'" };
  }
  if (input.is_idiq === true) {
    return { class: 'idiq', source: 'Classified IDIQ from SAM $1-ceiling placeholder (is_idiq)' };
  }
  if (IDIQ_TEXT_RE.test(haystack)) {
    return { class: 'idiq', source: "Classified from title/description naming 'Indefinite Delivery / Indefinite Quantity'" };
  }
  return { class: 'standard', source: null };
}

// ── SQL predicates (mirror of the matchers above) ────────────────────────────
// Constant literals only (no user input), safe to inline. `o` is the
// opportunities table alias used by the list query builders.

const SQL_BAA = `(o.title ILIKE '%broad agency announcement%' OR o.description ILIKE '%broad agency announcement%')`;
const SQL_OTA = `(o.title ILIKE '%other transaction%' OR o.description ILIKE '%other transaction%')`;
const SQL_IDIQ = `(o.is_idiq = TRUE OR o.title ILIKE '%idiq%' OR o.description ILIKE '%idiq%' OR o.title ILIKE '%id/iq%' OR o.description ILIKE '%id/iq%' OR o.title ILIKE '%indefinite delivery%' OR o.description ILIKE '%indefinite delivery%')`;

/**
 * SQL condition isolating a single class, honoring the same precedence as
 * {@link classifyOpportunityVehicle} so "OTA-only" excludes rows that are
 * actually BAAs, etc.
 */
export function vehicleClassSqlCondition(cls: OpportunityClass): string | null {
  switch (cls) {
    case 'baa':
      return SQL_BAA;
    case 'ota':
      return `(${SQL_OTA} AND NOT ${SQL_BAA})`;
    case 'idiq':
      return `(${SQL_IDIQ} AND NOT ${SQL_BAA} AND NOT ${SQL_OTA})`;
    case 'standard':
      return `(NOT ${SQL_BAA} AND NOT ${SQL_OTA} AND NOT ${SQL_IDIQ})`;
    default:
      return null;
  }
}

/** Parse a raw filter value into a known class, or null if unrecognized. */
export function parseOpportunityClass(raw: string | undefined | null): OpportunityClass | null {
  if (raw === 'baa' || raw === 'ota' || raw === 'idiq' || raw === 'standard') return raw;
  return null;
}
