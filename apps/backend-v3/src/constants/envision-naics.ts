/**
 * Envision NAICS Codes -- Targeted Pursuit Profile
 * Source: SAM.gov entity VNMLXFMQD976 / CAGE 4JB87
 * Updated: June 2026
 *
 * These codes drive opportunity filtering, award ingestion, pWin scoring,
 * competitor classification, and AI prompt context across the entire platform.
 *
 * Curated to Envision's active pursuit lanes (engineering, IT/software, R&D,
 * data/hosting, management consulting) plus GSA MAS SINs (54151S, 54151HACS).
 * Software Publishers carries both the 2017 (511210) and 2022 (513210) codes
 * so opportunities tagged under either revision are caught.
 */

export const ENVISION_NAICS = [
  '541330',    // Engineering Services
  '541512',    // Computer Systems Design Services
  '541611',    // Administrative Management and General Management Consulting
  '541715',    // R&D in Physical, Engineering, and Life Sciences
  '541714',    // R&D in Biotechnology
  '511210',    // Software Publishers (2017 NAICS)
  '513210',    // Software Publishers (2022 NAICS)
  '518210',    // Data Processing, Hosting, and Related Services
  '54151S',    // IT Professional Services (GSA MAS SIN)
  '54151HACS', // Highly Adaptive Cybersecurity Services (GSA MAS SIN)
] as const;

export type EnvisionNaicsCode = typeof ENVISION_NAICS[number];

/**
 * Primary competitive NAICS lanes. Per current direction this mirrors the full
 * pursuit profile above (both lists set to the same curated codes).
 */
export const ENVISION_PRIMARY_NAICS = [
  '541330',    // Engineering Services
  '541512',    // Computer Systems Design Services
  '541611',    // Administrative Management and General Management Consulting
  '541715',    // R&D in Physical, Engineering, and Life Sciences
  '541714',    // R&D in Biotechnology
  '511210',    // Software Publishers (2017 NAICS)
  '513210',    // Software Publishers (2022 NAICS)
  '518210',    // Data Processing, Hosting, and Related Services
  '54151S',    // IT Professional Services (GSA MAS SIN)
  '54151HACS', // Highly Adaptive Cybersecurity Services (GSA MAS SIN)
] as const;

/** String used in AI prompts -- top relevant codes */
export const ENVISION_NAICS_PROMPT_SUMMARY =
  'NAICS 541330 (Engineering), 541512 (Computer Systems Design), 541611 (Management Consulting), ' +
  '541715/541714 (R&D), 511210/513210 (Software Publishers), 518210 (Data Processing/Hosting), ' +
  'GSA MAS 54151S (IT Professional Services), 54151HACS (Highly Adaptive Cybersecurity)';

/** Envision company context string for AI prompts */
export const ENVISION_COMPANY_CONTEXT =
  'Envision is a Service-Disabled Veteran-Owned Small Business (SDVOSB) competing for federal ' +
  'defense and civilian contracts across engineering services, IT/software development, ' +
  'data processing and hosting, R&D, and management consulting. Contract vehicles include ' +
  'GSA MAS (IT Professional Services 54151S, Highly Adaptive Cybersecurity 54151HACS). ' +
  'Primary customers: DoD, Army, Navy, DHS, FAA, GSA. Based in the DC metro area.';
