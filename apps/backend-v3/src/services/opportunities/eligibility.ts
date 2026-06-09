/**
 * Set-aside eligibility resolver -- Envision-only scope.
 *
 * Answers the practical question for each opportunity:
 *   Can Envision PRIME this, only TEAM into it, or neither?
 *
 * Ground truth (SAM.gov entity VNMLXFMQD976 / CAGE 4JB87, validated Jun 2026):
 *   Envision is a Self-Certified Small Disadvantaged Business (SDB),
 *   Black-American-owned / Minority-Owned, For-Profit S-Corp.
 *   Envision holds NO SBA program certifications -- no 8(a), no HUBZone,
 *   no WOSB/EDWOSB, no SDVOSB/VOSB.
 *
 * Implications:
 *   - Prime-able: Full & Open / Unrestricted, and Small Business set-asides
 *     where Envision is SMALL under the solicitation's NAICS size standard.
 *   - Team-only: 8(a), HUBZone, WOSB/EDWOSB, SDVOSB/VOSB set-asides. Envision
 *     cannot prime these; a certified partner unlocks the bid
 *     (HUBZone -> Riverstone, SDVOSB/Veteran -> PD Systems).
 *   - Not eligible: an SB set-aside whose NAICS sizes Envision as LARGE.
 *
 * Note: self-certified SDB is a representation/discriminator, not a standalone
 * set-aside Envision can prime on. There is no generic "SDB set-aside" lane.
 */

import { resolveSizeStatus } from '../pwin/naics-size-standards.js';

export type EligibilityStatus = 'prime' | 'team' | 'ineligible' | 'unrestricted';

export interface SetAsideEligibility {
  status: EligibilityStatus;
  /** Short label for the UI column (e.g. "SB", "8(a)", "HUBZone", "Unrestricted"). */
  label: string;
  /** Partner key that unlocks a team-only set-aside, when applicable. */
  partner: string | null;
  /** Human-readable reason for the resolved status. */
  rationale: string;
}

/**
 * Partner certifications that let Envision team into a set-aside it cannot prime.
 * Keyed by the program; value is the partner display key.
 */
const PARTNER_BY_PROGRAM: Record<string, string> = {
  hubzone: 'riverstone',
  wosb: 'riverstone',
  edwosb: 'riverstone',
  sdvosb: 'pd_systems',
  vosb: 'pd_systems',
  veteran: 'pd_systems',
};

/** Normalize a verbose set-aside string to a compact program tag. */
function classifySetAside(raw: string): {
  tag: string;
  program: 'unrestricted' | 'sb' | '8a' | 'hubzone' | 'wosb' | 'edwosb' | 'sdvosb' | 'vosb' | 'veteran' | 'other';
} {
  const s = raw.toLowerCase();

  // Order matters: most specific socio-economic programs first.
  if (s.includes('service-disabled') || s.includes('sdvosb')) return { tag: 'SDVOSB', program: 'sdvosb' };
  if (s.includes('edwosb')) return { tag: 'EDWOSB', program: 'edwosb' };
  if (s.includes('women') || s.includes('wosb')) return { tag: 'WOSB', program: 'wosb' };
  if (s.includes('8(a)') || s.includes('8a')) return { tag: '8(a)', program: '8a' };
  if (s.includes('hubzone')) return { tag: 'HUBZone', program: 'hubzone' };
  if (s.includes('veteran') || s.includes('vosb')) return { tag: 'VOSB', program: 'vosb' };
  if (s.includes('small business') || s.includes('sba') || /\bsb\b/.test(s)) return { tag: 'SB', program: 'sb' };

  return { tag: raw.length > 14 ? `${raw.slice(0, 13)}.` : raw, program: 'other' };
}

/**
 * Resolve Envision's eligibility for an opportunity given its set-aside string
 * and NAICS code. A null/empty set-aside is treated as unrestricted.
 */
export function resolveSetAsideEligibility(
  setAside: string | null | undefined,
  naics: string | null | undefined,
): SetAsideEligibility {
  const trimmed = (setAside ?? '').trim();

  // Treat empty AND the common "no set-aside" phrasings as full and open.
  // SAM/GovWin frequently store unrestricted as text rather than null.
  const lower = trimmed.toLowerCase();
  const isNoSetAside =
    trimmed === '' ||
    lower === 'n/a' ||
    lower === 'none' ||
    lower.includes('no set aside') ||
    lower.includes('no set-aside') ||
    lower.includes('not a set aside') ||
    lower.includes('not set aside') ||
    lower.includes('unrestricted') ||
    lower.includes('full and open');
  if (isNoSetAside) {
    return {
      status: 'unrestricted',
      label: 'Open',
      partner: null,
      rationale: 'No set-aside; full and open competition.',
    };
  }

  const { tag, program } = classifySetAside(trimmed);

  // Programs Envision cannot prime (no cert) -> team-only via a partner.
  if (program === '8a' || program === 'hubzone' || program === 'wosb' ||
      program === 'edwosb' || program === 'sdvosb' || program === 'vosb' || program === 'veteran') {
    const partner = PARTNER_BY_PROGRAM[program] ?? null;
    if (partner) {
      return {
        status: 'team',
        label: tag,
        partner,
        rationale: `${tag} set-aside; Envision is not ${tag}-certified. ${partner === 'pd_systems' ? 'PD Systems' : 'Riverstone'} unlocks the bid via teaming.`,
      };
    }
    // 8(a) has no current partner in the map -> team candidate without a named partner.
    return {
      status: 'team',
      label: tag,
      partner: null,
      rationale: `${tag} set-aside; Envision is not ${tag}-certified. Teaming with a certified prime is required.`,
    };
  }

  // Small Business set-aside: Envision can prime only if SMALL under this NAICS.
  if (program === 'sb') {
    const size = resolveSizeStatus(naics);
    if (size.status === 'small') {
      return {
        status: 'prime',
        label: 'SB',
        partner: null,
        rationale: `Small Business set-aside; Envision is SMALL under NAICS ${naics ?? '(unknown)'} (${size.rationale}).`,
      };
    }
    if (size.status === 'large') {
      return {
        status: 'ineligible',
        label: 'SB',
        partner: null,
        rationale: `Small Business set-aside but Envision is LARGE under NAICS ${naics ?? '(unknown)'} (${size.rationale}). Prime as a sub via teaming if relevant.`,
      };
    }
    // Unknown size standard: surface as prime-leaning but flagged for review.
    return {
      status: 'prime',
      label: 'SB',
      partner: null,
      rationale: `Small Business set-aside; size status unknown for NAICS ${naics ?? '(none)'} -- verify Envision is small before bidding.`,
    };
  }

  // Unknown / other set-aside type: do not assume prime eligibility.
  return {
    status: 'ineligible',
    label: tag,
    partner: null,
    rationale: `Set-aside "${trimmed}" is not a lane Envision can prime; review for teaming.`,
  };
}
