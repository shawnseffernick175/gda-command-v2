/**
 * Envision NAICS Codes — Targeted Pursuit Profile
 * Source of truth: envision-is.com Capability Statement (January 2026)
 *   https://envision-is.com/wp-content/uploads/2026/01/New-Marketing-Slick-Digital-Format.pdf
 * Cross-checked against SAM.gov entity VNMLXFMQD976 / CAGE 4JB87 (June 2026 pull).
 * Updated: 2026-06-10
 *
 * These codes drive opportunity filtering, award ingestion, pWin scoring,
 * competitor classification, and AI prompt context across the entire platform.
 *
 * The 17 codes below are exactly what Envision publishes on its public
 * capability statement. The two GSA MAS SINs (54151S, 54151HACS) are
 * preserved separately because SAM.gov tags some opportunities under the
 * GSA SIN string rather than a 6-digit NAICS.
 */

export const ENVISION_NAICS = [
  '488111',    // Air Traffic Control
  '513210',    // Software Publishers
  '541310',    // Architectural Services
  '541330',    // Engineering Services (primary)
  '541511',    // Custom Computer Programming Services
  '541512',    // Computer Systems Design Services
  '541513',    // Computer Facilities Management Services
  '541519',    // Other Computer Related Services / IT VAR
  '541611',    // Administrative Management & General Management Consulting
  '541618',    // Other Management Consulting Services
  '541690',    // Other Scientific and Technical Consulting Services
  '541715',    // R&D in Physical, Engineering, and Life Sciences
  '541990',    // All Other Professional, Scientific, and Technical Services
  '561110',    // Office Administrative Services
  '611430',    // Professional and Management Development Training
  '611512',    // Flight Training
  '54151S',    // IT Professional Services (GSA MAS SIN — preserved per business direction)
  '54151HACS', // Highly Adaptive Cybersecurity Services (GSA MAS SIN — preserved per business direction)
] as const;

export type EnvisionNaicsCode = typeof ENVISION_NAICS[number];

/**
 * Primary competitive NAICS lanes. Per current direction this mirrors the full
 * pursuit profile above.
 */
export const ENVISION_PRIMARY_NAICS = [
  '488111',
  '513210',
  '541310',
  '541330',
  '541511',
  '541512',
  '541513',
  '541519',
  '541611',
  '541618',
  '541690',
  '541715',
  '541990',
  '561110',
  '611430',
  '611512',
  '54151S',
  '54151HACS',
] as const;

/** String used in AI prompts — top relevant codes */
export const ENVISION_NAICS_PROMPT_SUMMARY =
  'NAICS 541330 (Engineering — primary), 541511/541512/541513/541519 (Computer Services), ' +
  '513210 (Software Publishers), 541611/541618 (Management Consulting), 541690 (Scientific/Technical Consulting), ' +
  '541715 (R&D Physical/Engineering/Life Sciences), 541990 (Other Professional/Technical Services), ' +
  '541310 (Architectural Services), 488111 (Air Traffic Control), 561110 (Office Admin), ' +
  '611430/611512 (Training and Flight Training), GSA MAS 54151S (IT Professional Services), ' +
  '54151HACS (Highly Adaptive Cybersecurity)';

/**
 * Envision company context string for AI prompts.
 * Set-aside status validated against SAM.gov entity VNMLXFMQD976 / CAGE 4JB87
 * (Jun 2026): Self-Certified Small Disadvantaged Business, Black-American-owned /
 * Minority-Owned, For-Profit S-Corp. NO SBA program certs (no 8(a), HUBZone,
 * WOSB, or SDVOSB). SDVOSB/HUBZone access is via teaming partners only
 * (PD Systems = SDVOSB/Veteran, Riverstone = HUBZone), not Envision itself.
 */
export const ENVISION_COMPANY_CONTEXT =
  'Envision is a Small Disadvantaged Business (self-certified SDB), Black-American-owned ' +
  'and Minority-Owned small business competing for federal defense and civilian contracts ' +
  'across engineering services, IT/software development, scientific and management consulting, R&D, ' +
  'training, and professional services. Envision holds no SBA program set-aside certifications ' +
  '(no 8(a), HUBZone, WOSB, or SDVOSB); it primes full-and-open and small-business set-asides ' +
  'where it qualifies as small, and teams with certified partners (PD Systems for SDVOSB/Veteran, ' +
  'Riverstone for HUBZone) on those set-asides. Contract vehicles include GSA MAS ' +
  '(IT Professional Services 54151S, Highly Adaptive Cybersecurity 54151HACS). ' +
  'Primary customers: DoD, Army, Navy, DHS, FAA, GSA. Based in the DC metro area.';
