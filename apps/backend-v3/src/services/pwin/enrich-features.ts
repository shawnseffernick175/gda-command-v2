/**
 * F-451 — Deterministic signal-derivation helper.
 *
 * Pure function (no DB access) that derives pwin signals from opportunity
 * text fields (title, description, agency, naics, psc, set_aside).
 */

import {
  ENVISION_NAICS_LANES,
  ENVISION_KNOWN_CUSTOMERS,
  ENVISION_VEHICLE_KEYWORDS,
  ENVISION_MISSION_KEYWORDS,
  ENVISION_CORE_OFFERINGS,
} from './envision-profile.js';

export interface EnrichmentInput {
  title: string | null;
  description: string | null;
  agency: string | null;
  naics: string | null;
  psc: string | null;
  set_aside: string | null;
  incumbent: string | null;
  incumbent_confidence: string | null;
}

export interface DerivedSignals {
  scope_match_score: number;
  has_vehicle_access: boolean;
  vehicle: string;
  clearance_required: string;
  clearance_fit: boolean;
  doctrine_alignment_score: number;
  is_existing_customer: boolean;
  is_recompete: boolean;
  is_incumbent: boolean;
  exclusion_triggered: boolean;
  exclusion_ids: string[];
  core_offering_match: string[];
}

const ENVISION_IDENTITY_MARKERS = ['envision', 'envision sciences'];

export function deriveSignals(input: EnrichmentInput): DerivedSignals {
  const text = `${input.title ?? ''} ${input.description ?? ''}`.toLowerCase();

  // ── scope_match_score (0–100) ──────────────────────────────────────────
  const allScopeKeywords = [...ENVISION_CORE_OFFERINGS, ...ENVISION_MISSION_KEYWORDS];
  const matchedKeywords = new Set<string>();
  for (const kw of allScopeKeywords) {
    if (text.includes(kw)) {
      matchedKeywords.add(kw);
    }
  }
  const matchCount = matchedKeywords.size;

  let scopeScore: number;
  if (matchCount === 0) scopeScore = 0;
  else if (matchCount === 1) scopeScore = 35;
  else if (matchCount === 2) scopeScore = 55;
  else if (matchCount === 3) scopeScore = 70;
  else if (matchCount === 4) scopeScore = 82;
  else scopeScore = 92;

  // NAICS lane bonus (+10, cap 100); baseline 20 for lane-aligned with no keyword hits
  if (input.naics && ENVISION_NAICS_LANES.includes(input.naics.trim())) {
    if (matchCount === 0) {
      scopeScore = 20;
    } else {
      scopeScore = Math.min(100, scopeScore + 10);
    }
  }

  // ── has_vehicle_access / vehicle ───────────────────────────────────────
  let hasVehicleAccess = false;
  let vehicle = '';
  for (const vk of ENVISION_VEHICLE_KEYWORDS) {
    // Use word-boundary regex to avoid substring false-positives (e.g. 'ces' in 'services')
    const pattern = new RegExp(`\\b${vk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(text)) {
      hasVehicleAccess = true;
      vehicle = vk.toUpperCase();
      break;
    }
  }

  // ── clearance_required / clearance_fit ─────────────────────────────────
  let clearanceRequired = '';
  if (text.includes('ts/sci')) {
    clearanceRequired = 'ts/sci';
  } else if (text.includes('top secret') || /\bts\b/.test(text)) {
    clearanceRequired = 'ts';
  } else if (
    text.includes('secret') ||
    text.includes('clearance') ||
    text.includes('classified')
  ) {
    clearanceRequired = 'secret';
  }

  let clearanceFit = true;
  if (
    clearanceRequired === 'ts/sci' &&
    (text.includes('polygraph') || text.includes('poly'))
  ) {
    clearanceFit = false;
  }

  // ── is_existing_customer ───────────────────────────────────────────────
  const agencyLower = (input.agency ?? '').toLowerCase();
  const isExistingCustomer = ENVISION_KNOWN_CUSTOMERS.some((c) =>
    agencyLower.includes(c),
  );

  // ── is_recompete / is_incumbent ────────────────────────────────────────
  const isRecompete =
    text.includes('recompete') ||
    text.includes('re-compete') ||
    text.includes('follow-on') ||
    text.includes('follow on') ||
    text.includes('bridge contract') ||
    text.includes('currently performed');

  const incumbentVal = (input.incumbent ?? '').toLowerCase().trim();
  const isIncumbent =
    incumbentVal.length > 0 &&
    ENVISION_IDENTITY_MARKERS.some((m) => incumbentVal.includes(m));

  // ── exclusion_triggered / exclusion_ids ────────────────────────────────
  const exclusionIds: string[] = [];

  const isStaffAug =
    text.includes('staff augmentation') ||
    text.includes('body shop') ||
    text.includes('labor hour');
  const hasSolution =
    text.includes('solution') ||
    text.includes('platform') ||
    text.includes('deliverable');
  if (isStaffAug && !hasSolution) {
    exclusionIds.push('staff_aug_only');
  }

  const isCommercialSw =
    text.includes('commercial software') ||
    text.includes('saas') ||
    text.includes('mobile app');
  const hasGovNexus =
    text.includes('fedramp') ||
    text.includes('il4') ||
    text.includes('stig');
  if (isCommercialSw && !hasGovNexus && !input.agency) {
    exclusionIds.push('commercial_software_only');
  }

  const exclusionTriggered = exclusionIds.length > 0;

  // ── core_offering_match ────────────────────────────────────────────────
  const coreOfferingMatch = Array.from(matchedKeywords);

  // ── doctrine_alignment_score (lightweight proxy 0–40) ──────────────────
  let doctrineProxy = 0;
  // Scope contribution: up to 15 points
  if (scopeScore >= 75) doctrineProxy += 15;
  else if (scopeScore >= 45) doctrineProxy += 10;
  else if (scopeScore >= 25) doctrineProxy += 5;

  // Vehicle contribution: up to 8
  if (hasVehicleAccess) doctrineProxy += 8;

  // Customer relationship: up to 8
  if (isExistingCustomer) doctrineProxy += 8;

  // NAICS lane: up to 5
  if (input.naics && ENVISION_NAICS_LANES.includes(input.naics.trim())) {
    doctrineProxy += 5;
  }

  // Clearance fit: up to 4
  if (clearanceFit) doctrineProxy += 4;

  doctrineProxy = Math.min(40, doctrineProxy);

  return {
    scope_match_score: scopeScore,
    has_vehicle_access: hasVehicleAccess,
    vehicle,
    clearance_required: clearanceRequired,
    clearance_fit: clearanceFit,
    doctrine_alignment_score: doctrineProxy,
    is_existing_customer: isExistingCustomer,
    is_recompete: isRecompete,
    is_incumbent: isIncumbent,
    exclusion_triggered: exclusionTriggered,
    exclusion_ids: exclusionIds,
    core_offering_match: coreOfferingMatch,
  };
}
