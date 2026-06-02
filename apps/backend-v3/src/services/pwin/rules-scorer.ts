/**
 * V1 Rules-based PWin scorer — deterministic, fully transparent.
 */

import type { PwinFeatures, RuleContribution, PwinScoreResult } from './types.js';
import { resolveSizeStatus } from './naics-size-standards.js';

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function scoreV1Rules(features: PwinFeatures, modelVersion: string): PwinScoreResult {
  const contributions: RuleContribution[] = [];

  const base = 30;
  contributions.push({ name: 'base', value: base, description: 'Base score' });

  const incumbencyBonus = features.is_incumbent ? 30 : 0;
  if (incumbencyBonus > 0) {
    contributions.push({ name: 'incumbency_bonus', value: incumbencyBonus, description: '+30 incumbency' });
  }

  const capabilityMatch = Math.round(features.scope_match_score * 0.3 * 100) / 100;
  if (capabilityMatch !== 0) {
    contributions.push({
      name: 'capability_match',
      value: capabilityMatch,
      description: `+${capabilityMatch.toFixed(1)} capability match (scope ${features.scope_match_score}%)`,
    });
  }

  const vehicleAccess = features.has_vehicle_access ? 10 : -15;
  contributions.push({
    name: 'vehicle_access',
    value: vehicleAccess,
    description: features.has_vehicle_access
      ? '+10 vehicle access'
      : '-15 no vehicle access',
  });

  const clearanceFit = features.clearance_fit ? 5 : -10;
  contributions.push({
    name: 'clearance_fit',
    value: clearanceFit,
    description: features.clearance_fit
      ? '+5 clearance fit'
      : '-10 clearance gap',
  });

  const doctrineBonus = Math.round((features.doctrine_alignment_score / 40) * 10 * 100) / 100;
  contributions.push({
    name: 'doctrine_bonus',
    value: doctrineBonus,
    description: `+${doctrineBonus.toFixed(1)} doctrine alignment (${features.doctrine_alignment_score}/40)`,
  });

  const marginPenalty = features.below_margin_floor ? -20 : 0;
  if (marginPenalty !== 0) {
    contributions.push({
      name: 'margin_penalty',
      value: marginPenalty,
      description: '-20 below margin floor',
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

  let teamingBonus = 0;
  if (features.needs_teaming_partner) {
    if (features.candidate_partners.length >= 1) {
      teamingBonus = 5;
      contributions.push({
        name: 'teaming_bonus',
        value: 5,
        description: `+5 teaming partner identified (${features.candidate_partners.length} candidate(s))`,
      });
    } else {
      teamingBonus = -10;
      contributions.push({
        name: 'teaming_penalty',
        value: -10,
        description: '-10 needs teaming partner, none identified',
      });
    }
  }

  // NAICS size-status contribution
  const sizeStatus = resolveSizeStatus(features.naics);
  let naicsSizeContribution = 0;
  if (sizeStatus.status === 'small') {
    naicsSizeContribution = 20;
    contributions.push({
      name: 'naics_size',
      value: 20,
      description: `+20 small-business eligible (${features.naics}: ${sizeStatus.rationale})`,
    });
  } else if (sizeStatus.status === 'large') {
    naicsSizeContribution = -15;
    contributions.push({
      name: 'naics_size',
      value: -15,
      description: `-15 large-business only (${features.naics}: ${sizeStatus.rationale})`,
    });
  } else {
    contributions.push({
      name: 'naics_size',
      value: 0,
      description: '0 NAICS size status unknown',
    });
  }

  const rawScore = features.exclusion_triggered
    ? 0
    : base + incumbencyBonus + capabilityMatch + vehicleAccess + clearanceFit
      + doctrineBonus + marginPenalty + teamingBonus + naicsSizeContribution;

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
