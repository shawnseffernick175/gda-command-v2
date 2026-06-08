/**
 * Canonical pipeline stage taxonomy.
 *
 * Single source of truth for the 9-stage pipeline:
 *   interest, qualify, pursue, solicitation, post_submittal,
 *   won, lost, no_bid, gov_cancelled.
 */

/** Ordered canonical DB keys. */
export const CANONICAL_STAGE_KEYS = [
  'interest',
  'qualify',
  'pursue',
  'solicitation',
  'post_submittal',
  'won',
  'lost',
  'no_bid',
  'gov_cancelled',
] as const;

export type CanonicalStageKey = (typeof CANONICAL_STAGE_KEYS)[number];

/** Active (non-terminal) stages. */
export const ACTIVE_STAGE_KEYS: readonly CanonicalStageKey[] = [
  'interest',
  'qualify',
  'pursue',
  'solicitation',
  'post_submittal',
] as const;

const DB_KEY_TO_DISPLAY: Record<CanonicalStageKey, string> = {
  interest: 'Interest',
  qualify: 'Qualify',
  pursue: 'Pursue',
  solicitation: 'Solicitation',
  post_submittal: 'Post-Submittal',
  won: 'Won',
  lost: 'Lost',
  no_bid: 'No Bid',
  gov_cancelled: 'Government Cancelled',
};

const VALID_KEYS = new Set<string>(CANONICAL_STAGE_KEYS);

/**
 * Lookup table: lowercased normalised string -> canonical DB key.
 * Accepts display labels, DB keys, and common aliases.
 * Normalisation strips whitespace, collapses hyphens/underscores/spaces.
 */
const ALIAS_TO_KEY: Record<string, CanonicalStageKey> = {
  interest: 'interest',
  qualify: 'qualify',
  qualified: 'qualify',
  pursue: 'pursue',
  pursuit: 'pursue',
  solicitation: 'solicitation',
  postsubmittal: 'post_submittal',
  submitted: 'post_submittal',
  won: 'won',
  lost: 'lost',
  nobid: 'no_bid',
  no_bid: 'no_bid',
  governmentcancelled: 'gov_cancelled',
  govcancelled: 'gov_cancelled',
  gov_cancelled: 'gov_cancelled',
  cancelled: 'gov_cancelled',
};

function normalise(raw: string): string {
  return raw.toLowerCase().trim().replace(/[\s_-]+/g, '');
}

/**
 * Normalize any recognised stage label or DB key to the canonical DB key.
 * Case-insensitive; treats spaces, hyphens, and underscores as equivalent.
 * Returns null for unknown input.
 */
export function normalizePipelineStage(input: string): CanonicalStageKey | null {
  const n = normalise(input);
  const fromAlias = ALIAS_TO_KEY[n];
  if (fromAlias) return fromAlias;
  if (VALID_KEYS.has(n)) return n as CanonicalStageKey;
  return null;
}

/**
 * Convert a canonical DB key to its display label.
 * Falls back to the raw value if the key is not recognised.
 */
export function pipelineStageToDisplay(dbKey: string): string {
  return DB_KEY_TO_DISPLAY[dbKey as CanonicalStageKey] ?? dbKey;
}
