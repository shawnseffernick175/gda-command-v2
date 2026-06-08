/**
 * Federal org hierarchy parser -- normalizes SAM.gov org path strings
 * into a clean Department / Agency / Office / Contracting Office hierarchy.
 */

import { mapAgencyToDepartment } from './departmentMap.js';

export interface ParsedOrg {
  department_name: string | null;
  agency_name: string | null;
  office: string | null;
  contracting_office: string | null;
  org_path: string | null;
}

const ACRONYMS = new Set([
  'DOD', 'NAVSUP', 'AMC', 'ACC', 'MICC', 'NIH', 'CDC', 'FDA',
  'FBI', 'DEA', 'ATF', 'FAA', 'NIST', 'NOAA', 'IRS', 'TSA',
  'CBP', 'FEMA', 'USCG', 'VA', 'WSS', 'DLA', 'DISA', 'SOCOM',
  'DARPA', 'NASA', 'EPA', 'GSA', 'SBA', 'OPM', 'USACE', 'NGA',
  'NRO', 'NSA', 'DCMA', 'DCSA', 'DTRA', 'MDA', 'DFAS', 'NAWCAD',
  'NAWCWD', 'NAVFAC', 'SPAWAR', 'NSWC', 'SSC', 'PEO', 'USMC',
  'AFMC', 'AFLCMC', 'AFICC', 'AFRL', 'HQ', 'US', 'U.S.', 'USA',
  'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII',
]);

const PARENTHETICAL_CODE_RE = /\s*\([A-Z0-9]{3,}\)$/;

/**
 * Title-case an ALL-CAPS SAM string, preserving known acronyms.
 * Handles "DEPT OF THE NAVY" -> "Department of the Navy", etc.
 */
export function titleCaseFederal(input: string): string {
  const SMALL_WORDS = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);

  // Special case: "DEPT OF" -> "Department of"
  let s = input.replace(/\bDEPT\b/gi, 'Department');

  // Special case: "U.S." prefix and "US " prefix
  s = s.replace(/\bUS\s/g, 'U.S. ');

  return s
    .split(/\s+/)
    .map((word, idx) => {
      const upper = word.toUpperCase();
      // Preserve known acronyms
      if (ACRONYMS.has(upper)) return upper;
      // Already mixed-case token like "U.S." -- keep it
      if (word === 'U.S.') return word;
      if (word === 'Department') return word;

      const lower = word.toLowerCase();
      // Small words are lowercase unless first word
      if (idx > 0 && SMALL_WORDS.has(lower)) return lower;

      // Standard title-case
      if (word.length === 0) return word;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/**
 * Parse raw federal org fields into a clean hierarchy.
 * Designed for SAM.gov data where:
 *   - agency = top-level department NAME (e.g. "DEPT OF DEFENSE")
 *   - sub_agency = slash-delimited path below the department
 *   - department = numeric code (ignored for display)
 */
export function parseFederalOrg(input: {
  agency?: string | null;
  sub_agency?: string | null;
  department?: string | null;
}): ParsedOrg {
  const rawAgency = input.agency?.trim() || null;
  const rawSubAgency = input.sub_agency?.trim() || null;

  if (!rawAgency && !rawSubAgency) {
    return {
      department_name: null,
      agency_name: null,
      office: null,
      contracting_office: null,
      org_path: null,
    };
  }

  // Build ordered list of path segments
  const segments: string[] = [];

  if (rawAgency) {
    segments.push(rawAgency);
  }

  if (rawSubAgency) {
    // Sub-agency may be slash-delimited (SAM) or dot-delimited
    const delimiter = rawSubAgency.includes('/') ? '/' : rawSubAgency.includes('.') ? '.' : '/';
    const parts = rawSubAgency.split(delimiter);
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.length > 0) {
        segments.push(trimmed);
      }
    }
  }

  if (segments.length === 0) {
    return {
      department_name: null,
      agency_name: null,
      office: null,
      contracting_office: null,
      org_path: null,
    };
  }

  // Clean segments: strip trailing parenthetical codes, title-case
  const cleaned = segments.map((seg) => {
    const stripped = seg.replace(PARENTHETICAL_CODE_RE, '').trim();
    return titleCaseFederal(stripped);
  });

  // department_name: normalize segment[0] via mapAgencyToDepartment
  const deptMapped = mapAgencyToDepartment(segments[0]);
  let department_name: string | null;
  if (deptMapped === 'Independent Agency') {
    department_name = cleaned[0] ?? null;
  } else {
    department_name = deptMapped;
  }

  // agency_name: segment[1] if present
  const agency_name = cleaned.length > 1 ? (cleaned[1] ?? null) : null;

  // contracting_office: last segment when >= 3 segments; if exactly 2, same as agency
  let contracting_office: string | null = null;
  let office: string | null = null;

  if (cleaned.length >= 3) {
    contracting_office = cleaned[cleaned.length - 1] ?? null;
    // office: pick segment[-2] (second to last) when >= 4 segments
    if (cleaned.length >= 4) {
      office = cleaned[cleaned.length - 2] ?? null;
    }
  } else if (cleaned.length === 2) {
    contracting_office = cleaned[1] ?? null;
  }

  const org_path = cleaned.join(' / ');

  return {
    department_name,
    agency_name,
    office,
    contracting_office,
    org_path,
  };
}
