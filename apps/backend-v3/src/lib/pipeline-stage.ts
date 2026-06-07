/**
 * Canonical mapping between UI display labels and pipeline_items.stage DB enum values.
 *
 * Accepts both the frontend label (e.g. "Qualified") and the DB key (e.g. "qualifying"),
 * case-insensitive. Returns the canonical DB key or null for unknown input.
 */

const LABEL_TO_ENUM: Record<string, string> = {
  qualified: 'qualifying',
  interest: 'qualifying',
  capture: 'pursuit',
  proposal: 'proposal',
  submitted: 'submitted',
  evaluation: 'evaluation',
  won: 'won',
  lost: 'lost',
  'no-bid': 'no_bid',
};

const VALID_ENUMS = new Set([
  'qualifying', 'pursuit', 'proposal', 'submitted',
  'evaluation', 'won', 'lost', 'no_bid',
]);

const ENUM_TO_DISPLAY: Record<string, string> = {
  qualifying: 'Interest',
  pursuit: 'Qualified',
  proposal: 'Capture',
  submitted: 'Proposal',
  evaluation: 'Evaluation',
  won: 'Won',
  lost: 'Lost',
  no_bid: 'No-Bid',
};

/**
 * Normalize a pipeline stage value from any recognised label or DB key
 * to the canonical DB enum.  Returns null for unknown input.
 */
export function normalizePipelineStage(input: string): string | null {
  const lower = input.toLowerCase().trim();
  if (VALID_ENUMS.has(lower)) return lower;
  return LABEL_TO_ENUM[lower] ?? null;
}

/**
 * Convert a canonical DB enum to its frontend display label.
 * Falls back to the raw value if no mapping exists.
 */
export function pipelineStageToDisplay(dbEnum: string): string {
  return ENUM_TO_DISPLAY[dbEnum] ?? dbEnum;
}
