/**
 * F-450 / F-451 — Feature-extraction layer.
 *
 * Maps an opportunity DB row → PwinFeatures for the V1 rules scorer.
 * Pure function — no DB access.
 */

import type { PwinFeatures } from './types.js';
import { deriveSignals, type EnrichmentInput } from './enrich-features.js';

/** Minimal typed shape of the opportunity columns used for feature extraction. */
export interface OpportunityRow {
  naics: string | null;
  agency: string | null;
  set_aside: string | null;
  value_min: number | null;
  value_max: number | null;
  response_due_at: string | Date | null;
  posted_at: string | Date | null;
  incumbent: string | null;
  incumbent_confidence: string | null;
  solicitation_number: string | null;
  title: string | null;
  description: string | null;
  psc: string | null;
}

/**
 * Set-aside teaming mapping.
 *
 * Envision cannot directly claim certain set-asides; these map to
 * needs_teaming_partner = true so the scorer applies the teaming penalty
 * (no partners → −10) while keeping every opportunity visible.
 *
 * NEEDS TEAMING (Envision cannot directly claim):
 *   - "8(a)" / "8(a) Sole Source"
 *   - "HUBZone" / "HUBZone Sole Source"
 *   - "WOSB" / "Women-Owned Small Business"
 *   - "EDWOSB" / "Economically Disadvantaged Women-Owned Small Business"
 *   - "SDVOSB" / "Service-Disabled Veteran-Owned Small Business"
 *   - "VOSB" / "Veteran-Owned Small Business"
 *
 * NO TEAMING NEEDED:
 *   - "Total Small Business Set-Aside" / "SBA" / "Small Business" / "SB"
 *   - "No set aside used" / "" / null
 *   - Any unrecognized value defaults to no teaming needed
 */
const TEAMING_REQUIRED_PATTERNS = [
  '8(a)',
  'hubzone',
  'wosb',
  'edwosb',
  'sdvosb',
  'vosb',
  'women-owned',
  'economically disadvantaged',
  'service-disabled veteran',
  'veteran-owned',
];

function requiresTeaming(setAside: string | null): boolean {
  if (!setAside) return false;
  const lower = setAside.toLowerCase();
  return TEAMING_REQUIRED_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Extract PwinFeatures from an opportunity row.
 * @param row  — opportunity columns
 * @param now  — injectable "now" for deterministic testing (defaults to new Date())
 */
export function extractFeaturesFromOpportunity(
  row: OpportunityRow,
  now: Date = new Date(),
): PwinFeatures {
  // ceiling_value_m — DB stores value as numeric dollars; convert to millions
  const rawValue = row.value_max ?? row.value_min ?? null;
  const ceilingValueM = rawValue != null ? rawValue / 1_000_000 : 0;

  // days_to_proposal_due — whole days from response_due_at − now; 0 if null
  let daysToProposalDue = 0;
  if (row.response_due_at) {
    const due = new Date(row.response_due_at);
    daysToProposalDue = Math.floor(
      (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  const needsTeaming = requiresTeaming(row.set_aside);

  // F-451: derive real signals from text fields
  const enrichInput: EnrichmentInput = {
    title: row.title,
    description: row.description,
    agency: row.agency,
    naics: row.naics,
    psc: row.psc,
    set_aside: row.set_aside,
    incumbent: row.incumbent,
    incumbent_confidence: row.incumbent_confidence,
  };
  const signals = deriveSignals(enrichInput);

  return {
    naics: row.naics ?? '',
    agency: row.agency ?? '',
    sub_agency: '',
    ceiling_value_m: ceilingValueM,
    is_incumbent: signals.is_incumbent,
    incumbent_competitor: signals.incumbent_competitor,
    is_recompete: signals.is_recompete,
    scope_match_score: signals.scope_match_score,
    days_to_proposal_due: daysToProposalDue,
    days_to_rfp_release: 0,
    is_under_continuing_resolution: false,
    core_offering_match: signals.core_offering_match,
    has_vehicle_access: signals.has_vehicle_access,
    vehicle: signals.vehicle,
    vehicle_set_aside: '',
    clearance_required: signals.clearance_required,
    clearance_fit: signals.clearance_fit,
    doctrine_alignment_score: signals.doctrine_alignment_score,
    exclusion_triggered: signals.exclusion_triggered,
    exclusion_ids: signals.exclusion_ids,
    expected_margin_pct: 0,
    below_margin_floor: false,
    needs_teaming_partner: needsTeaming,
    candidate_partners: [],
    is_existing_customer: signals.is_existing_customer,
    named_competitors_count: 0,
    competitor_incumbency_rate: 0,
    similar_awards_count: 0,
    avg_similar_award_value_m: 0,
    set_aside: row.set_aside ?? null,
  };
}
