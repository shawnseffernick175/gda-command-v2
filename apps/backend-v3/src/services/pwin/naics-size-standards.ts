/**
 * SBA size-standards lookup for NAICS codes.
 *
 * Envision / GDA company-size constants (hard-coded):
 *   - ENVISION_EMPLOYEE_COUNT = 200
 *   - ENVISION_AVG_ANNUAL_RECEIPTS_M = 60  ($60 M; exceeds the SBA
 *     receipts cap of $47 M, so Envision is LARGE under every
 *     receipts-based NAICS)
 */

/** Envision headcount — used to compare against employee-based SBA thresholds. */
export const ENVISION_EMPLOYEE_COUNT = 200;

/** Envision average annual receipts in millions of dollars. */
export const ENVISION_AVG_ANNUAL_RECEIPTS_M = 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SbaStandardType = 'employees' | 'receipts';

export interface NaicsSizeStandard {
  code: string;
  standardType: SbaStandardType;
  threshold: number;
  description?: string;
}

// ---------------------------------------------------------------------------
// Static map — seeded from the official SBA Table of Size Standards.
// Only codes we are confident about are included; omitted codes resolve
// to "unknown" at runtime.
// ---------------------------------------------------------------------------

export const NAICS_SIZE_STANDARDS: Record<string, NaicsSizeStandard> = {
  '541715': { code: '541715', standardType: 'employees', threshold: 1000, description: 'R&D Physical/Engineering/Life Sciences (exc Nano/Biotech)' },
  '334419': { code: '334419', standardType: 'employees', threshold: 750, description: 'Other Electronic Component Manufacturing' },
  '333310': { code: '333310', standardType: 'employees', threshold: 1000, description: 'Commercial and Service Industry Machinery Manufacturing' },
  '334511': { code: '334511', standardType: 'employees', threshold: 1350, description: 'Search/Detection/Navigation/Guidance/Aero/Nautical Systems & Instruments' },
  '336992': { code: '336992', standardType: 'employees', threshold: 1500, description: 'Military Armored Vehicle, Tank & Tank Component Manufacturing' },
  '335313': { code: '335313', standardType: 'employees', threshold: 1250, description: 'Switchgear and Switchboard Apparatus Manufacturing' },
  '221122': { code: '221122', standardType: 'employees', threshold: 1100, description: 'Electric Power Distribution' },
  '561210': { code: '561210', standardType: 'receipts', threshold: 47.0, description: 'Facilities Support Services' },
  '541990': { code: '541990', standardType: 'receipts', threshold: 19.5, description: 'All Other Professional, Scientific and Technical Services' },
  '541330': { code: '541330', standardType: 'receipts', threshold: 25.5, description: 'Engineering Services' },
  '541512': { code: '541512', standardType: 'receipts', threshold: 34.0, description: 'Computer Systems Design Services' },
  '541511': { code: '541511', standardType: 'receipts', threshold: 34.0, description: 'Custom Computer Programming Services' },
  '541513': { code: '541513', standardType: 'receipts', threshold: 34.0, description: 'Computer Facilities Management Services' },
  '541519': { code: '541519', standardType: 'receipts', threshold: 34.0, description: 'Other Computer Related Services' },
  '541611': { code: '541611', standardType: 'receipts', threshold: 24.5, description: 'Administrative Management & General Management Consulting' },
  '541618': { code: '541618', standardType: 'receipts', threshold: 19.5, description: 'Other Management Consulting Services' },
  '541713': { code: '541713', standardType: 'employees', threshold: 1000, description: 'R&D Nanotechnology' },
  '541714': { code: '541714', standardType: 'employees', threshold: 1000, description: 'R&D Biotechnology (exc Nanobiotech)' },
  '541712': { code: '541712', standardType: 'employees', threshold: 1000, description: 'R&D Physical/Engineering/Life Sciences (legacy, 541715 family)' },
  '333913': { code: '333913', standardType: 'employees', threshold: 500, description: 'Measuring and Dispensing Pump Manufacturing (conservative fallback)' },
  '561110': { code: '561110', standardType: 'receipts', threshold: 12.5, description: 'Office Administrative Services' },
  '561612': { code: '561612', standardType: 'receipts', threshold: 29.0, description: 'Security Guards and Patrol Services' },
  '518210': { code: '518210', standardType: 'receipts', threshold: 40.0, description: 'Computing Infrastructure Providers/Data Processing/Hosting' },
};

// ---------------------------------------------------------------------------
// Runtime lookup
// ---------------------------------------------------------------------------

export interface SizeStatusResult {
  status: 'small' | 'large' | 'unknown';
  standard: NaicsSizeStandard | null;
  rationale: string;
}

export function resolveSizeStatus(naics: string | null | undefined): SizeStatusResult {
  if (!naics || naics.trim() === '') {
    return { status: 'unknown', standard: null, rationale: 'NAICS code not provided' };
  }

  const code = naics.trim().slice(0, 6);
  const standard = NAICS_SIZE_STANDARDS[code] ?? null;

  if (!standard) {
    return { status: 'unknown', standard: null, rationale: 'NAICS not in size-standards map' };
  }

  if (standard.standardType === 'employees') {
    const isSmall = ENVISION_EMPLOYEE_COUNT < standard.threshold;
    return {
      status: isSmall ? 'small' : 'large',
      standard,
      rationale: `${ENVISION_EMPLOYEE_COUNT} employees vs ${standard.threshold}-employee standard → ${isSmall ? 'SMALL' : 'LARGE'}`,
    };
  }

  // receipts-based
  const isSmall = ENVISION_AVG_ANNUAL_RECEIPTS_M < standard.threshold;
  return {
    status: isSmall ? 'small' : 'large',
    standard,
    rationale: `$${ENVISION_AVG_ANNUAL_RECEIPTS_M}M vs $${standard.threshold}M receipts standard → ${isSmall ? 'SMALL' : 'LARGE'}`,
  };
}
