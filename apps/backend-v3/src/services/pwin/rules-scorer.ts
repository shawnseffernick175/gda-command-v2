/**
 * V1 Rules-based PWin scorer — deterministic, fully transparent.
 */

import type { PwinFeatures, RuleContribution, PwinScoreResult } from './types.js';
import { resolveSizeStatus } from './naics-size-standards.js';
import type { PwinWeights } from './pwin-weights.js';

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

const SET_ASIDE_PATTERNS = [
  'small business', 'set-aside', 'set aside', 'sdvosb', 'service-disabled',
  '8(a)', '8a', 'wosb', 'women-owned', 'hubzone', 'edwosb', 'isbee', 'buy indian',
];

const SET_ASIDE_EXCLUSIONS = ['no set aside', 'no set-aside'];

function isSmallBusinessSetAside(setAside: string | null): boolean {
  if (!setAside) return false;
  const lower = setAside.toLowerCase();
  if (SET_ASIDE_EXCLUSIONS.some((ex) => lower.includes(ex))) return false;
  return SET_ASIDE_PATTERNS.some((p) => lower.includes(p));
}

export function scoreV1Rules(
  features: PwinFeatures,
  modelVersion: string,
  weights?: PwinWeights,
): PwinScoreResult {
  const contributions: RuleContribution[] = [];
  const w = weights ?? {};

  const base = w.base ?? 30;
  contributions.push({ name: 'base', value: base, description: 'Base score' });

  const incumbencyBonus = features.is_incumbent ? (w.incumbency_bonus ?? 30) : 0;
  if (incumbencyBonus > 0) {
    contributions.push({ name: 'incumbency_bonus', value: incumbencyBonus, description: `+${incumbencyBonus} incumbency` });
  }

  const recompeteBonusVal = w.recompete_bonus ?? 8;
  const recompeteBonus = features.is_recompete ? recompeteBonusVal : 0;
  if (recompeteBonus > 0) {
    contributions.push({ name: 'recompete', value: recompeteBonusVal, description: `+${recompeteBonusVal} recompete (known requirement, displacement target)` });
  }

  const capMultiplier = w.capability_match_multiplier ?? 0.3;
  const capabilityMatch = Math.round(features.scope_match_score * capMultiplier * 100) / 100;
  if (capabilityMatch !== 0) {
    contributions.push({
      name: 'capability_match',
      value: capabilityMatch,
      description: `+${capabilityMatch.toFixed(1)} capability match (scope ${features.scope_match_score}%)`,
    });
  }

  const vehicleAccessVal = w.vehicle_access ?? 10;
  const vehicleAccess = features.has_vehicle_access ? vehicleAccessVal : 0;
  contributions.push({
    name: 'vehicle_access',
    value: vehicleAccess,
    description: features.has_vehicle_access
      ? `+${vehicleAccessVal} vehicle access`
      : '0 vehicle access not indicated',
  });

  const clearanceFitVal = w.clearance_fit ?? 5;
  const clearanceFit = features.clearance_fit ? clearanceFitVal : 0;
  contributions.push({
    name: 'clearance_fit',
    value: clearanceFit,
    description: features.clearance_fit
      ? `+${clearanceFitVal} clearance fit`
      : '0 clearance not indicated',
  });

  const doctrineBonusMax = w.doctrine_bonus_max ?? 10;
  const doctrineBonus = Math.round((features.doctrine_alignment_score / 40) * doctrineBonusMax * 100) / 100;
  contributions.push({
    name: 'doctrine_bonus',
    value: doctrineBonus,
    description: `+${doctrineBonus.toFixed(1)} doctrine alignment (${features.doctrine_alignment_score}/40)`,
  });

  const marginPenaltyVal = w.margin_penalty ?? -20;
  const marginPenalty = features.below_margin_floor ? marginPenaltyVal : 0;
  if (marginPenalty !== 0) {
    contributions.push({
      name: 'margin_penalty',
      value: marginPenaltyVal,
      description: `${marginPenaltyVal} below margin floor`,
    });
  }

  let exclusionKill = 0;
  if (features.exclusion_triggered) {
    exclusionKill = -999;
    contributions.push({
      name: 'exclusion_kill',
      value: 0,
      description: 'Exclusion triggered — score clamped to 0',
    });
  }

  const teamingBonusVal = w.teaming_bonus ?? 5;
  const teamingPenaltyVal = w.teaming_penalty ?? -10;
  let teamingBonus = 0;
  if (features.needs_teaming_partner) {
    if (features.candidate_partners.length >= 1) {
      teamingBonus = teamingBonusVal;
      contributions.push({
        name: 'teaming_bonus',
        value: teamingBonusVal,
        description: `+${teamingBonusVal} teaming partner identified (${features.candidate_partners.length} candidate(s))`,
      });
    } else {
      teamingBonus = teamingPenaltyVal;
      contributions.push({
        name: 'teaming_penalty',
        value: teamingPenaltyVal,
        description: `${teamingPenaltyVal} needs teaming partner, none identified`,
      });
    }
  }

  // NAICS size-status contribution (F-451.3: neutralize large penalty, gate small bonus on set-aside)
  const sizeStatus = resolveSizeStatus(features.naics);
  const naicsSmallSetasideVal = w.naics_small_setaside ?? 20;
  const naicsSmallFullopenVal = w.naics_small_fullopen ?? 10;
  let naicsSizeContribution = 0;
  if (sizeStatus.status === 'small') {
    const hasSetAside = isSmallBusinessSetAside(features.set_aside);
    if (hasSetAside) {
      naicsSizeContribution = naicsSmallSetasideVal;
      contributions.push({
        name: 'naics_size',
        value: naicsSmallSetasideVal,
        description: `+${naicsSmallSetasideVal} small-business set-aside advantage (${features.naics}: ${sizeStatus.rationale})`,
      });
    } else {
      naicsSizeContribution = naicsSmallFullopenVal;
      contributions.push({
        name: 'naics_size',
        value: naicsSmallFullopenVal,
        description: `+${naicsSmallFullopenVal} small-business eligible, full-and-open (${features.naics}: ${sizeStatus.rationale})`,
      });
    }
  } else if (sizeStatus.status === 'large') {
    naicsSizeContribution = 0;
    contributions.push({
      name: 'naics_size',
      value: 0,
      description: `0 large-business, full-and-open (${features.naics}: ${sizeStatus.rationale})`,
    });
  } else {
    contributions.push({
      name: 'naics_size',
      value: 0,
      description: '0 NAICS size status unknown',
    });
  }

  // Existing-customer contribution (F-451.3)
  const existingCustomerVal = w.existing_customer ?? 5;
  const existingCustomerContribution = features.is_existing_customer ? existingCustomerVal : 0;
  if (existingCustomerContribution > 0) {
    contributions.push({
      name: 'existing_customer',
      value: existingCustomerVal,
      description: `+${existingCustomerVal} existing customer relationship`,
    });
  }

  const rawScore = features.exclusion_triggered
    ? 0
    : base + incumbencyBonus + recompeteBonus + capabilityMatch + vehicleAccess + clearanceFit
      + doctrineBonus + marginPenalty + teamingBonus + naicsSizeContribution
      + existingCustomerContribution;

  const score = clamp(Math.round(rawScore), 0, 100);

  const topDrivers = contributions
    .filter((c) => c.name !== 'base' && c.value !== 0)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 5)
    .map((c) => c.description);

  return {
    score,
    model_version: modelVersion,
    feature_weights: contributions,
    top_drivers: topDrivers,
    confidence: null,
    candidate_partners: features.candidate_partners ?? [],
    named_competitors_count: features.named_competitors_count ?? 0,
  };
}
