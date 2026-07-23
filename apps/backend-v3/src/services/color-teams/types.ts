/**
 * Color Team Review types.
 *
 * Six colors ship. No Gold. Green is the executive/final pass.
 */

export const COLOR_TEAM_COLORS = ['pink', 'red', 'black', 'blue', 'white', 'green'] as const;
export type ColorTeamColor = (typeof COLOR_TEAM_COLORS)[number];

export const COLOR_TEAM_SEVERITIES = ['info', 'warning', 'critical', 'blocker'] as const;
export type FindingSeverity = (typeof COLOR_TEAM_SEVERITIES)[number];

export const COLOR_TEAM_STATUSES = ['queued', 'running', 'complete', 'error'] as const;
export type ColorTeamRunStatus = (typeof COLOR_TEAM_STATUSES)[number];

export const DOCUMENT_TYPES = [
  'rfp_draft', 'capture_plan', 'white_paper',
  'proposal_section', 'proposal_full', 'unknown',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export interface Citation {
  source: string;
  url: string;
  grade: 'A' | 'B' | 'C';
}

export interface DoctrineScoreRow {
  principle: string;
  score: number;
  detail: string;
}

export interface MarginCheck {
  projected_margin: number;
  floor: number;
  pass: boolean;
  /** R1: where the projected margin and floor came from (e.g. pricing scenario id). */
  source?: string;
}

/** A single sourced quantitative fact used in the green pricing strategy. */
export interface PricingStrategyFact {
  label: string;
  value: string;
  /** R1: authoritative origin of the value (Financial Bible version, scenario id, etc.). */
  source: string;
}

/**
 * Green-team pricing strategy. Distinguishes sourced facts (traceable to the
 * Financial Bible / pricing scenarios) from qualitative recommendations and the
 * concrete inputs still missing. Never contains invented numbers, competitor
 * identities, or pricing claims — recommendations are posture guidance only.
 */
export interface PricingStrategy {
  status: 'available' | 'unavailable';
  sourced_facts: PricingStrategyFact[];
  recommendations: string[];
  missing_inputs: string[];
}

export interface ColorTeamRunRow {
  id: string;
  document_id: string;
  linked_rfp_id: string | null;
  colors: string[];
  status: ColorTeamRunStatus;
  triggered_by: string;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  source_id: string | null;
  created_at: string;
}

export interface ColorTeamFindingRow {
  id: string;
  run_id: string;
  color: ColorTeamColor;
  severity: FindingSeverity;
  section_ref: string | null;
  finding: string;
  recommended_fix: string | null;
  citations: Citation[];
  doctrine_score: DoctrineScoreRow[] | null;
  exclusion_hits: string[] | null;
  margin_check: MarginCheck | null;
  pricing_strategy: PricingStrategy | null;
  action_item_id: string | null;
  created_at: string;
}

export interface DocumentRow {
  id: string;
  filename: string;
  mime_type: string;
  file_size_bytes: number | null;
  doc_type: DocumentType;
  storage_path: string;
  uploaded_by: string;
  opportunity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export function isValidColor(color: string): color is ColorTeamColor {
  return (COLOR_TEAM_COLORS as readonly string[]).includes(color);
}

export function isValidSeverity(sev: string): sev is FindingSeverity {
  return (COLOR_TEAM_SEVERITIES as readonly string[]).includes(sev);
}
