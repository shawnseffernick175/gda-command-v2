/**
 * Doctrine Fit Badge — deterministic badge computed from doctrine alignment
 * data (F-437). Pure function, no DB access.
 */

// The 8 GDA doctrine principle IDs (verbatim from doctrine_principles table).
const VALID_PRINCIPLE_IDS = new Set([
  'alignment',
  'ethics_always',
  'teamwork',
  'data_first',
  'relentless_execution',
  'relationships',
  'market_mission_brand',
  'customer_facing',
]);

/** Human-readable names keyed by principle id. */
const PRINCIPLE_NAMES: Record<string, string> = {
  alignment: 'Alignment',
  ethics_always: 'Ethics Always',
  teamwork: 'Teamwork',
  data_first: 'Data First, Then Debate',
  relentless_execution: 'Relentless Execution',
  relationships: 'Relationships, Relationships, Relationships',
  market_mission_brand: 'Market, Mission, Brand Focus',
  customer_facing: 'Customer Facing',
};

export type DoctrineFitLabel = 'strong' | 'moderate' | 'weak' | 'none';

export interface DoctrineBadge {
  label: DoctrineFitLabel;
  score: number;
  matchedPrinciples: string[];
  primaryPrinciple: string | null;
  rationale: string;
}

export interface ComputeDoctrineBadgeInput {
  doctrineAlignmentScore?: number | null;
  matchedPrincipleIds?: string[];
  naicsSizeStatus?: 'small' | 'large' | 'unknown';
}

/** Map a raw 0-40 alignment score to a fit label. */
function scoreToLabel(raw: number): DoctrineFitLabel {
  if (raw >= 30) return 'strong';
  if (raw >= 18) return 'moderate';
  if (raw >= 6) return 'weak';
  return 'none';
}

/**
 * Compute a deterministic doctrine-fit badge from available alignment data.
 * Never throws — returns a safe default when inputs are missing.
 */
export function computeDoctrineBadge(input: ComputeDoctrineBadgeInput): DoctrineBadge {
  const raw = input.doctrineAlignmentScore ?? 0;
  const label = scoreToLabel(raw);
  const score = Math.round((raw / 40) * 100);

  const matched = (input.matchedPrincipleIds ?? []).filter((id) =>
    VALID_PRINCIPLE_IDS.has(id),
  );
  const primary = matched[0] ?? null;

  const primaryName = primary ? (PRINCIPLE_NAMES[primary] ?? primary) : null;
  const rationale =
    label === 'none'
      ? 'No doctrine alignment data available'
      : `${label.charAt(0).toUpperCase() + label.slice(1)} doctrine fit (${raw}/40)${primaryName ? `; aligns with ${primaryName}` : ''}`;

  return { label, score, matchedPrinciples: matched, primaryPrinciple: primary, rationale };
}
