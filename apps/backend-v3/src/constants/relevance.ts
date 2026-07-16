/**
 * Ingest-time relevance evaluator -- single source of truth for whether an
 * opportunity is worth analyzing. Uses ENVISION_NAICS as the primary gate
 * and deadline math for auto-pass.
 */

import { ENVISION_NAICS } from './envision-naics.js';
import { resolveSetAsideEligibility } from '../services/opportunities/eligibility.js';

/** Set-aside codes where Envision is eligible to compete. */
export const ENVISION_SET_ASIDES = new Set([
  'SDB',
  'Small Business',
  'SB',
  'Minority-Owned',
  '8(a)',
]);

/** Minimum days-to-due before auto-pass fires (standing rule). */
export const AUTO_PASS_DAYS_THRESHOLD = 30;

export type RelevanceStatus = 'relevant' | 'off_profile' | 'unknown_naics' | 'auto_pass';

export interface RelevanceResult {
  relevant: boolean;
  reason: string;
  auto_pass: boolean;
  status: RelevanceStatus;
}

const naicsSet = new Set<string>(ENVISION_NAICS);

/**
 * Evaluate whether an opportunity is relevant to Envision.
 *
 * Logic:
 * 1. If naics is null/empty => relevant=false, status='unknown_naics' (route to review).
 * 2. If naics is not in ENVISION_NAICS => relevant=false, status='off_profile'.
 * 3. If the set-aside is one Envision cannot prime (team-only or ineligible)
 *    => auto_pass=true, status='auto_pass'. Envision holds no SBA program certs,
 *    so a WOSB/EDWOSB/8(a)/HUBZone/SDVOSB/VOSB set-aside (team) or an SB set-aside
 *    where Envision is LARGE under the NAICS (ineligible) is not active pipeline work.
 * 4. If days-to-deadline is >= 0 AND < 30, or past due => auto_pass=true, status='auto_pass'.
 * 5. Otherwise => relevant=true, status='relevant'.
 *
 * The set-aside eligibility gate uses the same doctrine resolver as the display
 * label (resolveSetAsideEligibility), so the system no longer surfaces an opp it
 * already knows Envision cannot prime.
 */
export function evaluateRelevance(opp: {
  naics: string | null | undefined;
  set_aside: string | null | undefined;
  response_due_at: string | null | undefined;
  due_date?: string | null | undefined;
}): RelevanceResult {
  const naics = opp.naics?.trim() || null;
  const setAside = opp.set_aside?.trim() || null;
  const dueRaw = opp.response_due_at ?? opp.due_date ?? null;

  // NAICS gate
  if (!naics) {
    return {
      relevant: false,
      reason: 'unknown_naics: no NAICS code provided',
      auto_pass: false,
      status: 'unknown_naics',
    };
  }

  if (!naicsSet.has(naics)) {
    const setAsideNote = setAside
      ? ` (set_aside=${setAside})`
      : '';
    return {
      relevant: false,
      reason: `off_profile: NAICS ${naics} not in Envision registration${setAsideNote}`,
      auto_pass: false,
      status: 'off_profile',
    };
  }

  // Set-aside eligibility gate (only for in-NAICS opps). Auto-pass anything
  // Envision cannot prime: team-only set-asides (no SBA cert) or SB set-asides
  // where Envision is LARGE under the NAICS. Uses the same doctrine resolver
  // that produces the display label so KNOW-and-still-surface can't happen.
  const eligibility = resolveSetAsideEligibility(setAside, naics);
  if (eligibility.status === 'team' || eligibility.status === 'ineligible') {
    return {
      relevant: true,
      reason: `auto_pass: set-aside not prime-able — ${eligibility.rationale}`,
      auto_pass: true,
      status: 'auto_pass',
    };
  }

  // Deadline gate (only for in-NAICS opps)
  if (dueRaw) {
    const dueDate = new Date(dueRaw);
    if (!isNaN(dueDate.getTime())) {
      const now = new Date();
      const msPerDay = 86_400_000;
      const daysRemaining = Math.floor((dueDate.getTime() - now.getTime()) / msPerDay);

      if (daysRemaining < 0) {
        return {
          relevant: true,
          reason: `auto_pass: past due (${Math.abs(daysRemaining)}d overdue)`,
          auto_pass: true,
          status: 'auto_pass',
        };
      }

      if (daysRemaining < AUTO_PASS_DAYS_THRESHOLD) {
        return {
          relevant: true,
          reason: `auto_pass: only ${daysRemaining}d remaining (threshold=${AUTO_PASS_DAYS_THRESHOLD}d)`,
          auto_pass: true,
          status: 'auto_pass',
        };
      }
    }
  }

  // Relevant
  const setAsideFit = setAside && ENVISION_SET_ASIDES.has(setAside)
    ? `; set_aside_fit=${setAside}`
    : '';
  return {
    relevant: true,
    reason: `relevant: NAICS ${naics} in Envision registration${setAsideFit}`,
    auto_pass: false,
    status: 'relevant',
  };
}
