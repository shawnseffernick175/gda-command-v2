/**
 * Department hierarchy mapping — F-606.
 *
 * Maps the flat `agency` field to a top-level cabinet department.
 * Used both during migration backfill and on every insert/upsert.
 */

interface DepartmentRule {
  patterns: string[];
  department: string;
}

const DEPARTMENT_RULES: DepartmentRule[] = [
  {
    department: 'Department of Defense',
    patterns: [
      'Department of Defense',
      'DoD',
      'DEPT OF DEFENSE',
      'Army',
      'Navy',
      'Air Force',
      'Marine Corps',
      'DARPA',
      'DLA',
      'DISA',
      'SOCOM',
    ],
  },
  {
    department: 'Department of Homeland Security',
    patterns: [
      'Department of Homeland Security',
      'DHS',
      'FEMA',
      'CBP',
      'TSA',
      'USCG',
      'Secret Service',
    ],
  },
  {
    department: 'Department of Veterans Affairs',
    patterns: ['Department of Veterans Affairs', 'VA'],
  },
  {
    department: 'Department of Health and Human Services',
    patterns: [
      'Department of Health and Human Services',
      'HHS',
      'NIH',
      'CDC',
      'FDA',
    ],
  },
  {
    department: 'Department of Energy',
    patterns: ['Department of Energy', 'DOE'],
  },
  {
    department: 'Department of Justice',
    patterns: ['Department of Justice', 'DOJ', 'FBI', 'DEA', 'ATF'],
  },
  {
    department: 'Department of State',
    patterns: ['Department of State', 'DOS'],
  },
  {
    department: 'Department of Treasury',
    patterns: ['Department of Treasury', 'Treasury', 'IRS', 'FinCEN'],
  },
  {
    department: 'Department of Transportation',
    patterns: ['Department of Transportation', 'DOT', 'FAA'],
  },
  {
    department: 'Department of Commerce',
    patterns: ['Department of Commerce', 'DOC', 'NIST', 'NOAA', 'Census'],
  },
  {
    department: 'Department of Labor',
    patterns: ['Department of Labor', 'DOL'],
  },
  {
    department: 'Department of Education',
    patterns: ['Department of Education', 'ED'],
  },
  {
    department: 'Department of Agriculture',
    patterns: ['Department of Agriculture', 'USDA'],
  },
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Map an agency string to its parent cabinet department.
 * Tries exact match first (case-insensitive), then word-boundary
 * substring match (prevents false positives from short abbreviations
 * like VA/ED/NIST appearing inside longer words).
 * Returns 'Independent Agency' if no rule matches.
 */
export function mapAgencyToDepartment(agency: string | null | undefined): string {
  if (!agency) return 'Independent Agency';

  const lower = agency.toLowerCase();

  // Exact match pass
  for (const rule of DEPARTMENT_RULES) {
    for (const pattern of rule.patterns) {
      if (lower === pattern.toLowerCase()) {
        return rule.department;
      }
    }
  }

  // Word-boundary substring match pass
  for (const rule of DEPARTMENT_RULES) {
    for (const pattern of rule.patterns) {
      const re = new RegExp('\\b' + escapeRegex(pattern) + '\\b', 'i');
      if (re.test(agency)) {
        return rule.department;
      }
    }
  }

  return 'Independent Agency';
}
